@echo off
setlocal enableextensions
cd /d "%~dp0"
set "LOG=%~dp0setup_log.txt"
set "RC=1"

echo Setup log (open this file if the window closes).> "%LOG%"
echo Date: %date% %time%>> "%LOG%"
echo Folder: %~dp0>> "%LOG%"

echo.
echo ============================================================
echo  REINS auto-search app - First-time setup
echo ============================================================

echo.
echo [1/4] Checking Python...
rem Prefer "python" (worked before on this PC); use "py -3" only as backup.
set "PYCMD="
set "PYALT="
where python >nul 2>&1 && set "PYCMD=python"
if not defined PYCMD ( where py >nul 2>&1 && set "PYCMD=py -3" )
if /I not "%PYCMD%"=="py -3" ( where py >nul 2>&1 && set "PYALT=py -3" )
if not defined PYCMD (
    echo.
    echo [ERROR] Python was not found.
    echo   Install Python 3.12 or newer from:
    echo     https://www.python.org/downloads/windows/
    echo   During install, CHECK "Add python.exe to PATH".
    goto :done
)
echo   Using Python command: %PYCMD%
echo Using %PYCMD%>> "%LOG%"

echo.
echo [2/4] Creating a private environment (.venv)...
rem If an incomplete .venv (no python.exe) remains, remove it first.
if exist ".venv" if not exist ".venv\Scripts\python.exe" (
    echo   Removing an incomplete .venv folder...
    rmdir /s /q ".venv"
)
echo ---- venv attempt 1: %PYCMD% ---->> "%LOG%"
%PYCMD% -m venv .venv >> "%LOG%" 2>&1
if not exist ".venv\Scripts\python.exe" if defined PYALT (
    echo   Retrying with "%PYALT%"...
    echo ---- venv attempt 2: %PYALT% ---->> "%LOG%"
    %PYALT% -m venv .venv >> "%LOG%" 2>&1
)
if not exist ".venv\Scripts\python.exe" (
    echo.
    echo [ERROR] Failed to create the virtual environment.
    echo   Details were saved to:  setup_log.txt  (same folder as this file)
    echo   Common causes:
    echo     1) Not enough free disk space
    echo     2) The folder path is too deep / too long
    echo     3) No write permission for this folder
    powershell -NoProfile -Command "try { $l=('%~d0').TrimEnd(':'); $f=(Get-PSDrive $l).Free; Write-Host ('  Free space on %~d0 {0:N1} GB' -f ($f/1GB)) } catch {}"
    goto :done
)
echo   .venv created OK.

echo.
echo [3/4] Installing required libraries...
echo ---- pip upgrade ---->> "%LOG%"
".venv\Scripts\python.exe" -m pip install --upgrade pip >> "%LOG%" 2>&1
echo ---- pip install -r requirements.txt ---->> "%LOG%"
".venv\Scripts\python.exe" -m pip install -r requirements.txt >> "%LOG%" 2>&1
if errorlevel 1 (
    echo [ERROR] Failed to install libraries.  See setup_log.txt for details.
    goto :done
)

echo.
echo [4/4] Preparing browser components...
echo ---- playwright install chromium ---->> "%LOG%"
".venv\Scripts\python.exe" -m playwright install chromium >> "%LOG%" 2>&1

set "RC=0"
echo.
echo ============================================================
echo  Setup finished successfully.
echo  Next step: double-click run.bat to start the app.
echo ============================================================

:done
echo.
echo ------------------------------------------------------------
echo  This window will stay open. Press any key to close it.
echo ------------------------------------------------------------
pause >nul
exit /b %RC%
