"""
browser.py
==========
Google Chrome を Playwright 経由で起動・終了するモジュールです。

ポイント:
    - browser_channel="chrome" にすると、パソコンにインストール済みの
      Google Chrome をそのまま自動操作します（要件どおり Chrome を使用）。
    - ログイン状態などを保つため「永続コンテキスト（user-data-dir）」を使い、
      毎回まっさらではなく前回のセッションを引き継げるようにします。
    - headless=False（画面を表示）にして、初心者でも動きを目で追えるようにします。
"""

from __future__ import annotations

import time
from pathlib import Path

from playwright.sync_api import sync_playwright

from app_logger import get_logger

ROOT_DIR = Path(__file__).resolve().parent.parent
# Chromeのプロファイル(セッション)保存先。ログインCookie等がここに残ります。
USER_DATA_DIR = ROOT_DIR / ".chrome-profile"
# 図面などダウンロードファイルの保存先。
DOWNLOAD_DIR = ROOT_DIR / "downloads"


class BrowserSession:
    """
    with 文で使えるブラウザセッション。

        with BrowserSession(settings) as page:
            page.goto(...)
    """

    def __init__(self, settings: dict):
        self.settings = settings
        self._pw = None
        self._context = None
        self.page = None
        self._keepalive = None  # ダウンロード保存中に接続が切れないための常駐タブ

    def __enter__(self):
        log = get_logger()
        USER_DATA_DIR.mkdir(parents=True, exist_ok=True)
        DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

        self._pw = sync_playwright().start()
        channel = self.settings.get("browser_channel", "chrome")
        headless = bool(self.settings.get("headless", False))
        slow_mo = int(self.settings.get("slow_mo_ms", 300))

        log.info("Google Chrome を起動します（channel=%s, headless=%s）", channel, headless)

        launch_kwargs = dict(
            user_data_dir=str(USER_DATA_DIR),
            headless=headless,
            slow_mo=slow_mo,
            args=["--start-maximized"],
            no_viewport=True,          # ウィンドウサイズに追従
            accept_downloads=True,      # 図面などのダウンロードを許可
            downloads_path=str(DOWNLOAD_DIR),  # ダウンロード保存先
        )

        try:
            self._context = self._pw.chromium.launch_persistent_context(
                channel=channel, **launch_kwargs
            )
        except Exception as exc:
            # Google Chrome が見つからない等の場合は Playwright 同梱の Chromium で代替
            log.warning(
                "channel=%s での起動に失敗したため、Playwright同梱のChromiumで再試行します: %s",
                channel, exc,
            )
            self._context = self._pw.chromium.launch_persistent_context(**launch_kwargs)

        self._context.set_default_timeout(int(self.settings.get("default_timeout_ms", 15000)))

        # ダウンロード（図面など）を downloads フォルダへ確実に保存する。
        # ※Playwrightは download イベントを受けて save_as しないとファイルが残らない。
        self._context.on("page", lambda p: p.on("download", self._save_download))

        # 既に開いているタブがあれば使い、無ければ新規に開く
        self.page = self._context.pages[0] if self._context.pages else self._context.new_page()
        # 現在のページにもダウンロード保存を登録
        self.page.on("download", self._save_download)

        # 保存用の常駐タブ（keep-alive）を1枚開く。
        # 図面の一括取得後にREINSが操作ウィンドウを閉じても、この空タブが残るため
        # コンテキスト（ブラウザ接続）が生き続け、ダウンロードを保存しきれる。
        try:
            self._keepalive = self._context.new_page()
            self._keepalive.on("download", self._save_download)
            self.page.bring_to_front()
        except Exception as exc:
            log.debug("keep-aliveタブの作成に失敗（続行）: %s", exc)
            self._keepalive = None

        return self.page

    def _save_download(self, download) -> None:
        """ダウンロードされたファイルを downloads フォルダへ保存します。"""
        log = get_logger()
        try:
            name = download.suggested_filename or f"download_{int(time.time())}"
            target = DOWNLOAD_DIR / name
            # 同名があれば上書きを避けてタイムスタンプを付与
            if target.exists():
                target = DOWNLOAD_DIR / f"{target.stem}_{int(time.time())}{target.suffix}"
            download.save_as(str(target))
            log.info("ダウンロードを保存しました: %s", target)
        except Exception as exc:  # 保存失敗で全体を止めない
            log.warning("ダウンロードの保存に失敗しました: %s", exc)

    def __exit__(self, exc_type, exc, tb):
        log = get_logger()
        try:
            if self._context is not None:
                self._context.close()
        finally:
            if self._pw is not None:
                self._pw.stop()
        log.info("ブラウザを終了しました。")
        # 例外は握りつぶさず呼び出し側へ伝える
        return False
