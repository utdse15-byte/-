@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0\4-仅启动控制器.ps1"
if errorlevel 1 pause
