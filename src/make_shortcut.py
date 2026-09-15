"""
make_shortcut.py
================
デスクトップに「REINS自動検索」アプリのショートカット（アイコン）を作成します。

使い方（初回のみ・コマンド画面で）:
    C:\reins\.venv\Scripts\python.exe C:\reins\src\make_shortcut.py

- ダブルクリックで run.bat が起動するショートカットをデスクトップに作ります。
- 専用アイコン（assets/app.ico）も自動生成して割り当てます。
"""

from __future__ import annotations

import base64
import struct
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 埋め込みアイコン（PNG, 256x256）
_ICON_PNG_B64 = """\
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
"""


def _write_ico(png_bytes: bytes, ico_path: Path) -> None:
    """PNGを1枚だけ含むICOファイルを書き出す（Vista以降はICO内PNGに対応）。"""
    size = len(png_bytes)
    header = struct.pack("<HHH", 0, 1, 1)            # reserved=0, type=1, count=1
    entry = struct.pack("<BBBBHHII", 0, 0, 0, 0, 1, 32, size, 22)
    ico_path.write_bytes(header + entry + png_bytes)


def main() -> int:
    ico = None
    try:
        assets = ROOT / "assets"
        assets.mkdir(parents=True, exist_ok=True)
        ico = assets / "app.ico"
        _write_ico(base64.b64decode(_ICON_PNG_B64), ico)
    except Exception as exc:  # アイコン生成に失敗してもショートカットは作る
        print("アイコン生成に失敗（続行）:", exc)
        ico = None

    run_bat = ROOT / "run.bat"
    parts = [
        "$ws = New-Object -ComObject WScript.Shell;",
        "$d = [Environment]::GetFolderPath('Desktop');",
        "$lnk = Join-Path $d 'REINS自動検索.lnk';",
        "$sc = $ws.CreateShortcut($lnk);",
        "$sc.TargetPath = '" + str(run_bat) + "';",
        "$sc.WorkingDirectory = '" + str(ROOT) + "';",
        "$sc.Description = 'REINS自動検索';",
        "$sc.Save();",
        "Write-Host ('created: ' + $lnk)",
    ]
    if ico is not None:
        parts.insert(6, "$sc.IconLocation = '" + str(ico) + "';")
    ps = "".join(parts)

    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
            check=False,
        )
    except Exception as exc:
        print("ショートカット作成に失敗しました:", exc)
        return 1
    print("デスクトップに「REINS自動検索」アイコンを作成しました。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
