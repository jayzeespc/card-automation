@echo off
REM CardPilot HQ - GitHub Setup Script

cd /d d:\Website\card-automation

echo.
echo ===== CardPilot HQ - GitHub Setup =====
echo.

REM Check if git is installed
git --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Git is not installed. Download from https://git-scm.com
    pause
    exit /b 1
)

REM Check if repo already exists
if exist .git (
    echo Repository already initialized.
    echo Running: git status
    git status
) else (
    echo Initializing new git repository...
    git init
    git config user.name "CardPilot User"
    git config user.email "user@cardpilot.local"
)

echo.
echo Adding files...
git add .

echo.
echo Creating initial commit...
git commit -m "Initial commit: CardPilot HQ with GitHub Pages + Render deployment" -q 2>nul || (
    echo Warning: commit failed (already committed?)
)

echo.
echo.
echo ===== NEXT STEPS =====
echo.
echo 1. Go to https://github.com/jayzeespc
echo 2. Create a NEW repository named: card-automation
echo 3. Copy the URL (e.g., https://github.com/jayzeespc/card-automation.git)
echo.
echo Then run ONE of these commands:
echo.
echo   git remote add origin https://github.com/jayzeespc/card-automation.git
echo   git branch -M main
echo   git push -u origin main
echo.
echo Or paste your URL below and this script will do it:
echo.

set /p GITHUB_URL="Enter your GitHub repo URL (press Enter to skip): "

if not "%GITHUB_URL%"=="" (
    echo.
    echo Setting remote and pushing...
    git remote remove origin 2>nul
    git remote add origin %GITHUB_URL%
    git branch -M main
    git push -u origin main
    
    if errorlevel 0 (
        echo.
        echo SUCCESS! Your code is now on GitHub.
        echo.
        echo Next: Read DEPLOYMENT.md for GitHub Pages + Render setup
        echo URL: https://github.com/jayzeespc/card-automation
    )
) else (
    echo.
    echo Skipped. Run the git commands manually when ready.
)

pause
