# Windows PowerShell 5.1 integration contract, disposable GitHub runner only.
# Temporarily changes the runner audit policy and restores it in finally.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Run only on a disposable GitHub Actions Windows runner.' }
$folder = Join-Path ([IO.Path]::GetTempPath()) ('lm-metering-test-' + [Guid]::NewGuid())
[void][IO.Directory]::CreateDirectory($folder)
$backup = Join-Path $folder 'audit.csv'
$collector = (Resolve-Path (Join-Path $PSScriptRoot '../public/connectors/Collect-LicenseMeterUsage.ps1')).Path
$tokens = $null; $errors = $null
[void][Management.Automation.Language.Parser]::ParseFile($collector, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Collector has PowerShell syntax errors.' }
& auditpol.exe /backup "/file:$backup" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot back up test runner audit policy.' }
$previousData = $env:ProgramData
$env:ProgramData = $folder
function Read-Collector([string]$Culture) {
    # Set the child's culture, including its calendar/time separator.
    $command = "[Threading.Thread]::CurrentThread.CurrentCulture = [Globalization.CultureInfo]::GetCultureInfo('$Culture'); & '$($collector.Replace("'", "''"))'"
    $output = (& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command $command | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $output.Length -gt 2048) { throw 'Collector violated exit/output limit.' }
    $value = $output | ConvertFrom-Json
    $keys = @($value.PSObject.Properties.Name | Sort-Object) -join ','
    if ($keys -ne 'apps,catalog,end,health,start,v' -or $value.v -ne 1 -or $value.catalog -ne 'windows-v1' -or $value.apps.Count -ne 6) { throw 'Collector violated JSON contract.' }
    foreach ($entry in $value.apps) { if ($entry.Count -ne 2) { throw 'Application entry is not a pair.' } }
    foreach ($date in @($value.start, $value.end)) { if ($date -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$') { throw 'Date is not invariant UTC.' } }
    return $value
}
try {
    & auditpol.exe /set '/subcategory:{0CCE922B-69AE-11D9-BED3-505054503030}' /success:enable | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Cannot enable test runner process auditing.' }
    $first = Read-Collector 'en-US'
    if ($first.health -ne 'ok') { throw "First collection unhealthy: $($first.health)" }
    $fakeApplication = Join-Path $folder 'VISIO.EXE'
    Copy-Item (Join-Path $env:SystemRoot 'System32/cmd.exe') $fakeApplication
    Start-Process -FilePath $fakeApplication -ArgumentList '/c', 'exit', '0' -Wait -WindowStyle Hidden
    foreach ($culture in @('fi-FI', 'ar-SA')) {
        $result = Read-Collector $culture
        if ($result.health -ne 'ok') { throw "Collection unhealthy: $($result.health)" }
        $launch = $null
        foreach ($entry in $result.apps) { if ($entry[0] -eq 'visio') { $launch = $entry[1] } }
        if (-not $launch) { throw 'Known process launch was not collected.' }
    }
    # An intact bookmark retains coverage across a weekend-sized time interval.
    $stateFile = Join-Path $folder 'LicenseMeter/Metering/usage-v1.json'
    $state = Get-Content $stateFile -Raw | ConvertFrom-Json
    $invariant = [Globalization.CultureInfo]::InvariantCulture
    $state.start = [DateTime]::UtcNow.AddDays(-90).ToString('yyyy-MM-ddTHH:mm:ssZ', $invariant)
    $state.end = [DateTime]::UtcNow.AddDays(-4).ToString('yyyy-MM-ddTHH:mm:ssZ', $invariant)
    $expectedStart = $state.start
    $state | ConvertTo-Json -Depth 5 -Compress | Set-Content $stateFile
    $weekend = Read-Collector 'en-US'
    if ($weekend.health -ne 'ok' -or $weekend.start -ne $expectedStart) { throw 'Intact bookmark lost weekend coverage.' }
    & auditpol.exe /set '/subcategory:{0CCE922B-69AE-11D9-BED3-505054503030}' /success:disable | Out-Null
    $disabled = Read-Collector 'en-US'
    if ($disabled.health -ne 'audit_disabled') { throw 'Disabled auditing was not reported.' }
    if (Test-Path $stateFile) { throw 'Disabled audit checkpoint was retained.' }
    Write-Output 'Windows PowerShell 5.1 collector: syntax, launch evidence, locale, continuity and disabled-audit checks passed.'
} finally {
    $env:ProgramData = $previousData
    & auditpol.exe /restore "/file:$backup" | Out-Null
    Remove-Item $folder -Recurse -Force
}
