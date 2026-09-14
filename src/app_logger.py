"""
app_logger.py
=============
ログ出力とスクリーンショット保存をまとめたモジュールです。

目的:
    自動操作は「今どのステップにいて」「何を探して」「成功したか失敗したか」を
    記録しておくことがとても重要です。失敗したときに原因を追えるように、
    テキストログ（logs/reins_YYYYMMDD.log）と、各操作時点の画面写真
    （logs/shots/ 以下）を残します。

プログラミング初心者向けメモ:
    このファイルの中身を理解できなくても、他のファイルから
        log = get_logger()
        log.info("メッセージ")
    のように呼ぶだけで使えます。
"""

from __future__ import annotations

import logging
import sys
from datetime import datetime
from pathlib import Path

# プロジェクトのルート（このファイルの2つ上 = リポジトリ直下）
ROOT_DIR = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT_DIR / "logs"
SHOT_DIR = LOG_DIR / "shots"

_logger: logging.Logger | None = None


def get_logger() -> logging.Logger:
    """アプリ全体で共有する logger を返します（初回だけ初期化）。"""
    global _logger
    if _logger is not None:
        return _logger

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    SHOT_DIR.mkdir(parents=True, exist_ok=True)

    logger = logging.getLogger("reins")
    logger.setLevel(logging.DEBUG)
    logger.propagate = False

    fmt = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # 画面（コンソール）へ出力
    stream = logging.StreamHandler(stream=sys.stdout)
    stream.setLevel(logging.INFO)
    stream.setFormatter(fmt)
    logger.addHandler(stream)

    # ファイルへ出力（日付ごと）
    log_file = LOG_DIR / f"reins_{datetime.now():%Y%m%d}.log"
    file_handler = logging.FileHandler(log_file, encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(fmt)
    logger.addHandler(file_handler)

    _logger = logger
    logger.info("ログ開始（ログファイル: %s）", log_file)
    return logger


def screenshot(page, name: str) -> Path | None:
    """
    現在のブラウザ画面を画像として保存します。

    引数:
        page : Playwright の Page オブジェクト
        name : ファイル名に使う分かりやすい名前（例: "01_login"）
    戻り値:
        保存した画像のパス（失敗時は None）
    """
    try:
        SHOT_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%H%M%S")
        path = SHOT_DIR / f"{stamp}_{name}.png"
        page.screenshot(path=str(path), full_page=True)
        get_logger().debug("スクリーンショット保存: %s", path)
        return path
    except Exception as exc:  # 画面写真の失敗で全体を止めない
        get_logger().warning("スクリーンショット保存に失敗: %s", exc)
        return None
