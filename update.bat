@echo off
rem ============================================================
rem  update.bat
rem  Downloads the latest version from GitHub and refreshes
rem  the src / config folders. Your .venv and settings.json
rem  are kept as-is. Run this in a folder already set up.
rem ============================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================================
echo  Updating to the latest version
echo  (.venv and your settings.json are kept)
echo ============================================================
echo.

set "ZIPURL=https://codeload.github.com/ombman/-/zip/refs/heads/claude/reins-auto-search-app-m5im0v"
set "TMPDIR=%TEMP%\reins_update"

rmdir /s /q "%TMPDIR%" 2>nul
mkdir "%TMPDIR%" 2>nul

echo [1/3] Downloading...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%ZIPURL%' -OutFile '%TMPDIR%\update.zip' -UseBasicParsing } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 goto :fail

echo [2/3] Extracting...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { Expand-Archive -Path '%TMPDIR%\update.zip' -DestinationPath '%TMPDIR%' -Force } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 goto :fail

set "EXROOT="
for /d %%D in ("%TMPDIR%\*") do set "EXROOT=%%D"
if not defined EXROOT goto :fail

echo [3/3] Updating files...
rem robocopy exit codes 0-7 mean success, so do not check errorlevel here.
robocopy "!EXROOT!\src" "%CD%\src" /E /NFL /NDL /NJH /NJS /NC /NS /NP >nul
robocopy "!EXROOT!\config" "%CD%\config" /E /NFL /NDL /NJH /NJS /NC /NS /NP >nul

rmdir /s /q "%TMPDIR%" 2>nul

echo.
echo ============================================================
echo  Update finished.
echo  Next step: double-click run.bat to start the app.
echo ============================================================
echo.
pause
exit /b 0

:fail
echo.
echo [ERROR] Update failed.
echo   - Check your internet connection.
echo   - If it keeps failing, download the ZIP from GitHub again
echo     and run setup.bat.
rmdir /s /q "%TMPDIR%" 2>nul
echo.
pause
exit /b 1
