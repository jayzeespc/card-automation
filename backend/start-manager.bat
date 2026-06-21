@echo off
REM Start the Process Manager for the Card Automation Tool
REM This script starts the process manager which allows starting/stopping the backend from the UI

cd /d "%~dp0"

echo.
echo ========================================
echo   Card Automation - Process Manager
echo ========================================
echo.
echo Starting process manager on port 3333...
echo Once running, you can control the backend server from the web UI.
echo.
echo Press Ctrl+C to stop the process manager.
echo.

node process-manager.js

pause
