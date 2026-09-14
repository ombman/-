@echo off
chcp 65001 >nul
REM ============================================================
REM  REINS自動検索アプリ  初回セットアップ
REM  （必要なライブラリのインストールを自動で行います）
REM ============================================================
cd /d "%~dp0"

echo.
echo [1/4] Python の確認...
where py >nul 2>&1
if %errorlevel%==0 (
    set "PYCMD=py -3"
) else (
    where python >nul 2>&1
    if %errorlevel%==0 (
        set "PYCMD=python"
    ) else (
        echo.
        echo [エラー] Python が見つかりません。
        echo   https://www.python.org/downloads/windows/ から Python 3.11 以上をインストールし、
        echo   インストール時に「Add python.exe to PATH」に必ずチェックを入れてください。
        echo.
        pause
        exit /b 1
    )
)
echo   使用する Python: %PYCMD%

echo.
echo [2/4] 専用の実行環境(仮想環境 .venv)を作成...
%PYCMD% -m venv .venv
if %errorlevel% neq 0 (
    echo [エラー] 仮想環境の作成に失敗しました。
    pause
    exit /b 1
)

echo.
echo [3/4] 必要なライブラリをインストール...
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [エラー] ライブラリのインストールに失敗しました。
    pause
    exit /b 1
)

echo.
echo [4/4] ブラウザ制御用のコンポーネントを準備...
REM インストール済みのGoogle Chromeを使いますが、念のため予備のブラウザも用意します。
".venv\Scripts\python.exe" -m playwright install chromium

echo.
echo ============================================================
echo  セットアップが完了しました。
echo  次は run.bat をダブルクリックしてアプリを起動してください。
echo  （初回起動時にREINSのURLとログイン情報の入力画面が開きます）
echo ============================================================
echo.
pause
