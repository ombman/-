"""
conditions.py
=============
「検索条件（物件種別・沿線・価格）」を保存・読み込みし、検索手順
（search_recipe.json）へ差し込むモジュールです。

仕組み:
    - 条件は config/search_conditions.json に保存します（起動時の条件画面で編集）。
    - search_recipe.json の value などに書かれた {{ensen1_start}} のような
      「差し込み記号」を、保存された条件の値に置き換えます。
    - ステップに "requires": ["price_min"] のように書いておくと、その条件が
      空欄（または沿線を「使わない」）の場合はステップごと省きます。
"""

from __future__ import annotations

import copy
import json
import re
import unicodedata
from pathlib import Path
from typing import Any

from app_logger import get_logger

ROOT_DIR = Path(__file__).resolve().parent.parent
CONDITIONS_PATH = ROOT_DIR / "config" / "search_conditions.json"

ENSEN_COUNT = 3

# 初期値（これまで固定で使っていた条件と同じ）
DEFAULT_CONDITIONS: dict[str, Any] = {
    "shubetsu1": "売マンション",
    "ensen": [
        {"use": True, "line": "東海道線", "start": "甲子園口", "end": "さくら夙川", "walk": "10"},
        {"use": True, "line": "阪急神戸線", "start": "西宮北口", "end": "夙川", "walk": "10"},
        {"use": True, "line": "阪神本線", "start": "甲子園", "end": "香櫨園", "walk": "10"},
    ],
    "price_min": "3000",
    "price_max": "7000",
}

_PLACEHOLDER = re.compile(r"\{\{(\w+)\}\}")


def normalize(text: Any) -> str:
    """前後の空白を除き、全角数字などを半角にそろえる（例: '１０' → '10'）。"""
    return unicodedata.normalize("NFKC", str(text or "")).strip()


def load_conditions() -> dict[str, Any]:
    """保存済みの条件を読み込みます。無い・壊れている場合は初期値を返します。"""
    cond = copy.deepcopy(DEFAULT_CONDITIONS)
    if CONDITIONS_PATH.exists():
        try:
            data = json.loads(CONDITIONS_PATH.read_text(encoding="utf-8"))
            for key in ("shubetsu1", "price_min", "price_max"):
                if key in data:
                    cond[key] = str(data[key])
            for i, row in enumerate(data.get("ensen", [])[:ENSEN_COUNT]):
                cond["ensen"][i].update({k: row[k] for k in ("use", "line", "start", "end", "walk") if k in row})
        except Exception as exc:
            get_logger().warning("検索条件ファイルが読めないため初期値を使います: %s", exc)
    return cond


def save_conditions(cond: dict[str, Any]) -> None:
    CONDITIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONDITIONS_PATH.write_text(json.dumps(cond, ensure_ascii=False, indent=2), encoding="utf-8")
    get_logger().info("検索条件を保存しました: %s", CONDITIONS_PATH)


def validate(cond: dict[str, Any]) -> list[str]:
    """入力ミスを日本語メッセージのリストで返します（空なら問題なし）。"""
    errors: list[str] = []
    if not normalize(cond.get("shubetsu1")):
        errors.append("物件種別1を選んでください。")

    for i, row in enumerate(cond.get("ensen", []), start=1):
        if not row.get("use"):
            continue
        line, start, end, walk = (normalize(row.get(k)) for k in ("line", "start", "end", "walk"))
        if not (line or start or end):
            errors.append(f"沿線{i}: 「使う」にチェックがありますが、沿線名・駅名が空です。")
        if (start or end) and not line:
            errors.append(f"沿線{i}: 駅名を入れる場合は沿線名も必須です（REINSの決まり）。")
        if walk and not walk.isdigit():
            errors.append(f"沿線{i}: 駅から徒歩は数字で入力してください（例: 10）。")

    pmin, pmax = normalize(cond.get("price_min")), normalize(cond.get("price_max"))
    for label, v in (("価格の下限", pmin), ("価格の上限", pmax)):
        if v and not v.isdigit():
            errors.append(f"{label}は数字（万円）で入力してください（例: 3000）。")
    if pmin.isdigit() and pmax.isdigit() and int(pmin) > int(pmax):
        errors.append("価格の下限が上限より大きくなっています。")
    return errors


def to_vars(cond: dict[str, Any]) -> dict[str, str]:
    """差し込み記号の名前 → 値 の対応表を作ります。使わない沿線は全て空にします。"""
    v = {
        "shubetsu1": normalize(cond.get("shubetsu1")),
        "price_min": normalize(cond.get("price_min")),
        "price_max": normalize(cond.get("price_max")),
    }
    rows = cond.get("ensen", [])
    for i in range(1, ENSEN_COUNT + 1):
        row = rows[i - 1] if i - 1 < len(rows) else {}
        use = bool(row.get("use"))
        for key in ("line", "start", "end", "walk"):
            v[f"ensen{i}_{key}"] = normalize(row.get(key)) if use else ""
    return v


def _substitute(obj: Any, vars_: dict[str, str]) -> Any:
    if isinstance(obj, str):
        return _PLACEHOLDER.sub(lambda m: vars_.get(m.group(1), m.group(0)), obj)
    if isinstance(obj, list):
        return [_substitute(x, vars_) for x in obj]
    if isinstance(obj, dict):
        return {k: _substitute(x, vars_) for k, x in obj.items()}
    return obj


def apply_conditions(recipe: dict[str, Any], cond: dict[str, Any]) -> dict[str, Any]:
    """
    手順に条件を差し込んだ「実行用の手順」を返します（元の recipe は変更しません）。
    requires の条件が空のステップは除外します。
    """
    log = get_logger()
    vars_ = to_vars(cond)
    steps = []
    for step in recipe.get("steps", []):
        if any(not vars_.get(k) for k in step.get("requires", [])):
            log.info("条件が空欄のため省略: %s", step.get("id"))
            continue
        steps.append(_substitute(step, vars_))
    out = dict(recipe)
    out["steps"] = steps
    return out


def summary(cond: dict[str, Any]) -> str:
    """ログ表示用の1行要約。"""
    v = to_vars(cond)
    parts = [f"種別={v['shubetsu1']}"]
    for i in range(1, ENSEN_COUNT + 1):
        if v[f"ensen{i}_line"] or v[f"ensen{i}_start"]:
            walk = f" 徒歩{v[f'ensen{i}_walk']}分" if v[f"ensen{i}_walk"] else ""
            parts.append(
                f"沿線{i}={v[f'ensen{i}_line']} {v[f'ensen{i}_start']}〜{v[f'ensen{i}_end']}{walk}"
            )
    parts.append(f"価格={v['price_min'] or '下限なし'}〜{v['price_max'] or '上限なし'}万円")
    return " / ".join(parts)
