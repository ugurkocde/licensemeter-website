# Windows PowerShell 5.1 integration contract, disposable GitHub runner only.
# Temporarily changes the runner audit policy and restores it in finally.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Run only on a disposable GitHub Actions Windows runner.' }
$folder = Join-Path ([IO.Path]::GetTempPath()) ('lm-metering-test-' + [Guid]::NewGuid())
[void][IO.Directory]::CreateDirectory($folder)
$backup = Join-Path $folder 'audit.csv'
$template = (Resolve-Path (Join-Path $PSScriptRoot '../src/server/metering/Collect-LicenseMeterUsage.template.ps1')).Path
# Generate a collector the way the server does: a catalog id and a program list.
function New-Collector([string]$Id, [string[]]$Programs) {
    $list = ($Programs | ForEach-Object { "'$_'" }) -join ','
    $source = [IO.File]::ReadAllText($template).Replace("`$CatalogId = 'LM_CATALOG_ID'", "`$CatalogId = '$Id'").Replace("`$Programs = @('LM_PROGRAMS')", "`$Programs = @($list)")
    if ($source.Contains('LM_PROGRAMS') -or $source.Contains('LM_CATALOG_ID')) { throw 'Template placeholders changed.' }
    $path = Join-Path $folder "collector-$Id.ps1"
    [IO.File]::WriteAllText($path, $source, (New-Object Text.ASCIIEncoding))
    $tokens = $null; $errors = $null
    [void][Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors)
    if ($errors.Count) { throw 'Collector has PowerShell syntax errors.' }
    return $path
}
$first = New-Collector 'a0000001' @('visio.exe', 'whoami.exe')
$second = New-Collector 'a0000002' @('whoami.exe', 'hostname.exe')
& auditpol.exe /backup "/file:$backup" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot back up test runner audit policy.' }
$previousData = $env:ProgramData
$env:ProgramData = $folder
function Read-Collector([string]$Collector, [string]$Culture) {
    # Set the child's culture, including its calendar/time separator.
    $command = "[Threading.Thread]::CurrentThread.CurrentCulture = [Globalization.CultureInfo]::GetCultureInfo('$Culture'); & '$($Collector.Replace("'", "''"))'"
    $output = (& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command $command | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $output.Length -gt 2048) { throw 'Collector violated exit/output limit.' }
    $value = $output | ConvertFrom-Json
    $keys = @($value.PSObject.Properties.Name | Where-Object { $_ -notin @('w', 't') } | Sort-Object) -join ','
    if ($keys -ne 'a,c,e,h,s,v' -or $value.v -ne 2 -or $value.c -notmatch '^[0-9a-f]{8}$') { throw "Collector violated JSON contract: $output" }
    foreach ($entry in @($value.a)) {
        if ($entry.Count -ne 3 -or $entry[0] -notmatch '^[a-z0-9 ._+()&-]+\.exe$' -or $entry[1] -lt 0 -or $entry[2] -lt 0) { throw 'Program entry violated the contract.' }
    }
    foreach ($date in @($value.s, $value.e)) { if ($date -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$') { throw 'Date is not invariant UTC.' } }
    return $value
}
function Find-Entry($Report, [string]$Program) {
    foreach ($entry in @($Report.a)) { if ($entry[0] -eq $Program) { return $entry } }
    return $null
}
try {
    & auditpol.exe /set '/subcategory:{0CCE922B-69AE-11D9-BED3-505054503030}' /success:enable | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Cannot enable test runner process auditing.' }
    $initial = Read-Collector $first 'en-US'
    if ($initial.h -ne 'ok' -or @($initial.a).Count -ne 0) { throw "First collection unhealthy or not empty: $($initial.h)" }
    $fakeApplication = Join-Path $folder 'VISIO.EXE'
    Copy-Item (Join-Path $env:SystemRoot 'System32/cmd.exe') $fakeApplication
    Start-Process -FilePath $fakeApplication -ArgumentList '/c', 'exit', '0' -Wait -WindowStyle Hidden
    1..3 | ForEach-Object { & whoami.exe | Out-Null }
    foreach ($culture in @('fi-FI', 'ar-SA')) {
        $result = Read-Collector $first $culture
        if ($result.h -ne 'ok') { throw "Collection unhealthy: $($result.h)" }
        $visio = Find-Entry $result 'visio.exe'
        if (-not $visio -or $visio[2] -lt 1) { throw 'Known program start was not collected.' }
        $whoami = Find-Entry $result 'whoami.exe'
        if (-not $whoami -or $whoami[2] -lt 3) { throw 'Program starts were not counted.' }
    }
    # A new app list keeps coverage, forgets removed programs and watches new ones from now.
    $updated = Read-Collector $second 'en-US'
    if ($updated.c -ne 'a0000002' -or $updated.s -ne $result.s) { throw 'App list update lost coverage.' }
    if (Find-Entry $updated 'visio.exe') { throw 'A removed program was still reported.' }
    if (-not $updated.w -or -not $updated.w.'hostname.exe') { throw 'A new program has no watch start.' }
    # Two overlapping runs, as Intune can start on demand and on schedule: both succeed.
    $jobs = 1..2 | ForEach-Object { Start-Job -ScriptBlock { param($Path, $Data) $env:ProgramData = $Data; (& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $Path | Out-String).Trim() } -ArgumentList $second, $folder }
    foreach ($output in @($jobs | Wait-Job | Receive-Job)) {
        if (($output | ConvertFrom-Json).h -ne 'ok') { throw "Overlapping run failed: $output" }
    }
    $jobs | Remove-Job
    # An intact bookmark retains coverage across a weekend-sized time interval.
    $stateFile = Join-Path $folder 'LicenseMeter/Metering/usage-v2.json'
    $state = Get-Content $stateFile -Raw | ConvertFrom-Json
    $invariant = [Globalization.CultureInfo]::InvariantCulture
    $state.start = [DateTime]::UtcNow.AddDays(-90).ToString('yyyy-MM-ddTHH:mm:ssZ', $invariant)
    $state.end = [DateTime]::UtcNow.AddDays(-4).ToString('yyyy-MM-ddTHH:mm:ssZ', $invariant)
    $expectedStart = $state.start
    $state | ConvertTo-Json -Depth 6 -Compress | Set-Content $stateFile
    $weekend = Read-Collector $second 'en-US'
    if ($weekend.h -ne 'ok' -or $weekend.s -ne $expectedStart) { throw 'Intact bookmark lost weekend coverage.' }
    & auditpol.exe /set '/subcategory:{0CCE922B-69AE-11D9-BED3-505054503030}' /success:disable | Out-Null
    $disabled = Read-Collector $second 'en-US'
    if ($disabled.h -ne 'audit_disabled' -or @($disabled.a).Count -ne 0) { throw 'Disabled auditing was not reported.' }
    if (Test-Path $stateFile) { throw 'Disabled audit checkpoint was retained.' }
    Write-Output 'Windows PowerShell 5.1 collector: syntax, start evidence and counts, locale, app list update, continuity and disabled-audit checks passed.'
} finally {
    $env:ProgramData = $previousData
    & auditpol.exe /restore "/file:$backup" | Out-Null
    Remove-Item $folder -Recurse -Force
}
