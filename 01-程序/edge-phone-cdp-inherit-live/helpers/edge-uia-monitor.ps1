param(
    [ValidateRange(250, 5000)]
    [int]$PollMs = 650,
    # 控制器进程 PID。控制器被强制结束（Stop-Process、关闭控制台窗口）时
    # 本脚本收不到任何通知，必须自行检测父进程消失后退出，否则会以隐藏
    # 窗口常驻后台持续做 UIA 轮询。0 表示不检查（手动调试时）。
    [int]$ParentPid = 0
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class EdgePhoneForegroundWindow {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@

function Get-AutomationValue {
    param([System.Windows.Automation.AutomationElement]$Element)
    try {
        $pattern = $Element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        if ($null -ne $pattern) { return [string]$pattern.Current.Value }
    } catch {}
    return ''
}

function Get-SelectedEdgeTab {
    param([System.Windows.Automation.AutomationElement]$Root)
    try {
        $condition = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::TabItem
        )
        $tabs = $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
        foreach ($tab in $tabs) {
            try {
                $pattern = $tab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
                if ($null -ne $pattern -and $pattern.Current.IsSelected) {
                    return [string]$tab.Current.Name
                }
            } catch {}
        }
    } catch {}
    return ''
}

function Get-EdgeAddressBarValue {
    param([System.Windows.Automation.AutomationElement]$Root)
    try {
        $windowRect = $Root.Current.BoundingRectangle
        $condition = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::Edit
        )
        $edits = $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
        $fallback = ''
        foreach ($edit in $edits) {
            try {
                $rect = $edit.Current.BoundingRectangle
                if ($rect.Width -lt 240) { continue }
                if ($rect.Top -gt ($windowRect.Top + 190)) { continue }
                $value = (Get-AutomationValue -Element $edit).Trim()
                if (-not $value) { continue }
                if ($value -match '^(https?://|edge://|file:|about:|view-source:)' -or
                    $value -match '^[A-Za-z0-9][A-Za-z0-9.-]+\.[A-Za-z]{2,}([/:?#]|$)') {
                    return $value
                }
                if (-not $fallback) { $fallback = $value }
            } catch {}
        }
        return $fallback
    } catch {
        return ''
    }
}

$lastFingerprint = ''
$lastEmitAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - 6000
while ($true) {
    if ($ParentPid -gt 0) {
        try {
            $parent = [System.Diagnostics.Process]::GetProcessById($ParentPid)
            if ($parent.HasExited) { exit 0 }
        } catch {
            exit 0
        }
    }
    $state = [ordered]@{
        available = $true
        edgeForeground = $false
        processName = ''
        processId = 0
        hwnd = 0
        tabTitle = ''
        address = ''
        windowTitle = ''
        reason = 'foreground-not-edge'
        at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    }

    try {
        $hwnd = [EdgePhoneForegroundWindow]::GetForegroundWindow()
        $state.hwnd = [long]$hwnd
        if ($hwnd -ne [IntPtr]::Zero) {
            [uint32]$processIdValue = 0
            [void][EdgePhoneForegroundWindow]::GetWindowThreadProcessId($hwnd, [ref]$processIdValue)
            $state.processId = [int]$processIdValue
            if ($processIdValue -gt 0) {
                $process = [System.Diagnostics.Process]::GetProcessById([int]$processIdValue)
                $state.processName = [string]$process.ProcessName
                if ($process.ProcessName -ieq 'msedge') {
                    $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
                    if ($null -ne $root) {
                        $state.edgeForeground = $true
                        $state.reason = 'ok'
                        $state.windowTitle = [string]$root.Current.Name
                        $state.tabTitle = Get-SelectedEdgeTab -Root $root
                        $state.address = Get-EdgeAddressBarValue -Root $root
                    } else {
                        $state.reason = 'uia-root-unavailable'
                    }
                }
            }
        }
    } catch {
        $state.available = $false
        $state.reason = 'uia-error'
        $state.error = [string]$_.Exception.Message
    }

    $fingerprint = @(
        [string]$state.available,
        [string]$state.edgeForeground,
        [string]$state.processName,
        [string]$state.processId,
        [string]$state.hwnd,
        [string]$state.tabTitle,
        [string]$state.address,
        [string]$state.windowTitle,
        [string]$state.reason,
        [string]$state.error
    ) -join ([char]31)
    $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    if ($fingerprint -ne $lastFingerprint -or ($nowMs - $lastEmitAt) -ge 5000) {
        $state.at = $nowMs
        $json = $state | ConvertTo-Json -Compress -Depth 4
        [Console]::Out.WriteLine($json)
        [Console]::Out.Flush()
        $lastFingerprint = $fingerprint
        $lastEmitAt = $nowMs
    }
    Start-Sleep -Milliseconds $PollMs
}
