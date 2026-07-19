$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Config = Get-Content (Join-Path $Here "config.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$Port = if ($Config.controllerPort) { [int]$Config.controllerPort } else { 8765 }
$RuleName = "Edge Phone CDP Controller $Port"

$IsAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $IsAdmin) {
    Write-Host "需要管理员权限，正在打开管理员 PowerShell..." -ForegroundColor Yellow
    $Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    Start-Process powershell.exe -Verb RunAs -ArgumentList $Arguments
    exit
}

Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Get-NetFirewallRule -DisplayName "Edge Phone CDP Controller 8765" -ErrorAction SilentlyContinue | Remove-NetFirewallRule

New-NetFirewallRule `
    -DisplayName $RuleName `
    -Description "Allow authenticated Edge phone controller access from the local subnet only." `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $Port `
    -Profile Any `
    -RemoteAddress LocalSubnet | Out-Null

Write-Host "已开放 TCP $Port，仅允许本地子网设备访问，适用于 Private/Public/Domain 网络配置。" -ForegroundColor Green
Write-Host "没有开放 Edge 动态调试端口。" -ForegroundColor Green
Write-Host ""
Write-Host "当前网络配置:" -ForegroundColor Cyan
Get-NetConnectionProfile | Format-Table InterfaceAlias, Name, NetworkCategory, IPv4Connectivity -AutoSize
Write-Host ""
Write-Host "带默认网关的 IPv4 地址（手机应访问其中的有线网卡地址）:" -ForegroundColor Cyan
Get-NetIPConfiguration |
    Where-Object { $_.NetAdapter.Status -eq "Up" -and $_.IPv4DefaultGateway } |
    Select-Object InterfaceAlias,
        @{Name="IPv4";Expression={$_.IPv4Address.IPAddress}},
        @{Name="Gateway";Expression={$_.IPv4DefaultGateway.NextHop}} |
    Format-Table -AutoSize

Read-Host "按回车关闭"
