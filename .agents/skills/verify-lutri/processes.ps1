param(
    [ValidateSet('identify', 'check', 'stop', 'idle')] [string] $Action,
    [int] $LauncherPid,
    [string] $StartedAt,
    [string] $NodeExe,
    [string] $ConfigPath,
    [string] $AppExe,
    [int] $DevPort,
    [int] $DebugPort
)

$ErrorActionPreference = 'Stop'
function Get-ProcessRow([int] $ProcessId) {
    Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId"
}

function Get-Listeners {
    Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in $DevPort, $DebugPort }
}

if ($Action -eq 'idle') {
    $apps = Get-CimInstance Win32_Process -Filter "Name='lutri.exe'" | Where-Object { $_.ExecutablePath -eq $AppExe }
    if ($apps -or (Get-Listeners)) { throw 'Verify ports or the verify app are still active. Profiles were kept.' }
    return
}

$root = Get-ProcessRow $LauncherPid
if (!$root) {
    if ($Action -eq 'stop') { return }
    throw 'The recorded launcher is no longer running.'
}
$stamp = $root.CreationDate.ToUniversalTime().Ticks.ToString()
if ($Action -ne 'identify' -and $stamp -cne $StartedAt) {
    if ($Action -eq 'stop' -and $StartedAt -match '^\d+$') { return } # PID has been reused.
    throw 'The launcher creation time does not match the run record.'
}
$configArgument = '(?:^|\s)--config\s+(?:"' + [regex]::Escape($ConfigPath) + '"|' + [regex]::Escape($ConfigPath) + ')(?:\s|$)'
if ($root.ExecutablePath -ne $NodeExe -or $root.CommandLine -notmatch $configArgument) {
    throw 'The recorded process is not the verify launcher for this checkout.'
}
if ($Action -eq 'identify') { $stamp; return }

function Assert-ListenerOwner($Listener) {
    $row = Get-ProcessRow $Listener.OwningProcess
    $seenApp = $false
    while ($row) {
        if ($row.ExecutablePath -eq $AppExe) { $seenApp = $true }
        if ($row.ProcessId -eq $LauncherPid -and $row.CreationDate -eq $root.CreationDate) {
            if ($Listener.LocalPort -eq $DevPort -or $seenApp) { return }
            break
        }
        $parent = Get-ProcessRow $row.ParentProcessId
        if (!$parent -or $parent.ProcessId -eq $row.ProcessId -or $parent.CreationDate -gt $row.CreationDate) { break }
        $row = $parent
    }
    throw "Port $($Listener.LocalPort) does not belong to the recorded verify run."
}

$listeners = @(Get-Listeners)
foreach ($listener in $listeners) { Assert-ListenerOwner $listener }
if ($Action -eq 'check') {
    foreach ($port in $DevPort, $DebugPort) {
        if ($port -notin $listeners.LocalPort) { throw "Missing verify listener on port $port." }
    }
    return
}

# Keep a handle to this exact process while taskkill works on its tree.
$process = [System.Diagnostics.Process]::GetProcessById($LauncherPid)
try {
    $null = $process.Handle
    $current = Get-ProcessRow $LauncherPid
    if (!$current -or $current.CreationDate -ne $root.CreationDate -or $process.HasExited) { return }
    & taskkill.exe /PID $LauncherPid /T /F | Out-Null
    if ($LASTEXITCODE -ne 0 -and !$process.HasExited) { throw 'Could not stop the verify process tree.' }
} finally {
    $process.Dispose()
}
