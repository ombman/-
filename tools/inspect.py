"""
tools/inspect.py
================
「REINSの実際の画面で、ボタンや入力欄の“正しい特定条件”を調べる」ための
補助ツールです。セレクタ調整に使います。

使い方（コマンドプロンプトで）:
    cd （このプロジェクトのフォルダ）
    python tools\\inspect.py

起動すると Google Chrome が開き、Playwright の「Inspector」ウィンドウも開きます。
Inspector の「Explore」ボタンを押してから画面上の要素をクリックすると、
その要素を特定するセレクタ（例: get_by_role("button", name="ログイン")）が表示されます。
その内容を config/search_recipe.json の targets に反映すると確実です。

※このツールは操作の自動実行はしません。手動で画面を確認・操作しながら調べる用です。
"""

from __future__ import annotations

import sys
from pathlib import Path

# src/ をインポートできるようにする
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

import config  # noqa: E402
from browser import BrowserSession  # noqa: E402


def main() -> int:
    settings = config.load_settings()
    url = settings.get("login_url", "")
    if not url:
        print("先に設定画面でREINSのログインURLを設定してください（run.bat →設定、または python src\\settings_gui.py）。")
        return 1

    print("Google Chrome を起動します。Inspectorウィンドウで要素を調べてください。")
    with BrowserSession(settings) as page:
        page.goto(url, wait_until="domcontentloaded")
        # ここで一時停止。Inspectorが開き、要素のセレクタを調べられます。
        page.pause()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
