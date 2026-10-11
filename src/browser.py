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

import json
import os
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

from app_logger import get_logger

ROOT_DIR = Path(__file__).resolve().parent.parent
# Chromeのプロファイル(セッション)保存先。ログインCookie等がここに残ります。
USER_DATA_DIR = ROOT_DIR / ".chrome-profile"
# 図面などダウンロードファイルの保存先。
DOWNLOAD_DIR = ROOT_DIR / "downloads"


def _allow_multiple_downloads(log) -> None:
    """
    Chromeの既定では「1サイトからの複数自動ダウンロード」がブロックされ、
    図面の2分割(2ファイル)のうち2つ目が落ちてこない。プロファイルの設定で
    system.reins.jp からの複数ダウンロードを許可しておく。
    """
    try:
        pref_dir = USER_DATA_DIR / "Default"
        pref_dir.mkdir(parents=True, exist_ok=True)
        pref_file = pref_dir / "Preferences"
        data = {}
        if pref_file.exists():
            try:
                data = json.loads(pref_file.read_text(encoding="utf-8"))
            except Exception:
                data = {}
        profile = data.setdefault("profile", {})
        # 全サイト共通: 複数自動ダウンロードを許可(1=許可)
        dcs = profile.setdefault("default_content_setting_values", {})
        dcs["automatic_downloads"] = 1
        # 念のため reins ドメインを明示的に許可
        cs = profile.setdefault("content_settings", {})
        exc = cs.setdefault("exceptions", {})
        auto = exc.setdefault("automatic_downloads", {})
        for pat in ("https://system.reins.jp:443,*", "https://reins.jp:443,*", "[*.]reins.jp,*"):
            auto[pat] = {"setting": 1}
        # 前回のChromeを途中で閉じた場合でも「ページを復元しますか？」を出さない
        profile["exit_type"] = "Normal"
        profile["exited_cleanly"] = True
        pref_file.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        log.debug("複数ダウンロード許可の設定を適用しました。")
    except Exception as exc:
        log.debug("複数ダウンロード許可の設定に失敗（続行）: %s", exc)


# ---------------------------------------------------------------------------
# 前回のChromeが開いたままのときの対処
#   Chromeは同じプロファイル（.chrome-profile）で2つ同時に起動できない。
#   開いたままだと新しいChromeは「既存のブラウザ セッションで開いています」と言って
#   すぐ終了し、アプリは起動直後に止まってしまう。
#   そこで、このアプリ専用プロファイルで動いているChromeを探し、閉じられるようにする。
#   ※ふだん使いのChromeは別のプロファイルなので対象外。
# ---------------------------------------------------------------------------
def _load_psutil():
    """プロセスを調べる部品（psutil）。update では部品が増えないため、無ければその場で追加する。"""
    try:
        import psutil
        return psutil
    except ImportError:
        pass
    log = get_logger()
    log.info("部品（psutil）を追加します（初回のみ・数秒）…")
    try:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "--quiet", "--disable-pip-version-check", "psutil"],
            check=True, timeout=300, capture_output=True,
        )
        import importlib
        importlib.invalidate_caches()
        import psutil
        return psutil
    except Exception as exc:
        log.warning("部品（psutil）を追加できませんでした: %s", exc)
        return None


def find_profile_chrome():
    """
    このアプリ専用プロファイルで動いているChromeのプロセス一覧を返す。
    調べられなかったときは None を返す。
    """
    psutil = _load_psutil()
    if psutil is None:
        return None
    target = os.path.normcase(os.path.abspath(str(USER_DATA_DIR)))
    found = []
    for proc in psutil.process_iter(["pid", "cmdline"]):
        try:
            args = proc.info.get("cmdline") or []
        except Exception:
            continue
        for arg in args:
            if isinstance(arg, str) and arg.startswith("--user-data-dir="):
                value = arg.split("=", 1)[1].strip().strip('"')
                if value and os.path.normcase(os.path.abspath(value)) == target:
                    found.append(proc)
                break
    return found


def close_profile_chrome(procs, timeout: float = 15) -> bool:
    """find_profile_chrome() で見つけたChromeを閉じる。全部閉じられたら True。"""
    psutil = _load_psutil()
    if psutil is None:
        return False
    for proc in procs:
        try:
            proc.kill()
        except Exception:
            pass
    try:
        psutil.wait_procs(procs, timeout=timeout)
    except Exception:
        pass
    # 子プロセスの後始末を待ち、残っていないか確かめる
    deadline = time.time() + timeout
    while time.time() < deadline:
        left = find_profile_chrome()
        if not left:
            time.sleep(0.5)
            return True
        for proc in left:
            try:
                proc.kill()
            except Exception:
                pass
        time.sleep(0.5)
    return not find_profile_chrome()


# いま使っているブラウザセッション（掲載サイトへ渡す前にChromeが閉じていたとき、起動し直すため）
CURRENT = None


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
        global CURRENT
        CURRENT = self
        return self._launch()

    def relaunch(self):
        """Chromeが閉じてしまったとき、同じ設定で起動し直して新しいタブ（Page）を返します。"""
        try:
            if self._context is not None:
                self._context.close()
        except Exception:
            pass
        # 自分が開いたChromeが閉じきっていなければ閉じてから起動する
        return self._launch(close_leftover=True)

    def _launch(self, close_leftover: bool = False):
        log = get_logger()
        _allow_multiple_downloads(log)
        channel = self.settings.get("browser_channel", "chrome")
        headless = bool(self.settings.get("headless", False))
        slow_mo = int(self.settings.get("slow_mo_ms", 300))

        log.info("Google Chrome を起動します（channel=%s, headless=%s）", channel, headless)

        launch_kwargs = dict(
            user_data_dir=str(USER_DATA_DIR),
            headless=headless,
            slow_mo=slow_mo,
            args=["--start-maximized", "--hide-crash-restore-bubble"],
            no_viewport=True,          # ウィンドウサイズに追従
            accept_downloads=True,      # ダウンロードを検出できるようにする（保存はurllibで実施）
        )
        # ※downloads_path は指定しない。指定するとPlaywrightが未完了DLを
        #   記号名(GUID)の壊れファイルとして downloads に残すため。実体の保存は
        #   reins_search の _click_download が Cookie付きurllibで確実に行う。

        def start():
            try:
                return self._pw.chromium.launch_persistent_context(channel=channel, **launch_kwargs)
            except Exception as exc:
                # Google Chrome が見つからない等の場合は Playwright 同梱の Chromium で代替
                log.warning(
                    "channel=%s での起動に失敗したため、Playwright同梱のChromiumで再試行します: %s",
                    channel, str(exc).splitlines()[0],
                )
                return self._pw.chromium.launch_persistent_context(**launch_kwargs)

        try:
            self._context = start()
        except Exception:
            leftover = find_profile_chrome() if close_leftover else None
            if not leftover:
                raise
            log.warning("このアプリ用のChromeが残っていたため閉じて起動し直します（%d プロセス）。", len(leftover))
            close_profile_chrome(leftover)
            self._context = start()

        self._context.set_default_timeout(int(self.settings.get("default_timeout_ms", 15000)))

        # 図面の一括取得は「2つの小窓(window.open)で2ファイルを落とし、各窓を閉じる」挙動。
        # ダウンロードURLは開始時に捕捉して urllib で別途保存するため、窓が閉じても問題ない。
        # window.close だけ無効化し、URLを捕まえる猶予をわずかに稼ぐ（window.openは触らない：
        # 触ると2つ目のダウンロードが発生しなくなるため）。
        try:
            self._context.add_init_script("try{ window.close = function(){}; }catch(e){}")
        except Exception as exc:
            log.debug("window.close 無効化スクリプトの登録に失敗（続行）: %s", exc)

        # 既に開いているタブがあれば使い、無ければ新規に開く
        # ※図面のダウンロード保存は reins_search の click_download が
        #   expect_download で確実に行う（ここでの自動ハンドラは二重保存になるため付けない）。
        self.page = self._context.pages[0] if self._context.pages else self._context.new_page()

        # 保存用の常駐タブ（keep-alive）を1枚開く。
        # 図面の一括取得後にREINSが操作ウィンドウを閉じても、この空タブが残るため
        # コンテキスト（ブラウザ接続）が生き続けやすくなる。
        try:
            self._keepalive = self._context.new_page()
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
        except Exception as close_exc:  # 人がChromeを先に閉じた場合など
            log.debug("ブラウザ終了時の後始末で例外（無視）: %s", close_exc)
        finally:
            if self._pw is not None:
                self._pw.stop()
        log.info("ブラウザを終了しました。")
        # 例外は握りつぶさず呼び出し側へ伝える
        return False
