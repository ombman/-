"""
main.py
=======
アプリの入口（エントリポイント）です。run.bat から起動されます。

全体の流れ:
    1) 設定を読み込む（URL等）。未設定なら設定画面を開いてもらう。
    2) ログイン情報を確認。未保存なら設定画面で入力してもらう。
    3) Google Chrome を起動する。
    4) REINSにログインする（失敗したらメッセージを出して停止）。
    5) 「売買物件検索」の手順（search_recipe.json）を実行する。
    6) 途中で失敗したら、その場で止めて、原因が分かるメッセージを表示する。

起動オプション:
    python main.py            通常起動（自動検索を実行）
    python main.py --settings 設定画面だけを開く
"""

from __future__ import annotations

import sys
import traceback

import config
import credentials
from app_logger import get_logger
from browser import BrowserSession
from reins_login import LOGIN_FAILED_MESSAGE, LoginError, login
from reins_search import StepError, run_recipe


def _show_error_dialog(title: str, message: str) -> None:
    """
    エラー内容を分かりやすく画面表示します。
    tkinterが使える環境ならダイアログ、無ければコンソールに表示します。
    """
    try:
        import tkinter as tk
        from tkinter import messagebox

        root = tk.Tk()
        root.withdraw()
        messagebox.showerror(title, message)
        root.destroy()
    except Exception:
        print(f"\n[{title}] {message}\n")


def _ensure_ready() -> dict:
    """
    起動前チェック。URLとログイン情報が揃うまで設定画面へ誘導します。
    揃ったら settings を返します。
    """
    log = get_logger()
    settings = config.load_settings()
    service = settings.get("credential_service", "reins-auto-search")

    need_settings = (not settings.get("login_url")) or (not credentials.has_credentials(service))

    if need_settings:
        log.info("初回設定が必要です。設定画面を開きます。")
        try:
            import settings_gui

            saved = settings_gui.open_settings(require_credentials=True)
        except Exception as exc:
            # GUIが使えない環境向けの案内
            raise SystemExit(
                "設定画面を開けませんでした。config/settings.json にログインURLを設定し、"
                "『python src/settings_gui.py』でログイン情報を登録してください。\n"
                f"詳細: {exc}"
            )
        if not saved:
            raise SystemExit("設定がキャンセルされました。アプリを終了します。")
        settings = config.load_settings()

    return settings


def main(argv: list[str]) -> int:
    log = get_logger()

    # 設定画面のみを開くモード
    if "--settings" in argv:
        import settings_gui

        settings_gui.open_settings(require_credentials=False)
        return 0

    try:
        settings = _ensure_ready()
    except SystemExit as exc:
        print(str(exc))
        return 1

    service = settings.get("credential_service", "reins-auto-search")
    creds = credentials.load_credentials(service)
    if creds is None:
        _show_error_dialog("設定エラー", "ログイン情報が登録されていません。設定画面から登録してください。")
        return 1

    timeout_ms = int(settings.get("default_timeout_ms", 15000))

    try:
        recipe = config.load_recipe()
    except FileNotFoundError as exc:
        _show_error_dialog("設定エラー", str(exc))
        return 1

    try:
        with BrowserSession(settings) as page:
            # --- ログイン ---
            try:
                login(page, settings.get("login_url", ""), creds, timeout_ms)
            except LoginError as exc:
                # 要件どおり、失敗時は先へ進まず決められたメッセージを表示して停止
                message = str(exc) if str(exc) else LOGIN_FAILED_MESSAGE
                log.error(message)
                _show_error_dialog("ログイン失敗", message)
                return 2

            # --- 売買物件検索の手順を実行 ---
            try:
                run_recipe(page, recipe, settings)
            except StepError as exc:
                log.error("検索手順の途中で停止しました:\n%s", exc)
                _show_error_dialog("検索手順で停止", str(exc))
                return 3

            log.info("処理が正常に完了しました。")
            _show_error_dialog("完了", "REINSの自動検索・図面一括取得の手順が完了しました。")
            return 0

    except Exception as exc:  # 想定外のエラー
        log.error("想定外のエラーが発生しました: %s\n%s", exc, traceback.format_exc())
        _show_error_dialog("エラー", f"想定外のエラーが発生しました。\n{exc}")
        return 99


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
