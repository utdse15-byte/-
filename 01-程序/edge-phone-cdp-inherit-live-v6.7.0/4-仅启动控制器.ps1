$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Here

function Stop-OldControllerOnPort {
    param([int]$Port)
    $Connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    $Handled = @{}
    foreach ($Connection in @($Connections)) {
        if ($Handled.ContainsKey([int]$Connection.OwningProcess)) { continue }
        $Handled[[int]$Connection.OwningProcess] = $true
        $ProcessInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($Connection.OwningProcess)" -ErrorAction SilentlyContinue
        $CommandLine = [string]$ProcessInfo.CommandLine
        $IsNodeServer = $ProcessInfo.Name -match '^node(\.exe)?$' -and
            $CommandLine.IndexOf('server.js', [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
            ($CommandLine.IndexOf($Here, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or $CommandLine -match '(?i)edge-phone-cdp')
        $HealthMatches = $false
        try {
            $Health = Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 2
            $HealthMatches = $Health.ok -eq $true -and $Health.service -eq 'edge-phone-cdp-controller' -and [int]$Health.pid -eq [int]$Connection.OwningProcess
        } catch {}
        $IsThisController = $IsNodeServer -or $HealthMatches
        if ($IsThisController) {
            Write-Host "正在停止旧版或重复运行的控制器 PID $($Connection.OwningProcess)..." -ForegroundColor Yellow
            Stop-Process -Id $Connection.OwningProcess -Force -ErrorAction Stop
            Start-Sleep -Milliseconds 350
        } else {
            throw "端口 $Port 已被其他程序占用（PID $($Connection.OwningProcess)）。请修改 config.json 的 controllerPort，或先关闭该程序。"
        }
    }
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "没有找到 Node.js。" }
if (-not (Test-Path (Join-Path $Here "node_modules\ws\package.json"))) { throw "请先双击 安装依赖.cmd。" }
$Config = Get-Content (Join-Path $Here "config.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$env:EDGE_USER_DATA_DIR = Join-Path $env:LOCALAPPDATA "Microsoft\Edge\User Data"
$env:EDGE_MANAGED_SESSION = "0"
$env:EDGE_AUTO_RESTART = "0"
Remove-Item Env:EDGE_EXECUTABLE -ErrorAction SilentlyContinue
Remove-Item Env:EDGE_WRAPPER_LAUNCH_AT_MS -ErrorAction SilentlyContinue
$ControllerPort = if ($Config.controllerPort) { [int]$Config.controllerPort } else { 8765 }
Stop-OldControllerOnPort -Port $ControllerPort
$env:PORT = [string]$ControllerPort
Remove-Item Env:CDP_BROWSER_WS -ErrorAction SilentlyContinue
Remove-Item Env:CDP_BASE -ErrorAction SilentlyContinue
Write-Host "仅启动手机控制器，不重启 Edge。" -ForegroundColor Cyan
Write-Host "请确认当前 Edge 已按代理参数启动，并在 edge://inspect/#remote-debugging 允许远程调试。" -ForegroundColor Yellow
& node (Join-Path $Here "server.js")
exit $LASTEXITCODE
