@echo off
chcp 65001 >nul
REM ============================================================
REM  設定画面を開く（URL・ログイン情報の登録／変更）
REM ============================================================
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo 初回セットアップを実行します...
    call "%~dp0setup.bat"
    if %errorlevel% neq 0 exit /b %errorlevel%
)

".venv\Scripts\python.exe" "src\main.py" --settings
