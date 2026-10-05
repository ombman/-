@echo off
rem ============================================================
rem  install.bat  -  REINS auto-search app installer
rem  1) Checks Python (installs it with winget if missing)
rem  2) Puts the app into C:\reins
rem  3) Runs setup.bat (libraries and browser parts)
rem  4) Creates the desktop icon
rem  NOTE: keep this file ASCII-only (Japanese Windows reads .bat as CP932).
rem ============================================================
setlocal enableextensions
set "DEST=C:\reins"
set "HERE=%~dp0"
set "ZIPURL=https://codeload.github.com/ombman/-/zip/refs/heads/claude/reins-auto-search-app-m5im0v"

echo ============================================================
echo  REINS auto-search app - Installer
echo  Install folder: %DEST%
echo ============================================================
echo.

echo [1/4] Checking Python...
call :findpy
if defined PYOK goto :py_ok
echo   Python was not found. Installing Python 3.12 (this takes a few minutes)...
where winget >nul 2>&1
if errorlevel 1 goto :nopython
winget install -e --id Python.Python.3.12 --scope user --accept-package-agreements --accept-source-agreements
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PATH=%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;%PATH%"
call :findpy
if not defined PYOK goto :nopython
:py_ok
echo   Python OK.

echo.
echo [2/4] Putting the app into %DEST% ...
if not exist "%DEST%" mkdir "%DEST%"
if /I "%HERE%"=="%DEST%\" goto :files_ok
if exist "%HERE%src\main.py" goto :copy_local

echo   Downloading the app from GitHub...
curl -L -f -s -S -o "%TEMP%\reins_app.zip" "%ZIPURL%"
if errorlevel 1 goto :fail_files
tar -xf "%TEMP%\reins_app.zip" -C "%DEST%" --strip-components=1
if errorlevel 1 goto :fail_files
del "%TEMP%\reins_app.zip" >nul 2>&1
goto :files_ok

:copy_local
rem robocopy exit codes 0-7 mean success, so do not check errorlevel here.
robocopy "%HERE%." "%DEST%" /E /XD .venv .chrome-profile logs downloads __pycache__ /NFL /NDL /NJH /NJS /NC /NS /NP >nul

:files_ok
if not exist "%DEST%\src\main.py" goto :fail_files
echo   Files OK.

echo.
echo [3/4] Setting up (libraries and browser parts). Please wait...
cd /d "%DEST%"
set "REINS_NO_PAUSE=1"
call "%DEST%\setup.bat"
if errorlevel 1 goto :fail_setup

echo.
echo [4/4] Creating the desktop icon...
"%DEST%\.venv\Scripts\python.exe" "%DEST%\src\make_shortcut.py"

echo.
echo ============================================================
echo  Installation finished.
echo  Double-click the "REINS" icon on your desktop to start.
echo  (The first time, enter the REINS login URL, ID and password.)
echo ============================================================
goto :end

:nopython
echo.
echo [ERROR] Python could not be installed automatically.
echo   1) Open https://www.python.org/downloads/windows/
echo   2) Install Python 3.12 or newer
echo      and CHECK "Add python.exe to PATH" on the first screen.
echo   3) Run this install.bat again.
goto :end

:fail_files
echo.
echo [ERROR] Could not put the app files into %DEST%.
echo   Check your internet connection, then run install.bat again.
goto :end

:fail_setup
echo.
echo [ERROR] Setup failed. See %DEST%\setup_log.txt for details.
goto :end

:findpy
set "PYOK="
python -c "import venv" >nul 2>&1 && set "PYOK=1"
if not defined PYOK py -3 -c "import venv" >nul 2>&1 && set "PYOK=1"
exit /b 0

:end
echo.
echo Press any key to close this window.
pause >nul
exit /b 0
