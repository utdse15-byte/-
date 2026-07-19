$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Here

Write-Host "检查 Node.js..." -ForegroundColor Cyan
$NodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCommand) {
    Write-Host "没有找到 Node.js。请先安装 Node.js LTS，然后重新打开本窗口。" -ForegroundColor Red
    Write-Host "也可以运行: winget install --id OpenJS.NodeJS.LTS -e"
    exit 1
}

$NodeVersion = (& node -p "process.versions.node").Trim()
$NodeParts = $NodeVersion.Split('.')
$NodeMajor = [int]$NodeParts[0]
$NodeMinor = if ($NodeParts.Count -gt 1) { [int]$NodeParts[1] } else { 0 }
Write-Host "Node.js: v$NodeVersion"
if (($NodeMajor -lt 22) -or (($NodeMajor -eq 22) -and ($NodeMinor -lt 16))) {
    Write-Host "需要 Node.js 22.16 或更高版本，以读取 Edge 浏览历史数据库。请先升级。" -ForegroundColor Red
    exit 1
}

Write-Host "npm: $(& npm -v)"
Write-Host ""
$BundledWs = Join-Path $Here "node_modules\ws\package.json"
if (Test-Path $BundledWs) {
    Write-Host "压缩包已包含 ws 依赖，不需要联网下载。" -ForegroundColor Green
} else {
    Write-Host "安装依赖..." -ForegroundColor Cyan
    & npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "检查 JavaScript 语法..." -ForegroundColor Cyan
& npm run check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "运行坐标、协议和模拟 CDP 集成测试..." -ForegroundColor Cyan
& npm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "安装和自检全部通过。下一步双击 启动.cmd。" -ForegroundColor Green
