@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0\2-启动Edge和控制器.ps1"
if errorlevel 1 pause
