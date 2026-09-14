@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo First-time setup is required. Running setup.bat ...
    call "%~dp0setup.bat"
    if errorlevel 1 exit /b 1
)

".venv\Scripts\python.exe" "src\main.py" --settings
