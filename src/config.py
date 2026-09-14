"""
config.py
=========
設定ファイル（config/settings.json）と検索手順ファイル
（config/search_recipe.json）を読み書きするモジュールです。

方針:
    REINSのURLなどは「コードに直書きせず、設定ファイルから変える」ことが要件です。
    settings.json が無い場合は settings.example.json を雛形としてコピーします。
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from app_logger import get_logger

ROOT_DIR = Path(__file__).resolve().parent.parent
CONFIG_DIR = ROOT_DIR / "config"

SETTINGS_PATH = CONFIG_DIR / "settings.json"
SETTINGS_EXAMPLE_PATH = CONFIG_DIR / "settings.example.json"
RECIPE_PATH = CONFIG_DIR / "search_recipe.json"


def load_settings() -> dict[str, Any]:
    """
    settings.json を読み込みます。
    無い場合は settings.example.json からコピーして作成します。
    """
    log = get_logger()
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)

    if not SETTINGS_PATH.exists():
        if SETTINGS_EXAMPLE_PATH.exists():
            shutil.copyfile(SETTINGS_EXAMPLE_PATH, SETTINGS_PATH)
            log.info("settings.json が無かったため雛形からコピーしました: %s", SETTINGS_PATH)
        else:
            # 雛形も無ければ最小の初期値を作る
            SETTINGS_PATH.write_text(
                json.dumps(_default_settings(), ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            log.info("初期 settings.json を作成しました: %s", SETTINGS_PATH)

    with SETTINGS_PATH.open(encoding="utf-8") as f:
        data = json.load(f)

    # 既定値で不足キーを補完（古い設定ファイルでも動くように）
    merged = _default_settings()
    merged.update(data)
    return merged


def save_settings(settings: dict[str, Any]) -> None:
    """settings.json を保存します（設定画面から呼びます）。"""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(
        json.dumps(settings, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    get_logger().info("settings.json を保存しました。")


def load_recipe() -> dict[str, Any]:
    """検索手順（search_recipe.json）を読み込みます。"""
    if not RECIPE_PATH.exists():
        raise FileNotFoundError(
            f"検索手順ファイルが見つかりません: {RECIPE_PATH}\n"
            "config/search_recipe.json を用意してください。"
        )
    with RECIPE_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def _default_settings() -> dict[str, Any]:
    """設定の既定値。URLは空にして『推測で固定しない』要件を守ります。"""
    return {
        # REINSのログインページURL。※必ず設定画面またはこのファイルで入力してください。
        #   コード側では推測・固定しません（空のままだと起動時に入力を求めます）。
        "login_url": "",
        # ブラウザ設定
        "browser_channel": "chrome",   # "chrome"=インストール済みのGoogle Chromeを使う
        "headless": False,             # False=画面を表示して動かす（初心者は False 推奨）
        "slow_mo_ms": 300,             # 各操作の間に置く待ち時間(ミリ秒)。動きを見やすくする
        "default_timeout_ms": 15000,   # 要素を探す最大待ち時間(ミリ秒)
        # 認証情報を保存するときのキー名（keyring内での識別用。変更不要）
        "credential_service": "reins-auto-search",
        # 操作の合間に確認のため一時停止するか（True にすると各ステップでEnter待ち）
        "step_by_step_pause": False,
    }
