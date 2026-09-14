@echo off
rem ============================================================
rem  update.bat
rem  GitHubから最新版を取得して src / config を更新します。
rem  .venv（部品）や settings.json（あなたの設定）は保持します。
rem  ※初回セットアップ済みのフォルダで実行してください。
rem ============================================================
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo  最新版に更新します
echo  （.venv と あなたの設定 settings.json はそのまま保持されます）
echo ============================================================
echo.

set "ZIPURL=https://codeload.github.com/ombman/-/zip/refs/heads/claude/reins-auto-search-app-m5im0v"
set "TMPDIR=%TEMP%\reins_update"

rmdir /s /q "%TMPDIR%" 2>nul
mkdir "%TMPDIR%" 2>nul

echo [1/3] ダウンロードしています...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%ZIPURL%' -OutFile '%TMPDIR%\update.zip' -UseBasicParsing } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 goto :fail

echo [2/3] 展開しています...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { Expand-Archive -Path '%TMPDIR%\update.zip' -DestinationPath '%TMPDIR%' -Force } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 goto :fail

set "EXROOT="
for /d %%D in ("%TMPDIR%\*") do set "EXROOT=%%D"
if not defined EXROOT goto :fail

echo [3/3] ファイルを更新しています...
rem robocopy の戻り値は 0〜7 が正常のため、直後の errorlevel 判定は行わない。
robocopy "!EXROOT!\src" "%CD%\src" /E /NFL /NDL /NJH /NJS /NC /NS /NP >nul
robocopy "!EXROOT!\config" "%CD%\config" /E /NFL /NDL /NJH /NJS /NC /NS /NP >nul

rmdir /s /q "%TMPDIR%" 2>nul

echo.
echo ============================================================
echo  更新が完了しました。
echo  続いて run.bat をダブルクリックしてください。
echo ============================================================
echo.
pause
exit /b 0

:fail
echo.
echo [ERROR] 更新に失敗しました。
echo   - インターネットに接続されているか確認してください。
echo   - うまくいかない場合は、GitHubからZIPを再ダウンロードし、
echo     setup.bat を実行し直してください。
rmdir /s /q "%TMPDIR%" 2>nul
echo.
pause
exit /b 1
