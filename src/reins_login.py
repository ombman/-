"""
reins_login.py
==============
REINSへのログイン処理を担当するモジュールです。

要件どおりの流れ:
    1) REINSのログインページを開く
    2) ID・パスワードを入力（安全な保管庫から取得。画面には表示しない）
    3) 「所属機構の規程及びガイドラインを遵守します」のチェックを（未チェックなら）付ける
    4) 「ログイン」ボタンをクリック
    5) ログイン後の画面が表示されたことを確認
    6) 失敗時は先へ進まず、決められたメッセージを表示して停止

注意:
    REINSの実際のHTML要素名（id/name）は環境により異なる可能性があるため、
    「見える日本語ラベルやボタン名」を優先しつつ、複数の候補で特定を試みます。
    うまく当たらない場合は config/search_recipe.json 側と同様に、
    このファイル内の targets 候補を調整してください。
"""

from __future__ import annotations

from app_logger import get_logger, screenshot
from credentials import Credentials
from locator import (
    check_target,
    click_target,
    fill_target,
    is_visible,
)

LOGIN_FAILED_MESSAGE = "REINSへのログインに失敗しました。ログイン情報を確認してください。"


class LoginError(Exception):
    """ログインに失敗したことを表す例外。"""


# --- 要素の特定候補（上から順に試す） -------------------------------------

# ログインID入力欄
ID_TARGETS = [
    {"by": "label", "value": "ID"},
    {"by": "label", "value": "ユーザーID"},
    {"by": "label", "value": "会員専用ID"},
    {"by": "placeholder", "value": "ID"},
    {"by": "name", "value": "userId"},
    {"by": "name", "value": "loginId"},
    {"by": "name", "value": "id"},
    {"by": "css", "value": "input[type='text']"},
]

# パスワード入力欄
PW_TARGETS = [
    {"by": "label", "value": "パスワード"},
    {"by": "placeholder", "value": "パスワード"},
    {"by": "name", "value": "password"},
    {"by": "name", "value": "passwd"},
    {"by": "css", "value": "input[type='password']"},
]

# 「規程及びガイドラインを遵守します」チェックボックス
COMPLIANCE_TARGETS = [
    {"by": "label", "value": "所属機構の規程及びガイドラインを遵守します"},
    {"by": "label", "value": "規程及びガイドラインを遵守します"},
    {"by": "text", "value": "規程及びガイドラインを遵守します"},
    {"by": "css", "value": "input[type='checkbox']"},
]

# 「ログイン」ボタン
LOGIN_BUTTON_TARGETS = [
    {"by": "role", "value": "ログイン", "options": {"role": "button"}},
    {"by": "text", "value": "ログイン"},
    {"by": "css", "value": "button[type='submit']"},
    {"by": "css", "value": "input[type='submit']"},
]

# ログイン後にだけ現れる要素（成功確認に使う）
POST_LOGIN_MARKERS = [
    {"by": "text", "value": "売買物件検索"},
    {"by": "text", "value": "物件検索"},
    {"by": "text", "value": "ログアウト"},
    {"by": "text", "value": "メニュー"},
]

# ログイン失敗時にだけ現れる要素（失敗確認に使う）
LOGIN_ERROR_MARKERS = [
    {"by": "text", "value": "IDまたはパスワード"},
    {"by": "text", "value": "パスワードが正しくありません"},
    {"by": "text", "value": "ログインできません"},
    {"by": "text", "value": "認証に失敗"},
]


def login(page, login_url: str, creds: Credentials, timeout_ms: int) -> None:
    """
    REINSへログインします。成功時は正常終了、失敗時は LoginError を送出します。
    """
    log = get_logger()

    if not login_url:
        raise LoginError(
            "REINSのログインURLが設定されていません。設定画面またはconfig/settings.jsonで指定してください。"
        )

    # 1) ログインページを開く
    log.info("REINSのログインページを開きます: %s", login_url)
    page.goto(login_url, wait_until="domcontentloaded", timeout=timeout_ms)
    screenshot(page, "01_login_page")

    # 2) ID・パスワードを入力（値はログに出さない）
    log.info("ログインIDを入力します。")
    fill_target(page, ID_TARGETS, creds.username, timeout_ms)
    log.info("パスワードを入力します。（※内容は表示・記録しません）")
    fill_target(page, PW_TARGETS, creds.password, timeout_ms)
    screenshot(page, "02_credentials_filled")

    # 3) 規程遵守チェック（未チェックなら付ける）。存在しない画面もあり得るので任意扱い。
    if is_visible(page, COMPLIANCE_TARGETS, timeout_ms=3000):
        log.info("「規程及びガイドラインを遵守します」にチェックを付けます。")
        check_target(page, COMPLIANCE_TARGETS, timeout_ms)
    else:
        log.info("規程遵守チェック項目は見つかりませんでした（この画面には無い可能性）。続行します。")

    # 4) ログインボタンをクリック
    log.info("「ログイン」ボタンをクリックします。")
    click_target(page, LOGIN_BUTTON_TARGETS, timeout_ms)

    # 画面遷移の待機
    try:
        page.wait_for_load_state("networkidle", timeout=timeout_ms)
    except Exception:
        pass  # networkidleにならない画面もあるため無視
    screenshot(page, "03_after_login_click")

    # 5) 成否の確認
    if is_visible(page, LOGIN_ERROR_MARKERS, timeout_ms=3000):
        log.error(LOGIN_FAILED_MESSAGE)
        raise LoginError(LOGIN_FAILED_MESSAGE)

    if is_visible(page, POST_LOGIN_MARKERS, timeout_ms=timeout_ms):
        log.info("ログイン後の画面を確認しました。ログイン成功です。")
        screenshot(page, "04_login_success")
        return

    # 成功マーカーも失敗マーカーも見つからない → 安全側で失敗扱いにする
    log.error("ログイン後の画面を確認できませんでした。%s", LOGIN_FAILED_MESSAGE)
    screenshot(page, "04_login_unknown")
    raise LoginError(LOGIN_FAILED_MESSAGE)
