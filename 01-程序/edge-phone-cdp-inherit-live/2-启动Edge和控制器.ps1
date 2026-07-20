$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Here

function Read-ControllerConfig {
    $ConfigPath = Join-Path $Here "config.json"
    if (-not (Test-Path $ConfigPath)) { throw "找不到 config.json: $ConfigPath" }
    return Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Get-ConfigValue {
    param([object]$Config, [string]$Name, $Default)
    $Property = $Config.PSObject.Properties[$Name]
    if ($null -eq $Property -or $null -eq $Property.Value) { return $Default }
    if ($Property.Value -is [string] -and [string]::IsNullOrWhiteSpace([string]$Property.Value)) { return $Default }
    return $Property.Value
}

function ConvertTo-StrictBool {
    # PowerShell 的 [bool] 把任何非空字符串都当 $true，写成 "false" 的配置会被
    # 悄悄当成开启。只接受明确写法，其余报错并退回默认值。
    param($Value, [bool]$Default, [string]$Name)
    if ($null -eq $Value) { return $Default }
    if ($Value -is [bool]) { return $Value }
    $Text = ([string]$Value).Trim().ToLowerInvariant()
    if ($Text -in @('1', 'true', 'yes', 'on')) { return $true }
    if ($Text -in @('0', 'false', 'no', 'off')) { return $false }
    Write-Host "警告: 配置 $Name 的值 '$Value' 不是有效布尔值，已使用默认值 $Default。请写 true/false。" -ForegroundColor Yellow
    return $Default
}

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
            # /health 有意不返回 pid；能在该端口用本服务名应答的监听进程就是控制器。
            $Health = Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 2
            $HealthMatches = $Health.ok -eq $true -and $Health.service -eq 'edge-phone-cdp-controller'
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

$Config = Read-ControllerConfig
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "没有找到 Node.js。请先双击 安装依赖.cmd。"
}
if (-not (Test-Path (Join-Path $Here "node_modules\ws\package.json"))) {
    throw "尚未安装 ws 依赖。请先双击 安装依赖.cmd。"
}

$ConfiguredEdge = [string](Get-ConfigValue $Config "edgePath" "")
$EdgeCandidates = @()
if (-not [string]::IsNullOrWhiteSpace($ConfiguredEdge)) { $EdgeCandidates += $ConfiguredEdge }
$EdgeCandidates += @(
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)
$Edge = $EdgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Edge) { throw "找不到 Microsoft Edge。请在 config.json 的 edgePath 中填写 msedge.exe 完整路径。" }

$EdgeUserData = Join-Path $env:LOCALAPPDATA "Microsoft\Edge\User Data"
if (-not (Test-Path $EdgeUserData)) { throw "找不到 Edge 用户数据目录: $EdgeUserData" }

foreach ($PolicyPath in @("HKCU:\SOFTWARE\Policies\Microsoft\Edge", "HKLM:\SOFTWARE\Policies\Microsoft\Edge")) {
    try {
        $PolicyValue = (Get-ItemProperty -Path $PolicyPath -Name RemoteDebuggingAllowed -ErrorAction Stop).RemoteDebuggingAllowed
        if ([int]$PolicyValue -eq 0) { throw "RemoteDebuggingAllowed 在 $PolicyPath 中被设为 0。当前策略禁止远程调试。" }
    } catch [System.Management.Automation.ItemNotFoundException] {
    } catch [System.Management.Automation.PSArgumentException] {
    }
}

$ProfileDirectory = [string]$env:EDGE_PROFILE_DIRECTORY
if ([string]::IsNullOrWhiteSpace($ProfileDirectory)) {
    $ProfileDirectory = [string](Get-ConfigValue $Config "profileDirectory" "")
}
if ([string]::IsNullOrWhiteSpace($ProfileDirectory)) {
    $LocalStatePath = Join-Path $EdgeUserData "Local State"
    if (Test-Path $LocalStatePath) {
        try {
            $LocalState = Get-Content $LocalStatePath -Raw -Encoding UTF8 | ConvertFrom-Json
            $ProfileDirectory = [string]$LocalState.profile.last_used
        } catch {
            Write-Host "无法读取上次使用的配置，将尝试 Default。" -ForegroundColor Yellow
        }
    }
}
if ([string]::IsNullOrWhiteSpace($ProfileDirectory)) { $ProfileDirectory = "Default" }

$ProfilePath = Join-Path $EdgeUserData $ProfileDirectory
if (-not (Test-Path $ProfilePath)) {
    Write-Host "未找到配置 $ProfileDirectory，将改用 Default。" -ForegroundColor Yellow
    $ProfileDirectory = "Default"
    $ProfilePath = Join-Path $EdgeUserData $ProfileDirectory
}
if (-not (Test-Path $ProfilePath)) { throw "找不到可用的 Edge 配置目录。可在 edge://version 查看配置文件路径。" }

$ProxyServer = [string](Get-ConfigValue $Config "proxyServer" "http://127.0.0.1:7897")
$HostResolverRules = [string](Get-ConfigValue $Config "hostResolverRules" "MAP * 0.0.0.0, EXCLUDE 127.0.0.1")
$ControllerPort = [int](Get-ConfigValue $Config "controllerPort" 8765)
Stop-OldControllerOnPort -Port $ControllerPort
$CloseExistingEdge = ConvertTo-StrictBool (Get-ConfigValue $Config "closeExistingEdge" $true) $true "closeExistingEdge"
$OpenRemoteDebuggingPage = ConvertTo-StrictBool (Get-ConfigValue $Config "openRemoteDebuggingPage" $true) $true "openRemoteDebuggingPage"
$InitialUrl = [string](Get-ConfigValue $Config "initialUrl" "about:blank")
$AutoRestartEdge = ConvertTo-StrictBool (Get-ConfigValue $Config "autoRestartEdge" $true) $true "autoRestartEdge"
$EdgeRestartCooldownSeconds = [int](Get-ConfigValue $Config "edgeRestartCooldownSeconds" 8)
$EdgeDebugPromptCooldownSeconds = [int](Get-ConfigValue $Config "edgeDebugPromptCooldownSeconds" 30)

Write-Host "Edge 配置: $ProfileDirectory" -ForegroundColor Green
Write-Host "配置路径: $ProfilePath" -ForegroundColor DarkGray
Write-Host "代理: $ProxyServer" -ForegroundColor Cyan
Write-Host "手机控制端口: $ControllerPort" -ForegroundColor Cyan
Write-Host "Edge 意外退出自动重启: $AutoRestartEdge" -ForegroundColor Cyan

try {
    $ProxyUri = [Uri]$ProxyServer
    if ($ProxyUri.Host -in @("127.0.0.1", "localhost", "::1") -and $ProxyUri.Port -gt 0) {
        $ProxyReady = Test-NetConnection -ComputerName $ProxyUri.Host -Port $ProxyUri.Port -InformationLevel Quiet -WarningAction SilentlyContinue
        if ($ProxyReady) {
            Write-Host "本地代理端口已监听。" -ForegroundColor Green
        } else {
            Write-Host "警告: 当前无法连接本地代理 $($ProxyUri.Host):$($ProxyUri.Port)。Edge 会启动，但网页可能无法访问。" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "警告: config.json 中的 proxyServer 不是有效 URI。" -ForegroundColor Yellow
}

if ($CloseExistingEdge) {
    Write-Host "正在关闭现有 Edge，以确保原配置、代理参数和调试状态由本次实例接管..." -ForegroundColor Cyan
    $EdgeProcesses = Get-Process msedge -ErrorAction SilentlyContinue
    if ($EdgeProcesses) {
        foreach ($Process in ($EdgeProcesses | Where-Object { $_.MainWindowHandle -ne 0 })) {
            try { [void]$Process.CloseMainWindow() } catch {}
        }
        for ($i = 0; $i -lt 24; $i++) {
            if (-not (Get-Process msedge -ErrorAction SilentlyContinue)) { break }
            Start-Sleep -Milliseconds 250
        }
        if (Get-Process msedge -ErrorAction SilentlyContinue) {
            # Windows PowerShell 5.1 在 $ErrorActionPreference='Stop' 下会把原生命令
            # 的 stderr 重定向（2>$null）当成终止性错误，taskkill 输出"没有找到进程/
            # 拒绝访问"会让整个启动脚本中断。改用 Stop-Process 并明确忽略失败。
            Stop-Process -Name msedge -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Milliseconds 700
}

$ActivePortFile = Join-Path $EdgeUserData "DevToolsActivePort"
if (Test-Path $ActivePortFile) { Remove-Item $ActivePortFile -Force -ErrorAction SilentlyContinue }

$Arguments = @(
    "--profile-directory=`"$ProfileDirectory`"",
    "--proxy-server=`"$ProxyServer`"",
    "--host-resolver-rules=`"$HostResolverRules`"",
    "--dns-prefetch-disable",
    "--disable-quic",
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window"
)
if ($OpenRemoteDebuggingPage) { $Arguments += "edge://inspect/#remote-debugging" }
if (-not [string]::IsNullOrWhiteSpace($InitialUrl)) { $Arguments += $InitialUrl }

Write-Host "启动继承原 Cookie、登录状态、扩展和收藏夹的 Edge..." -ForegroundColor Cyan
$WrapperLaunchAtMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
Start-Process -FilePath $Edge -ArgumentList $Arguments

$env:EDGE_USER_DATA_DIR = $EdgeUserData
$env:EDGE_EXECUTABLE = $Edge
$env:EDGE_PROFILE_DIRECTORY = $ProfileDirectory
$env:EDGE_PROXY_SERVER = $ProxyServer
$env:EDGE_HOST_RESOLVER_RULES = $HostResolverRules
$env:EDGE_INITIAL_URL = $InitialUrl
$env:EDGE_OPEN_REMOTE_DEBUGGING_PAGE = if ($OpenRemoteDebuggingPage) { "1" } else { "0" }
$env:EDGE_MANAGED_SESSION = "1"
$env:EDGE_AUTO_RESTART = if ($AutoRestartEdge) { "1" } else { "0" }
$env:EDGE_RESTART_COOLDOWN_SECONDS = [string]$EdgeRestartCooldownSeconds
$env:EDGE_DEBUG_PROMPT_COOLDOWN_SECONDS = [string]$EdgeDebugPromptCooldownSeconds
$env:EDGE_WRAPPER_LAUNCH_AT_MS = [string]$WrapperLaunchAtMs
$env:PORT = [string]$ControllerPort
Remove-Item Env:CDP_BROWSER_WS -ErrorAction SilentlyContinue
Remove-Item Env:CDP_BASE -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "控制器现在立即启动，不再卡住等待 DevToolsActivePort。" -ForegroundColor Green
Write-Host "在 Edge 的 edge://inspect/#remote-debugging 页面确认以下选项已勾选:" -ForegroundColor Yellow
Write-Host "Allow remote debugging for this browser instance" -ForegroundColor White
Write-Host "即使动态端口稍后才生成，控制器也会自动重新发现并连接；Edge 意外退出时会按原参数自动重启。" -ForegroundColor DarkGray
Write-Host "保持此窗口打开。按 Ctrl+C 可停止控制器。" -ForegroundColor Green
Write-Host ""

& node (Join-Path $Here "server.js")
exit $LASTEXITCODE
