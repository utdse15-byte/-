$ErrorActionPreference = "Continue"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Here

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$DiagnosticsRoot = Join-Path $Here "diagnostics"
$WorkDir = Join-Path $DiagnosticsRoot "edge-phone-diagnostic-$Stamp"
$ZipPath = "$WorkDir.zip"
New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null
$ReportPath = Join-Path $WorkDir "诊断摘要.txt"
$VersionPath = Join-Path $Here "VERSION.txt"
$ProjectVersion = if (Test-Path $VersionPath) { (Get-Content $VersionPath -Raw -Encoding UTF8).Trim() } else { "unknown" }

function Add-Section {
    param([string]$Title, [scriptblock]$Body)
    Add-Content -Path $ReportPath -Encoding UTF8 -Value ""
    Add-Content -Path $ReportPath -Encoding UTF8 -Value "================ $Title ================"
    try {
        $Output = & $Body 2>&1 | Out-String -Width 240
        Add-Content -Path $ReportPath -Encoding UTF8 -Value $Output.TrimEnd()
    } catch {
        Add-Content -Path $ReportPath -Encoding UTF8 -Value ("ERROR: " + $_.Exception.Message)
    }
}

"Edge Phone CDP Controller v$ProjectVersion diagnostic bundle" | Out-File -FilePath $ReportPath -Encoding UTF8
("Generated: " + (Get-Date).ToString("o")) | Add-Content -Path $ReportPath -Encoding UTF8
"Important: the access token, cookies and uploaded file contents are not included." | Add-Content -Path $ReportPath -Encoding UTF8
"The recent log may contain local IP addresses and the titles or URLs of pages you controlled." | Add-Content -Path $ReportPath -Encoding UTF8

$ConfigPath = Join-Path $Here "config.json"
$Config = $null
try { $Config = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch {}
$Port = if ($Config -and $Config.controllerPort) { [int]$Config.controllerPort } else { 8765 }
$TokenPath = Join-Path $Here "data\access-token.txt"
$Token = ""
if (Test-Path $TokenPath) {
    try { $Token = (Get-Content $TokenPath -Raw -Encoding UTF8).Trim() } catch {}
}

Add-Section "System" {
    [PSCustomObject]@{
        ComputerName = $env:COMPUTERNAME
        UserName = $env:USERNAME
        OSVersion = [Environment]::OSVersion.VersionString
        Is64BitOS = [Environment]::Is64BitOperatingSystem
        PowerShell = $PSVersionTable.PSVersion.ToString()
        ProjectPath = $Here
    } | Format-List
    if (Get-Command node -ErrorAction SilentlyContinue) { "Node: " + (& node -v) }
    if (Get-Command npm -ErrorAction SilentlyContinue) { "npm: " + (& npm -v) }
}

Add-Section "Configuration (token redacted)" {
    if (-not (Test-Path $ConfigPath)) { "config.json not found"; return }
    $RawConfig = Get-Content $ConfigPath -Raw -Encoding UTF8
    $RawConfig = $RawConfig -replace '(?i)("accessToken"\s*:\s*")[^"]*(")', '$1[REDACTED]$2'
    $RawConfig = $RawConfig -replace '(?i)(://)[^/@\s]+@', '$1[REDACTED]@'
    $RawConfig
}

Add-Section "Edge and remote debugging" {
    $EdgeUserData = Join-Path $env:LOCALAPPDATA "Microsoft\Edge\User Data"
    $ActivePortFile = Join-Path $EdgeUserData "DevToolsActivePort"
    "User data: $EdgeUserData"
    $CdpPort = $null
    if (Test-Path $ActivePortFile) {
        "DevToolsActivePort modified: " + (Get-Item $ActivePortFile).LastWriteTime.ToString("o")
        $ActivePortLines = @(Get-Content $ActivePortFile)
        $ActivePortLines | ForEach-Object {
            if ($_ -match '^/devtools/browser/') { '/devtools/browser/[REDACTED]' } else { $_ }
        }
        if ($ActivePortLines.Count -ge 1) {
            $ParsedPort = 0
            if ([int]::TryParse(([string]$ActivePortLines[0]).Trim(), [ref]$ParsedPort)) { $CdpPort = $ParsedPort }
        }
    } else {
        "DevToolsActivePort not found"
    }
    if ($CdpPort) {
        "CDP listener check for port ${CdpPort}:"
        $Listener = Get-NetTCPConnection -LocalPort $CdpPort -State Listen -ErrorAction SilentlyContinue
        if ($Listener) {
            $Listener | Format-Table LocalAddress, LocalPort, OwningProcess -AutoSize
        } else {
            "NO LISTENER (DevToolsActivePort may be stale or Edge may have exited)"
        }
    }
    foreach ($PolicyPath in @("HKCU:\SOFTWARE\Policies\Microsoft\Edge", "HKLM:\SOFTWARE\Policies\Microsoft\Edge")) {
        try {
            $Value = (Get-ItemProperty -Path $PolicyPath -Name RemoteDebuggingAllowed -ErrorAction Stop).RemoteDebuggingAllowed
            "$PolicyPath RemoteDebuggingAllowed=$Value"
        } catch {}
    }
    $EdgeProcesses = Get-Process msedge -ErrorAction SilentlyContinue
    if ($EdgeProcesses) {
        $EdgeProcesses |
            Select-Object Id, StartTime, CPU, WorkingSet64 |
            Format-Table -AutoSize
        "Representative Edge command lines:"
        Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" -ErrorAction SilentlyContinue |
            Select-Object -First 6 ProcessId, ParentProcessId, CommandLine |
            Format-List
    } else {
        "NO msedge.exe PROCESS"
    }
}

Add-Section "Controller and ports" {
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Format-Table LocalAddress, LocalPort, OwningProcess -AutoSize
    try { Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 3 | ConvertTo-Json -Depth 6 } catch { $_.Exception.Message }
    if (-not [string]::IsNullOrWhiteSpace($Token)) {
        try {
            $Status = Invoke-RestMethod "http://127.0.0.1:$Port/api/status" -Headers @{ Authorization = "Bearer $Token" } -TimeoutSec 4
            if ($Status.endpoint) { $Status.endpoint = ($Status.endpoint -replace '/devtools/browser/.*$', '/devtools/browser/[REDACTED]') }
            if ($Status.target) {
                $Status.target.title = "[REDACTED]"
                $Status.target.url = "[REDACTED]"
            }
            foreach ($Phone in @($Status.phones)) {
                if ($Phone.clientId) { $Phone.clientId = "[REDACTED]" }
            }
            $Status | ConvertTo-Json -Depth 10
        } catch { $_.Exception.Message }
    } else {
        "No access token file; authenticated status was not collected."
    }
}


Add-Section "Windows UI Automation and strict manual mode" {
    $UiaHelper = Join-Path $Here "helpers\edge-uia-monitor.ps1"
    [PSCustomObject]@{
        FollowDesktopTabs = if ($Config) { $Config.followDesktopTabs } else { $null }
        FollowStrategy = if ($Config) { $Config.desktopTabFollowStrategy } else { $null }
        UiaPollMs = if ($Config) { $Config.uiaPollMs } else { $null }
        StrictRuntimeFallback = if ($Config) { $Config.strictRuntimeTabFallback } else { $null }
        ManualCompatibilityMode = if ($Config) { $Config.manualCompatibilityMode } else { $null }
        StrictNativeTouchDefault = if ($Config) { $Config.strictNativeTouchDefault } else { $null }
        HelperExists = (Test-Path $UiaHelper)
        HelperPath = $UiaHelper
    } | Format-List
    if (Test-Path $UiaHelper) {
        "UIA helper SHA256: " + (Get-FileHash $UiaHelper -Algorithm SHA256).Hash
    }
    try {
        Add-Type -AssemblyName UIAutomationClient -ErrorAction Stop
        Add-Type -AssemblyName UIAutomationTypes -ErrorAction Stop
        "UIAutomationClient/UIAutomationTypes: load OK"
    } catch {
        "UIAutomation assemblies: ERROR - " + $_.Exception.Message
    }
    "Strict domains: " + (@($Config.manualCompatibilityDomains) -join ", ")
    "Expected idle behavior: Page/Input/screencast only; Runtime, DOM and file chooser interception are demand-driven."
}

Add-Section "Network" {
    Get-NetIPConfiguration |
        Where-Object { $_.NetAdapter.Status -eq "Up" } |
        Select-Object InterfaceAlias,
            @{Name="IPv4";Expression={$_.IPv4Address.IPAddress}},
            @{Name="Gateway";Expression={$_.IPv4DefaultGateway.NextHop}},
            @{Name="Dns";Expression={($_.DNSServer.ServerAddresses -join ',')}} |
        Format-Table -AutoSize
    Get-NetConnectionProfile | Format-Table InterfaceAlias, Name, NetworkCategory, IPv4Connectivity -AutoSize
}

Add-Section "Firewall" {
    $FirewallRule = Get-NetFirewallRule -DisplayName "Edge Phone CDP Controller $Port" -ErrorAction SilentlyContinue
    if (-not $FirewallRule) {
        "Firewall rule not found"
        return
    }
    $FirewallRule | Format-List DisplayName, Enabled, Profile, Direction, Action
    $FirewallRule | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue |
        Format-List Protocol, LocalPort, RemotePort
    $FirewallRule | Get-NetFirewallAddressFilter -ErrorAction SilentlyContinue |
        Format-List LocalAddress, RemoteAddress
}

$LogPath = Join-Path $Here "logs\controller.log"
if (Test-Path $LogPath) {
    Get-Content $LogPath -Tail 300 -Encoding UTF8 | Set-Content (Join-Path $WorkDir "最近日志-可能含网址.txt") -Encoding UTF8
}

try {
    & node -e "const fs=require('fs');for(const f of ['server.js','public/app.js','lib/geometry.js']){new Function(fs.readFileSync(f,'utf8'));console.log(f+': syntax OK')}" 2>&1 |
        Out-File (Join-Path $WorkDir "JavaScript语法检查.txt") -Encoding UTF8
} catch {}

if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path (Join-Path $WorkDir "*") -DestinationPath $ZipPath -CompressionLevel Optimal
Remove-Item $WorkDir -Recurse -Force

Write-Host "诊断包已生成:" -ForegroundColor Green
Write-Host $ZipPath -ForegroundColor White
Write-Host "访问令牌、Cookie 和上传文件内容未包含。最近日志可能包含页面标题或网址，分享前可先查看。" -ForegroundColor Yellow
try { Start-Process explorer.exe -ArgumentList "/select,`"$ZipPath`"" } catch {}
Read-Host "按回车关闭"
