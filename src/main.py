"""
main.py
=======
アプリの入口（エントリポイント）です。run.bat から起動されます。

全体の流れ:
    1) 設定を読み込む（URL等）。未設定なら設定画面を開いてもらう。
    2) ログイン情報を確認。未保存なら設定画面で入力してもらう。
    3) 検索条件の画面を開き、物件種別・沿線・価格を決めてもらう。
    4) Google Chrome を起動し、REINSにログインする（失敗したらメッセージを出して停止）。
    5) 「売買物件検索」の手順（search_recipe.json）を、選んだ条件で実行する。
       設定でオンなら、保存した図面を掲載サイト（Wix）のドロップ枠へ自動で渡す。
    6) 途中で失敗したら、その場で止めて、原因が分かるメッセージを表示する。

起動オプション:
    python main.py            通常起動（自動検索を実行）
    python main.py --settings 設定画面だけを開く
    python main.py --auto     条件画面を出さず、前回保存した条件で実行する
"""

from __future__ import annotations

import sys
import time
import traceback

import conditions
import config
import credentials
import license
from app_logger import get_logger
from browser import DOWNLOAD_DIR, BrowserSession
from reins_login import LOGIN_FAILED_MESSAGE, LoginError, login
from reins_search import StepError, run_recipe
from wix_upload import WIX_CREDENTIAL_SERVICE, publish_all, upload_to_wix


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


def _show_info_dialog(title: str, message: str) -> None:
    """お知らせ（エラーではない）を表示します。"""
    try:
        import tkinter as tk
        from tkinter import messagebox

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        messagebox.showinfo(title, message, parent=root)
        root.destroy()
    except Exception:
        print(f"\n[{title}] {message}\n")


def _wait_until_browser_closed(page) -> None:
    """人がChromeを閉じるまで待ちます（掲載サイトの読み取り処理をブラウザ内で続けるため）。"""
    log = get_logger()
    log.info("掲載サイトでの確認・掲載が終わったら、Chromeを閉じてください。閉じるとアプリも終了します。")
    ctx = page.context
    while True:
        try:
            live = [p for p in ctx.pages if not p.is_closed()]
            if not live:
                return
            live[0].wait_for_timeout(1000)
        except Exception:
            return  # ブラウザが閉じられた


def _hand_over_to_wix(page, settings: dict, started: float, timeout_ms: int) -> int:
    """今回保存した図面を掲載サイト（Wix）のドロップ枠に渡し、人の確認を待ちます。"""
    log = get_logger()
    files = sorted(
        (f for f in DOWNLOAD_DIR.glob("*.pdf") if f.stat().st_mtime >= started - 1),
        key=lambda f: f.name,
    )
    wix = credentials.load_credentials(WIX_CREDENTIAL_SERVICE)
    args = (settings.get("wix_site_url", ""), wix.password if wix else "", files, max(timeout_ms, 60000))
    try:
        try:
            wix_page = upload_to_wix(page.context, *args)
        except Exception as exc:
            if "has been closed" not in str(exc):
                raise
            # REINSが画面を閉じた等でChromeが終了していた → Chromeを起動し直して渡す
            log.warning("Chromeが閉じていたため、起動し直して掲載サイトに渡します。")
            import browser

            new_page = browser.CURRENT.relaunch()
            wix_page = upload_to_wix(new_page.context, *args)
        # 読み取りが終わるのを待って「すべてユーザー画面に掲載」を押す
        published = publish_all(wix_page)
    except Exception as exc:
        log.error("掲載サイトへの受け渡しに失敗しました: %s\n%s", exc, traceback.format_exc())
        _show_error_dialog(
            "掲載サイトへの受け渡しに失敗",
            f"図面は {DOWNLOAD_DIR} に保存済みです。\n"
            f"掲載サイトへの自動の受け渡しだけ失敗しました。\n\n{exc}",
        )
        return 4

    _announce_published(files, published)
    _wait_until_browser_closed(wix_page)
    return 0


def _announce_published(files, published: str) -> None:
    names = "\n".join("・" + f.name for f in files)
    held = "掲載しなかった" in published or "✖" in published
    _show_info_dialog(
        "掲載サイトに掲載しました",
        f"図面 {len(files)} 件を読み取り、「すべてユーザー画面に掲載」を押しました。\n{names}\n\n"
        f"【結果】\n{published}\n\n"
        + ("※掲載されずに残った物件は、Chromeの画面で足りない項目を入力して掲載してください。\n\n" if held else "")
        + "確認が終わったら Chrome を閉じてください（アプリも終了します）。",
    )


def _ensure_ready() -> dict:
    """
    起動前チェック。URLとログイン情報が揃うまで設定画面へ誘導します。
    揃ったら settings を返します。
    """
    log = get_logger()
    settings = config.load_settings()
    service = settings.get("credential_service", "reins-auto-search")

    need_settings = (
        (not settings.get("login_url"))
        or (not credentials.has_credentials(service))
        or (license.server_url() and not license.load_key())
    )

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

    # --- ライセンス認証（キー＋REINS IDの紐づけ） ---
    # 配布元が認証サーバーのURLを設定するまでは確認しない（設定した時点から有効になる）
    if not license.server_url():
        log.warning("ライセンス認証サーバーが未設定のため、ライセンス確認を省略します。")
        lic = license.LicenseResult(True, holder="（未設定）")
    else:
        lic = license.verify(license.server_url(), license.load_key(), creds.username)
    if not lic.ok:
        log.error("ライセンス認証に失敗しました: %s", lic.message)
        _show_error_dialog(
            "ライセンス認証",
            lic.message + "\n\nライセンスキーは「settings」（設定画面）で入力・変更できます。",
        )
        return 5
    log.info("ライセンス認証OK（利用者：%s%s）%s", lic.holder or "-",
             f"／有効期限 {lic.expires}" if lic.expires else "", "［オフライン猶予］" if lic.offline else "")

    timeout_ms = int(settings.get("default_timeout_ms", 15000))

    # --- 検索条件を決める（起動時に条件画面を表示） ---
    if "--auto" in argv:
        cond = conditions.load_conditions()
    else:
        try:
            import conditions_gui

            cond = conditions_gui.open_conditions()
        except Exception as exc:
            log.error("検索条件の画面を開けませんでした: %s\n%s", exc, traceback.format_exc())
            _show_error_dialog("エラー", f"検索条件の画面を開けませんでした。\n{exc}")
            return 1
        if cond is None:
            log.info("検索条件の画面でキャンセルされました。終了します。")
            return 0
    log.info("検索条件: %s", conditions.summary(cond))

    try:
        recipe = conditions.apply_conditions(config.load_recipe(), cond)
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
            started = time.time()  # この時刻より後に保存された図面を「今回の分」とみなす
            try:
                run_recipe(page, recipe, settings)
            except StepError as exc:
                log.error("検索手順の途中で停止しました:\n%s", exc)
                _show_error_dialog("検索手順で停止", str(exc))
                return 3

            log.info("REINSの検索・図面の保存が完了しました。")

            # --- 掲載サイト（Wix）の管理画面へ資料を渡す（設定でオンのとき） ---
            if settings.get("wix_upload_enabled"):
                return _hand_over_to_wix(page, settings, started, timeout_ms)

            _show_error_dialog("完了", "REINSの自動検索・図面一括取得の手順が完了しました。")
            return 0

    except Exception as exc:  # 想定外のエラー
        log.error("想定外のエラーが発生しました: %s\n%s", exc, traceback.format_exc())
        _show_error_dialog("エラー", f"想定外のエラーが発生しました。\n{exc}")
        return 99


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
