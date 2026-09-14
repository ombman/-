@echo off
chcp 65001 >nul
REM ============================================================
REM  REINS自動検索アプリ  起動
REM  デスクトップのショートカットからは、このファイルを指定します。
REM ============================================================
cd /d "%~dp0"

REM 初回セットアップがまだなら自動で実行
if not exist ".venv\Scripts\python.exe" (
    echo 初回セットアップを実行します...
    call "%~dp0setup.bat"
    if %errorlevel% neq 0 exit /b %errorlevel%
)

REM アプリ本体を起動
".venv\Scripts\python.exe" "src\main.py" %*
set "EXITCODE=%errorlevel%"

if %EXITCODE% neq 0 (
    echo.
    echo 処理は途中で終了しました（終了コード: %EXITCODE%）。
    echo 詳細は logs フォルダのログと logs\shots の画像をご確認ください。
    echo.
    pause
)
exit /b %EXITCODE%
