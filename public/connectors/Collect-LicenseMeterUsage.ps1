#Requires -Version 5.1
<#
LicenseMeter Windows usage collector, protocol 1 / windows-v1.
Deploy as an Intune Remediations DETECTION-only script, SYSTEM, 64-bit, daily.
Enable Audit Process Creation (Success) separately through approved policy.
Does not configure auditing, contact a network endpoint, or collect user names,
command lines, document paths or raw events. Writes only its own local checkpoint.
Output describes process launches, not foreground use, installation or licensing.
See https://docs.licensemeter.com/connectors/windows-metering/
#>
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$now = [DateTime]::UtcNow
$stamp = $now.ToString('yyyy-MM-ddTHH:mm:ssZ', [Globalization.CultureInfo]::InvariantCulture)
$apps = [ordered]@{
    visio = 'VISIO.EXE'
    project = 'WINPROJ.EXE'
    photoshop = 'Photoshop.exe'
    illustrator = 'Illustrator.exe'
    indesign = 'InDesign.exe'
    solidworks = 'SLDWORKS.exe'
}
$seen = @{}
foreach ($key in $apps.Keys) { $seen[$key] = $null }
$coverage = $stamp
$health = 'collector_error'
$mutex = $null
$held = $false
$stateFile = $null

function Assert-NoReparsePoint([string]$Path) {
    if ((Test-Path -LiteralPath $Path) -and ((Get-Item -LiteralPath $Path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Refusing a redirected state path.'
    }
}

try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator access required.' }
    $mutex = New-Object Threading.Mutex($false, 'Global\LicenseMeterUsageV1')
    try { $held = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $held = $true }
    if (-not $held) { throw 'Collector already running.' }

    # Locale-independent audit policy check. No policy changes are made.
    if (-not ('LicenseMeterAuditPolicy' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LicenseMeterAuditPolicy {
    [StructLayout(LayoutKind.Sequential)]
    public struct Info { public Guid Subcategory; public uint Options; public Guid Category; }
    [DllImport("advapi32.dll", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool AuditQuerySystemPolicy(ref Guid id, uint count, out IntPtr result);
    [DllImport("advapi32.dll")] public static extern void AuditFree(IntPtr buffer);
    public static bool CreationEnabled() {
        Guid id = new Guid("0CCE922B-69AE-11D9-BED3-505054503030");
        IntPtr result;
        if (!AuditQuerySystemPolicy(ref id, 1, out result)) throw new InvalidOperationException("Audit policy unavailable");
        try { return (((Info)Marshal.PtrToStructure(result, typeof(Info))).Options & 1) != 0; }
        finally { AuditFree(result); }
    }
}
'@
    }
    $root = Join-Path $env:ProgramData 'LicenseMeter'
    $folder = Join-Path $root 'Metering'
    foreach ($path in @($root, $folder)) {
        Assert-NoReparsePoint $path
        [void][IO.Directory]::CreateDirectory($path)
        $acl = New-Object Security.AccessControl.DirectorySecurity
        $acl.SetAccessRuleProtection($true, $false)
        foreach ($sid in @('S-1-5-18', 'S-1-5-32-544')) {
            $account = New-Object Security.Principal.SecurityIdentifier($sid)
            $rule = New-Object Security.AccessControl.FileSystemAccessRule($account, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
            $acl.AddAccessRule($rule)
        }
        Set-Acl -LiteralPath $path -AclObject $acl
    }
    $stateFile = Join-Path $folder 'usage-v1.json'
    Assert-NoReparsePoint $stateFile
    $health = 'ok'
    $previous = $null
    if (Test-Path -LiteralPath $stateFile) {
        try {
            if ((Get-Item -LiteralPath $stateFile).Length -gt 16384) { throw 'Oversize state' }
            $previous = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
            if ($previous.version -ne 1 -or $previous.catalog -ne 'windows-v1' -or -not $previous.record -or [long]$previous.record -lt 1) { throw 'Invalid checkpoint' }
            $priorStart = [DateTime]::Parse($previous.start, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
            $priorEnd = [DateTime]::Parse($previous.end, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
            if ($priorStart -gt $priorEnd -or $priorEnd -gt $now) { throw 'Coverage gap' }
            $coverage = $priorStart.ToString('yyyy-MM-ddTHH:mm:ssZ', [Globalization.CultureInfo]::InvariantCulture)
            foreach ($key in $apps.Keys) {
                $value = $previous.seen.$key
                if ($null -ne $value) {
                    $last = [DateTime]::Parse($value, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
                    if ($last -gt $now) { throw 'Invalid last seen' }
                    $seen[$key] = $last.ToString('yyyy-MM-ddTHH:mm:ssZ', [Globalization.CultureInfo]::InvariantCulture)
                }
            }
        } catch {
            $previous = $null
            $coverage = $stamp
            $health = 'log_gap'
            foreach ($key in $apps.Keys) { $seen[$key] = $null }
        }
    }
    if (-not [LicenseMeterAuditPolicy]::CreationEnabled()) {
        $health = 'audit_disabled'
        if (Test-Path -LiteralPath $stateFile) { Remove-Item -LiteralPath $stateFile -Force }
    } else {
        $newest = Get-WinEvent -LogName Security -MaxEvents 1
        # Capture the report time AFTER the upper bookmark. Otherwise launches
        # during initialization could be skipped while their bookmark advances.
        $now = [DateTime]::UtcNow
        $stamp = $now.ToString('yyyy-MM-ddTHH:mm:ssZ', [Globalization.CultureInfo]::InvariantCulture)
        if (-not $previous) { $coverage = $stamp }
        $upper = [long]$newest.RecordId
        $lower = $upper # First run establishes coverage now, never backdates it.
        if ($previous) {
            $checkpoint = [long]$previous.record
            $boundary = @(Get-WinEvent -LogName Security -FilterXPath "*[System[EventRecordID=$checkpoint]]" -MaxEvents 1 -ErrorAction SilentlyContinue)
            if ($checkpoint -gt $upper -or $boundary.Count -ne 1 -or $boundary[0].TimeCreated.ToUniversalTime().Ticks.ToString() -ne $previous.recordTime) {
                $coverage = $stamp
                $health = 'log_reset'
            } else { $lower = $checkpoint }
        }
        if ($lower -lt $upper) {
            $xpath = "*[System[(EventID=4688 or EventID=4719) and EventRecordID > $lower and EventRecordID <= $upper]]"
            $query = New-Object Diagnostics.Eventing.Reader.EventLogQuery('Security', [Diagnostics.Eventing.Reader.PathType]::LogName, $xpath)
            $reader = New-Object Diagnostics.Eventing.Reader.EventLogReader($query)
            $processed = 0
            try {
                while ($null -ne ($event = $reader.ReadEvent())) {
                    try {
                        $processed++
                        if ($processed -gt 100000 -or ([DateTime]::UtcNow - $now).TotalSeconds -gt 90) {
                            # Advance the upper checkpoint with an explicit gap so a
                            # busy device can recover on its next scheduled run.
                            $coverage = $stamp; $health = 'log_gap'; break
                        }
                        [xml]$xml = $event.ToXml()
                        $fields = @{}
                        foreach ($field in $xml.Event.EventData.Data) { $fields[$field.Name] = [string]$field.'#text' }
                        if ($event.Id -eq 4719 -and $fields['SubcategoryGuid'] -eq '{0CCE922B-69AE-11D9-BED3-505054503030}') {
                            $coverage = $stamp
                            $health = 'log_gap'
                        }
                        if ($event.Id -eq 4688) {
                            $exe = [IO.Path]::GetFileName($fields['NewProcessName'])
                            foreach ($key in $apps.Keys) {
                                if ($exe -ieq $apps[$key]) {
                                    $observed = $event.TimeCreated.ToUniversalTime()
                                    if ($observed -le $now -and ($null -eq $seen[$key] -or $observed -gt [DateTime]::Parse($seen[$key], [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime())) {
                                        $seen[$key] = $observed.ToString('yyyy-MM-ddTHH:mm:ssZ', [Globalization.CultureInfo]::InvariantCulture)
                                    }
                                }
                            }
                        }
                    } finally { $event.Dispose() }
                }
            } finally { $reader.Dispose() }
            # Detect rollover during collection as well as between runs.
            $oldest = Get-WinEvent -LogName Security -Oldest -MaxEvents 1
            if ([long]$oldest.RecordId -gt ($lower + 1)) { $coverage = $stamp; $health = 'log_gap' }
        }
        $checkpointState = @{ version = 1; catalog = 'windows-v1'; start = $coverage; end = $stamp; record = $upper; recordTime = $newest.TimeCreated.ToUniversalTime().Ticks.ToString(); seen = $seen }
        $temp = Join-Path $folder ('usage-' + [Guid]::NewGuid().ToString() + '.tmp')
        try {
            [IO.File]::WriteAllText($temp, ($checkpointState | ConvertTo-Json -Depth 5 -Compress), (New-Object Text.UTF8Encoding($false)))
            Move-Item -LiteralPath $temp -Destination $stateFile -Force
        } finally { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force } }
    }
} catch {
    $health = 'collector_error'
    $coverage = $stamp
    # No raw exception, event data or paths are ever returned to Intune.
} finally {
    if ($held) { $mutex.ReleaseMutex() }
    if ($null -ne $mutex) { $mutex.Dispose() }
}
$entries = @()
foreach ($key in $apps.Keys) { $entries += ,@($key, $seen[$key]) }
$output = @{ v = 1; catalog = 'windows-v1'; start = $coverage; end = $stamp; health = $health; apps = $entries } | ConvertTo-Json -Depth 5 -Compress
if ($output.Length -gt 2048) {
    # This fixed catalogue is bounded; never emit truncated evidence.
    Write-Output '{"v":1,"error":"output_too_large"}'
} else { Write-Output $output }
exit 0
