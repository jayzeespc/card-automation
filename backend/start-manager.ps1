# Start the Process Manager for Card Automation Tool
# This script starts the process manager which allows starting/stopping the backend from the UI

$backendPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $backendPath

Write-Host ""
Write-Host "========================================"
Write-Host "  Card Automation - Process Manager"
Write-Host "========================================"
Write-Host ""
Write-Host "Starting process manager on port 3333..."
Write-Host "Once running, you can control the backend server from the web UI."
Write-Host ""
Write-Host "To stop: Press Ctrl+C"
Write-Host ""

node process-manager.js

Read-Host "Press Enter to exit"
