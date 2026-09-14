@echo off
setlocal
cd /d "%~dp0"

echo.
echo ============================================================
echo  REINS auto-search app - First-time setup
echo ============================================================

echo.
echo [1/4] Checking Python...
set "PYCMD="
where py >nul 2>&1 && set "PYCMD=py -3"
if not defined PYCMD ( where python >nul 2>&1 && set "PYCMD=python" )
if not defined PYCMD (
    echo.
    echo [ERROR] Python was not found.
    echo   Install Python 3.12 or newer from:
    echo     https://www.python.org/downloads/windows/
    echo   During install, CHECK "Add python.exe to PATH".
    echo.
    pause
    exit /b 1
)
echo   Using Python command: %PYCMD%

echo.
echo [2/4] Creating a private environment (.venv)...
%PYCMD% -m venv .venv
if errorlevel 1 (
    echo [ERROR] Failed to create the virtual environment.
    pause
    exit /b 1
)

echo.
echo [3/4] Installing required libraries...
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Failed to install libraries.
    pause
    exit /b 1
)

echo.
echo [4/4] Preparing browser components...
".venv\Scripts\python.exe" -m playwright install chromium

echo.
echo ============================================================
echo  Setup finished successfully.
echo  Next step: double-click run.bat to start the app.
echo ============================================================
echo.
pause
