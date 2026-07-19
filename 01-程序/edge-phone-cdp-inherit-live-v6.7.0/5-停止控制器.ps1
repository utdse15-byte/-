$ErrorActionPreference = "Continue"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Config = Get-Content (Join-Path $Here "config.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$Port = if ($Config.controllerPort) { [int]$Config.controllerPort } else { 8765 }
$Connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $Connections) {
    Write-Host "端口 $Port 没有控制器在监听。" -ForegroundColor Yellow
    exit 0
}
$Stopped = 0
$Handled = @{}
foreach ($Connection in @($Connections)) {
    if ($Handled.ContainsKey([int]$Connection.OwningProcess)) { continue }
    $Handled[[int]$Connection.OwningProcess] = $true
    try {
        $ProcessInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($Connection.OwningProcess)" -ErrorAction Stop
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
        if (-not $IsThisController) {
            Write-Host "端口 $Port 由其他程序占用（PID $($Connection.OwningProcess)），没有结束它。" -ForegroundColor Yellow
            continue
        }
        Write-Host "停止 Edge 手机控制器 PID $($Connection.OwningProcess)..." -ForegroundColor Cyan
        Stop-Process -Id $Connection.OwningProcess -Force -ErrorAction Stop
        $Stopped++
    } catch {
        Write-Host $_.Exception.Message -ForegroundColor Red
    }
}
if ($Stopped -gt 0) { Write-Host "控制器已停止。Edge 不会被关闭。" -ForegroundColor Green }
