"""
build_release.py
================
配布用ZIP（dist/REINS-auto-search.zip）を作ります。

    python tools/build_release.py

ZIPの中身: REINS-auto-search/ フォルダに、アプリ本体と install.bat、
README.txt（はじめにお読みください）を入れます。
個人の設定（settings.json / search_conditions.json）やログは含めません。
"""

from __future__ import annotations

import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
TOP = "REINS-auto-search"
ZIP_PATH = DIST / f"{TOP}.zip"

FILES = [
    "install.bat", "setup.bat", "run.bat", "settings.bat", "update.bat",
    "requirements.txt",
    "config/search_recipe.json", "config/settings.example.json",
]


def main() -> None:
    DIST.mkdir(exist_ok=True)
    files = [ROOT / f for f in FILES] + sorted((ROOT / "src").glob("*.py"))
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as z:
        for f in files:
            z.write(f, f"{TOP}/{f.relative_to(ROOT).as_posix()}")
        # Windowsのメモ帳で文字化けしないよう BOM付きUTF-8 で入れる
        text = (ROOT / "tools" / "README_JA.txt").read_text(encoding="utf-8")
        z.writestr(f"{TOP}/README.txt", "\ufeff" + text.replace("\n", "\r\n"))
    print(f"作成しました: {ZIP_PATH}（{ZIP_PATH.stat().st_size // 1024} KB, {len(files) + 1} ファイル）")


if __name__ == "__main__":
    main()
