"""
license.py
==========
ライセンス認証（ライセンスキー＋REINS IDとの紐づけ）。

    起動時に「ライセンスキー」と「REINS IDを暗号化した値」を認証サーバー
    （Google Apps Script）に送り、有効かどうかを確かめます。
    1つのキーは、最初に使ったREINS ID 1つにだけ紐づきます。

・REINS IDそのものは送りません。SHA-256（元に戻せない暗号化）をかけた値だけを送ります。
・ライセンスキーはWindowsの資格情報マネージャー（keyring）に保存します。
・ネットにつながらないときは、最後に認証できてから OFFLINE_GRACE_DAYS 日以内なら起動を許可します。
"""

from __future__ import annotations

import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import credentials
from app_logger import get_logger

ROOT_DIR = Path(__file__).resolve().parent.parent
CACHE_PATH = ROOT_DIR / "config" / "license_cache.json"
SERVER_CONFIG = ROOT_DIR / "config" / "license_server.json"

LICENSE_SERVICE = "reins-auto-search-license"
LICENSE_USER = "license"
OFFLINE_GRACE_DAYS = 7
_ID_SALT = "reins-auto-search/v1:"   # 他サービスのハッシュと照合されないための固定の味付け


@dataclass
class LicenseResult:
    ok: bool
    message: str = ""
    holder: str = ""
    expires: str = ""
    offline: bool = False


def server_url() -> str:
    """配布元が config/license_server.json に書いた認証サーバーのURL。"""
    try:
        return str(json.loads(SERVER_CONFIG.read_text(encoding="utf-8")).get("server_url", "")).strip()
    except Exception:
        return ""


def id_hash(reins_id: str) -> str:
    """REINS IDを元に戻せない形（SHA-256）にします。前後の空白・大文字小文字の違いは同じとみなします。"""
    return hashlib.sha256((_ID_SALT + reins_id.strip().lower()).encode("utf-8")).hexdigest()


def load_key() -> str:
    c = credentials.load_credentials(LICENSE_SERVICE)
    return c.password if c else ""


def save_key(key: str) -> None:
    credentials.save_credentials(LICENSE_SERVICE, LICENSE_USER, key.strip().upper())


def _read_cache() -> dict:
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write_cache(data: dict) -> None:
    try:
        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        CACHE_PATH.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    except Exception as exc:
        get_logger().debug("ライセンス情報の一時保存に失敗（続行）: %s", exc)


def verify(server_url: str, key: str, reins_id: str, timeout: float = 15.0) -> LicenseResult:
    """認証サーバーに問い合わせて結果を返します。"""
    log = get_logger()
    if not server_url:
        return LicenseResult(False, "ライセンス認証サーバーのURLが設定されていません。配布元にお問い合わせください。")
    if not key:
        return LicenseResult(False, "ライセンスキーが入力されていません。設定画面で入力してください。")
    key = key.strip().upper()
    h = id_hash(reins_id)
    url = server_url + ("&" if "?" in server_url else "?") + urllib.parse.urlencode({"key": key, "id": h})

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "reins-auto-search"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:   # Apps Scriptの転送(302)は自動で追う
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        # ネットにつながらない・サーバーが落ちている → 最近認証できていれば猶予する
        cache = _read_cache()
        last = float(cache.get("ok_at", 0))
        same = cache.get("key") == key and cache.get("id") == h
        days = (time.time() - last) / 86400
        log.warning("ライセンス認証サーバーに接続できません: %s", exc)
        if same and days <= OFFLINE_GRACE_DAYS:
            left = OFFLINE_GRACE_DAYS - int(days)
            return LicenseResult(True, f"認証サーバーに接続できないため、前回の認証で起動します（あと約{left}日）。",
                                 cache.get("holder", ""), cache.get("expires", ""), offline=True)
        return LicenseResult(False, "ライセンス認証サーバーに接続できませんでした。インターネット接続を確認してください。")

    if data.get("ok"):
        _write_cache({"key": key, "id": h, "ok_at": time.time(),
                      "holder": data.get("holder", ""), "expires": data.get("expires", "")})
        return LicenseResult(True, "", data.get("holder", ""), data.get("expires", ""))
    # 停止・期限切れ・別ID などは、前回の成功記録も消す（猶予で使い続けられないように）
    _write_cache({})
    return LicenseResult(False, data.get("message") or "ライセンスを確認できませんでした。")
