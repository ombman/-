"""
wix_upload.py
=============
REINSから保存した図面PDFを、物件紹介サイト（Wix）の管理画面の
「ここに資料をドラッグ＆ドロップ」枠へ自動で渡すモジュールです。

流れ:
    1) 同じChromeで新しいタブを開き、設定の「掲載サイトのURL」を表示する
    2) サイト内の物件紹介枠（Wixの「HTMLコード」= iframe）を探す
    3) 「管理者ログイン」→ 管理用パスワードを入力 → ログイン
    4) ドラッグ＆ドロップ枠の受け口（ファイル選択欄）にPDFを渡す
       ※ドラッグ＆ドロップと同じ処理（読み取り・情報元の削除）が始まります
    5) 読み取り中の表示が出たことを確認して終了（掲載ボタンは押さない）

管理用パスワードはWindowsの資格情報マネージャー（keyring）に保存し、
コードや設定ファイルには書きません。
"""

from __future__ import annotations

import time
from pathlib import Path

from app_logger import dump_html, get_logger, screenshot

# keyring に保存するときの名前（REINSのログイン情報とは別に保管）
WIX_CREDENTIAL_SERVICE = "reins-auto-search-wix"
WIX_USERNAME = "admin"


class WixUploadError(Exception):
    """Wixへの受け渡しに失敗したことを表す例外。"""


def find_widget_frame(page, timeout_ms: int):
    """物件紹介枠（ドロップ枠や「管理者ログイン」がある iframe）を探して返します。"""
    deadline = time.time() + timeout_ms / 1000
    while time.time() < deadline:
        for frame in page.frames:
            try:
                if frame.locator("#dz").count() and frame.locator("#fileInput").count():
                    return frame
            except Exception:
                continue  # 読み込み途中で消えた枠などは無視
        page.wait_for_timeout(500)
    raise WixUploadError(
        "掲載サイトの中に「資料のドラッグ＆ドロップ」枠が見つかりませんでした。\n"
        "設定画面の「掲載サイトのURL」が、物件紹介ページのURLになっているか確認してください。"
    )


def _login(frame, password: str, timeout_ms: int) -> None:
    log = get_logger()
    body = frame.locator("#adminBody")
    if body.is_visible():
        log.info("  管理画面はログイン済みです。")
        return
    # ユーザー画面の下にある「管理者ログイン」で管理画面に切り替える
    pw = frame.locator("#pw")
    if not pw.is_visible():
        link = frame.locator("#toAdmin")
        link.scroll_into_view_if_needed(timeout=timeout_ms)
        link.click(timeout=timeout_ms)
    pw.wait_for(state="visible", timeout=timeout_ms)
    pw.fill(password, timeout=timeout_ms)
    frame.locator("#btnLogin").click(timeout=timeout_ms)
    # 管理画面が出るか、「パスワードが違います」などの表示が出るまで待つ
    msg = ""
    deadline = time.time() + timeout_ms / 1000
    while time.time() < deadline:
        if body.is_visible():
            log.info("  管理画面にログインしました。")
            return
        try:
            msg = frame.locator("#loginLog").inner_text(timeout=1000).strip()
        except Exception:
            msg = ""
        if msg:
            break
        frame.page.wait_for_timeout(300)
    raise WixUploadError(
        "掲載サイトの管理画面にログインできませんでした。"
        + (f"（画面の表示：{msg}）" if msg else "")
        + "\n設定画面の「掲載サイトの管理用パスワード」を確認してください。"
    )


def upload_to_wix(context, site_url: str, password: str, files: list[Path], timeout_ms: int = 60000):
    """
    files を掲載サイトのドロップ枠へ渡します。成功したらそのタブ（Page）を返します。
    タブは開いたままにし、読み取り結果の確認・掲載は人が行います。
    """
    log = get_logger()
    if not site_url:
        raise WixUploadError("設定画面で「掲載サイトのURL」を入力してください。")
    if not password:
        raise WixUploadError("設定画面で「掲載サイトの管理用パスワード」を入力してください。")
    files = [Path(f) for f in files if Path(f).exists()]
    if not files:
        raise WixUploadError("今回保存した図面のPDFが見つからないため、掲載サイトに渡せませんでした。")

    log.info("掲載サイトを開きます: %s", site_url)
    page = context.new_page()
    page.bring_to_front()
    page.goto(site_url, wait_until="domcontentloaded", timeout=timeout_ms)
    try:
        frame = find_widget_frame(page, timeout_ms)
        _login(frame, password, timeout_ms)

        log.info("ドラッグ＆ドロップ枠に資料を渡します（%d件）: %s", len(files), ", ".join(f.name for f in files))
        dz = frame.locator("#dz")
        dz.scroll_into_view_if_needed(timeout=timeout_ms)
        # 枠の受け口（ファイル選択欄）に渡す。画面上のドロップと同じ読み取り処理が動く
        frame.locator("#fileInput").set_input_files([str(f) for f in files], timeout=timeout_ms)

        # 「◯◯ を読み取り中…」などの表示が出れば受け渡し成功
        frame.locator("#dropLog > *").first.wait_for(state="visible", timeout=timeout_ms)
        log.info("掲載サイトが資料の読み取りを始めました。")
        screenshot(page, "wix_dropped")
        return page
    except Exception:
        screenshot(page, "ERROR_wix")
        dump_html(page, "ERROR_wix")
        raise
