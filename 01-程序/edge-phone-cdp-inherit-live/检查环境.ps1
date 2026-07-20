$ErrorActionPreference = "Continue"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Here
$Config = Get-Content (Join-Path $Here "config.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$Port = if ($Config.controllerPort) { [int]$Config.controllerPort } else { 8765 }
$ProxyServer = if ($Config.proxyServer) { [string]$Config.proxyServer } else { "http://127.0.0.1:7897" }
$EdgeUserData = Join-Path $env:LOCALAPPDATA "Microsoft\Edge\User Data"
$ActivePortFile = Join-Path $EdgeUserData "DevToolsActivePort"
$TokenPath = Join-Path $Here "data\access-token.txt"
$UiaHelperPath = Join-Path $Here "helpers\edge-uia-monitor.ps1"

Write-Host "=== 项目版本与 v6.7 策略 ===" -ForegroundColor Cyan
$VersionPath = Join-Path $Here "VERSION.txt"
if (Test-Path $VersionPath) { Write-Host ("版本: " + (Get-Content $VersionPath -Raw -Encoding UTF8).Trim()) }
# 默认值必须与 server.js 的 FOLLOW_DESKTOP_TABS_DEFAULT 一致（false）。
$FollowEnabled = if ($null -ne $Config.followDesktopTabs) { [bool]$Config.followDesktopTabs } else { $false }
$FollowStrategy = if ($Config.desktopTabFollowStrategy) { [string]$Config.desktopTabFollowStrategy } else { "uia" }
$StrictFallback = if ($null -ne $Config.strictRuntimeTabFallback) { [bool]$Config.strictRuntimeTabFallback } else { $false }
Write-Host "固定代理: $ProxyServer"
Write-Host "标签跟随启用: $FollowEnabled"
Write-Host "标签跟随策略: $FollowStrategy"
Write-Host "严格站点 Runtime 焦点轮询回退: $StrictFallback"
Write-Host "严格人工模式: $($Config.manualCompatibilityMode)"
Write-Host "严格站点: $(@($Config.manualCompatibilityDomains) -join ', ')"
if ($FollowStrategy -ne 'uia') { Write-Host "警告: 推荐策略为 uia。" -ForegroundColor Yellow }
if ($StrictFallback) { Write-Host "警告: 严格站点的 Runtime 标签轮询回退已开启。" -ForegroundColor Yellow }
Write-Host ""

Write-Host "=== Node.js ===" -ForegroundColor Cyan
$Node = Get-Command node -ErrorAction SilentlyContinue
if ($Node) { node -v; npm -v } else { Write-Host "未安装或不在 PATH 中。" -ForegroundColor Red }
Write-Host ""

Write-Host "=== Windows UI Automation ===" -ForegroundColor Cyan
if (Test-Path $UiaHelperPath) {
    Write-Host "辅助脚本存在: $UiaHelperPath" -ForegroundColor Green
    try {
        Add-Type -AssemblyName UIAutomationClient -ErrorAction Stop
        Add-Type -AssemblyName UIAutomationTypes -ErrorAction Stop
        Write-Host "UIAutomationClient / UIAutomationTypes 可加载。" -ForegroundColor Green
    } catch {
        Write-Host "UI Automation 程序集加载失败: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "缺少辅助脚本: $UiaHelperPath" -ForegroundColor Red
}
Write-Host "说明: UIA 实际运行状态要在控制器启动后查看下方 /api/status 输出或手机设置页。" -ForegroundColor DarkGray
Write-Host ""

Write-Host "=== 本地代理 ===" -ForegroundColor Cyan
Write-Host $ProxyServer
try {
    $ProxyUri = [Uri]$ProxyServer
    Test-NetConnection -ComputerName $ProxyUri.Host -Port $ProxyUri.Port | Select-Object ComputerName, RemotePort, TcpTestSucceeded | Format-List
} catch { Write-Host $_.Exception.Message -ForegroundColor Red }
Write-Host ""

Write-Host "=== Edge 远程调试策略 ===" -ForegroundColor Cyan
$FoundPolicy = $false
foreach ($PolicyPath in @("HKCU:\SOFTWARE\Policies\Microsoft\Edge", "HKLM:\SOFTWARE\Policies\Microsoft\Edge")) {
    try {
        $Value = (Get-ItemProperty -Path $PolicyPath -Name RemoteDebuggingAllowed -ErrorAction Stop).RemoteDebuggingAllowed
        Write-Host "$PolicyPath -> $Value"
        $FoundPolicy = $true
    } catch {}
}
if (-not $FoundPolicy) { Write-Host "未配置，默认允许。" -ForegroundColor Green }
Write-Host ""

Write-Host "=== Edge 进程 ===" -ForegroundColor Cyan
$EdgeProcesses = Get-Process msedge -ErrorAction SilentlyContinue
if ($EdgeProcesses) {
    Write-Host ("检测到 {0} 个 msedge.exe 进程。" -f @($EdgeProcesses).Count) -ForegroundColor Green
    $EdgeProcesses | Select-Object -First 8 Id, StartTime, CPU, WorkingSet64 | Format-Table -AutoSize
} else {
    Write-Host "没有 msedge.exe 进程。DevToolsActivePort 若仍存在，就是旧实例残留。" -ForegroundColor Red
}
$AutoRestart = if ($null -ne $Config.autoRestartEdge) { [bool]$Config.autoRestartEdge } else { $true }
Write-Host ("通过 启动.cmd 运行时，Edge 自动重启: {0}" -f $AutoRestart)
Write-Host ""

Write-Host "=== DevToolsActivePort ===" -ForegroundColor Cyan
if (Test-Path $ActivePortFile) {
    $Lines = @(Get-Content $ActivePortFile)
    $Lines | ForEach-Object { Write-Host $_ }
    $CdpPort = 0
    if ($Lines.Count -ge 2 -and [int]::TryParse(([string]$Lines[0]).Trim(), [ref]$CdpPort)) {
        $CdpListener = Get-NetTCPConnection -LocalPort $CdpPort -State Listen -ErrorAction SilentlyContinue
        if ($CdpListener) {
            Write-Host "动态调试端口 $CdpPort 正在监听。" -ForegroundColor Green
            $CdpListener | Format-Table LocalAddress, LocalPort, OwningProcess -AutoSize
        } else {
            Write-Host "动态调试端口 $CdpPort 没有监听。此文件可能是已退出 Edge 的残留。" -ForegroundColor Red
            if ($EdgeProcesses) {
                Write-Host "Edge 仍在运行：请在 edge://inspect/#remote-debugging 取消勾选后重新勾选。" -ForegroundColor Yellow
            } else {
                Write-Host "Edge 已退出：重新运行 启动.cmd；v6.7.0 控制器也会按配置尝试恢复。" -ForegroundColor Yellow
            }
        }
        $BrowserPath = ([string]$Lines[1]).Trim()
        if ($BrowserPath -match '^wss?://') { $BrowserWs = $BrowserPath }
        elseif ($BrowserPath.StartsWith('/')) { $BrowserWs = "ws://127.0.0.1:$CdpPort$BrowserPath" }
        else { $BrowserWs = "ws://127.0.0.1:$CdpPort/$BrowserPath" }
        Write-Host "浏览器 WebSocket: $BrowserWs" -ForegroundColor Green
        if (Test-Path (Join-Path $Here "node_modules\ws\package.json")) {
            & node (Join-Path $Here "check-browser-cdp.js") $BrowserWs
        } else {
            Write-Host "尚未安装依赖，无法执行 WebSocket 测试。" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "文件不存在。请在 edge://inspect/#remote-debugging 勾选允许远程调试。" -ForegroundColor Red
}
Write-Host ""

Write-Host "=== 控制器端口 $Port ===" -ForegroundColor Cyan
$Listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($Listener) {
    $Listener | Format-Table LocalAddress, LocalPort, OwningProcess -AutoSize
    try {
        $Health = Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 3
        $Health | ConvertTo-Json -Depth 5
        if ($Health.service -ne 'edge-phone-cdp-controller') {
            Write-Host "警告: 该端口返回的不是本项目控制器。" -ForegroundColor Yellow
        }
    } catch { Write-Host $_.Exception.Message -ForegroundColor Red }
} else {
    Write-Host "未监听。控制器可能尚未启动。" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "=== 控制器认证状态 / UIA / 严格模式 ===" -ForegroundColor Cyan
$Token = ""
if (Test-Path $TokenPath) {
    try { $Token = (Get-Content $TokenPath -Raw -Encoding UTF8).Trim() } catch {}
}
if ($Listener -and -not [string]::IsNullOrWhiteSpace($Token)) {
    try {
        $Status = Invoke-RestMethod "http://127.0.0.1:$Port/api/status" -Headers @{ Authorization = "Bearer $Token" } -TimeoutSec 4
        [PSCustomObject]@{
            CdpConnected = $Status.cdpConnected
            TargetTitle = if ($Status.target) { [string]$Status.target.title } else { "" }
            # /api/status 里标签跟随状态位于 manualCompatibility.desktopTabFollow，
            # 顶层没有 desktopTabFollow 字段（此前读错路径导致本面板恒为空）。
            FollowEnabled = $Status.manualCompatibility.desktopTabFollow.enabled
            FollowStrategy = $Status.manualCompatibility.desktopTabFollow.strategy
            UiaAvailable = $Status.manualCompatibility.desktopTabFollow.uia.available
            UiaRunning = $Status.manualCompatibility.desktopTabFollow.uia.running
            UiaReason = $Status.manualCompatibility.desktopTabFollow.uia.reason
            StrictActive = $Status.manualCompatibility.active
            StrictDomain = $Status.manualCompatibility.domain
            StrictInput = $Status.manualCompatibility.inputProfile
            StrictNativeTouch = $Status.manualCompatibility.nativeTouchEnabled
        } | Format-List
    } catch {
        Write-Host "无法读取 /api/status: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host "控制器未运行或访问令牌尚未生成。" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "=== 防火墙规则 ===" -ForegroundColor Cyan
Get-NetFirewallRule -DisplayName "Edge Phone CDP Controller $Port" -ErrorAction SilentlyContinue |
    Format-List DisplayName, Enabled, Profile, Direction, Action
Write-Host ""

Write-Host "=== 有默认网关的网卡 ===" -ForegroundColor Cyan
$NetworkRows = @(Get-NetIPConfiguration |
    Where-Object { $_.NetAdapter.Status -eq "Up" -and $_.IPv4DefaultGateway } |
    ForEach-Object {
        $Interface = $_
        foreach ($Address in @($Interface.IPv4Address.IPAddress)) {
            if ([string]::IsNullOrWhiteSpace([string]$Address) -or ([string]$Address).StartsWith("169.254.")) { continue }
            [PSCustomObject]@{
                InterfaceAlias = $Interface.InterfaceAlias
                IPv4 = [string]$Address
                Gateway = (@($Interface.IPv4DefaultGateway.NextHop) -join ",")
            }
        }
    })
$NetworkRows | Format-Table -AutoSize
Write-Host ""

Write-Host "=== Windows 网络类型 ===" -ForegroundColor Cyan
Get-NetConnectionProfile | Format-Table InterfaceAlias, Name, NetworkCategory, IPv4Connectivity -AutoSize
Write-Host ""

Write-Host "=== 手机访问地址 ===" -ForegroundColor Cyan
if (-not $NetworkRows) {
    Write-Host "没有找到带默认网关的 IPv4 网卡。" -ForegroundColor Red
} else {
    foreach ($Row in $NetworkRows) {
        $Ip = [string]$Row.IPv4
        if ([string]::IsNullOrWhiteSpace($Ip)) { continue }
        $HealthUrl = "http://${Ip}:$Port/health"
        Write-Host "[$($Row.InterfaceAlias)] 健康检查: $HealthUrl" -ForegroundColor Green
        if (-not [string]::IsNullOrWhiteSpace($Token)) {
            $EncodedToken = [Uri]::EscapeDataString($Token)
            $ControlUrl = "http://${Ip}:$Port/#token=$EncodedToken"
            Write-Host "[$($Row.InterfaceAlias)] 手机控制: $ControlUrl" -ForegroundColor White
        } else {
            Write-Host "访问令牌尚未生成；先运行 启动.cmd。" -ForegroundColor Yellow
        }
        if ($Listener) {
            try {
                $LanHealth = Invoke-RestMethod $HealthUrl -TimeoutSec 3
                if ($LanHealth.ok) { Write-Host "电脑通过此局域网地址访问成功。" -ForegroundColor Green }
            } catch {
                Write-Host "电脑通过此局域网地址访问失败: $($_.Exception.Message)" -ForegroundColor Red
            }
        }
        Write-Host ""
    }
}
Write-Host "手机应先打开健康检查地址；能看到 JSON 后，再打开带 token 的控制地址。" -ForegroundColor Green
