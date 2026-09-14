"""
credentials.py
==============
REINSのログインID・パスワードを「安全に」保存・取得するモジュールです。

安全性のポイント:
    - パスワードをソースコードや設定ファイル（settings.json）には保存しません。
    - keyring ライブラリを通じて OS の安全な保管庫に保存します。
      Windows では「資格情報マネージャー（Credential Manager）」に暗号化されて
      保存されるため、他のアプリやテキストとして読み取られにくくなります。
    - 画面表示時もマスク（●●●）します（settings_gui.py 側で対応）。

用語:
    keyring（キーリング）… OSごとの安全なパスワード保管庫を共通の書き方で
                            使えるようにするPythonライブラリ。
"""

from __future__ import annotations

from dataclasses import dataclass

import keyring

from app_logger import get_logger

# keyring 内でユーザー名を保存する際のキー名
_USERNAME_KEY = "__reins_username__"


@dataclass
class Credentials:
    username: str
    password: str


def save_credentials(service: str, username: str, password: str) -> None:
    """
    ID・パスワードをOSの安全な保管庫に保存します。

    引数:
        service  : サービス識別名（settings.json の credential_service）
        username : ログインID
        password : パスワード
    """
    # ユーザー名（ID）自体も保管庫に入れる。
    keyring.set_password(service, _USERNAME_KEY, username)
    # パスワードは「service + username」の組で保存。
    keyring.set_password(service, username, password)
    get_logger().info("ログイン情報を安全な保管庫に保存しました（IDのみ記録: %s）", username)


def load_credentials(service: str) -> Credentials | None:
    """
    保存済みのID・パスワードを取得します。
    未保存なら None を返します。
    """
    username = keyring.get_password(service, _USERNAME_KEY)
    if not username:
        return None
    password = keyring.get_password(service, username)
    if password is None:
        return None
    return Credentials(username=username, password=password)


def delete_credentials(service: str) -> None:
    """保存済みのID・パスワードを削除します（設定画面のリセット用）。"""
    username = keyring.get_password(service, _USERNAME_KEY)
    try:
        if username:
            keyring.delete_password(service, username)
        keyring.delete_password(service, _USERNAME_KEY)
        get_logger().info("保存済みのログイン情報を削除しました。")
    except keyring.errors.PasswordDeleteError:
        # もともと無い場合など。無視してよい。
        pass


def has_credentials(service: str) -> bool:
    """ID・パスワードが保存済みかどうかを返します。"""
    return load_credentials(service) is not None
