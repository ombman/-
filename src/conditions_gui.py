"""
conditions_gui.py
=================
アプリ起動時に開く「検索条件の設定画面」です（tkinter製）。

    物件種別1 / 沿線1〜3（沿線名・始駅・終駅・駅から徒歩）/ 価格（万円）
を入力し、「この条件で検索開始」を押すと自動検索が始まります。
入力値は config/search_conditions.json に保存され、次回起動時に表示されます。
"""

from __future__ import annotations

import copy
import tkinter as tk
from tkinter import messagebox, ttk

import conditions

# 物件種別1の候補。『売マンション』は実画面で確認済み。
# それ以外は表記が異なる可能性があるため、欄に直接入力もできるようにしている。
SHUBETSU_CHOICES = ["売マンション", "売一戸建", "売土地"]


def open_conditions() -> dict | None:
    """
    条件画面を開きます。
    戻り値: 「この条件で検索開始」→ 条件(dict) ／ キャンセル・×で閉じる → None
    """
    cond = conditions.load_conditions()
    result: dict = {"cond": None}

    root = tk.Tk()
    root.title("REINS自動検索 - 検索条件の設定")
    root.resizable(False, False)

    frm = ttk.Frame(root, padding=16)
    frm.pack(fill="both", expand=True)

    ttk.Label(frm, text="どの条件で検索しますか？", font=("", 13, "bold")).grid(
        row=0, column=0, columnspan=6, sticky="w", pady=(0, 10)
    )

    # --- 物件種別1 ---
    ttk.Label(frm, text="物件種別1").grid(row=1, column=0, sticky="w")
    shubetsu_var = tk.StringVar()
    shubetsu_cb = ttk.Combobox(frm, textvariable=shubetsu_var, values=SHUBETSU_CHOICES, width=16)
    shubetsu_cb.grid(row=1, column=1, columnspan=2, sticky="w", pady=4)

    # --- 沿線1〜3 ---
    ttk.Separator(frm).grid(row=2, column=0, columnspan=6, sticky="we", pady=8)
    for col, head in enumerate(["", "使う", "沿線名", "始駅", "終駅", "駅から徒歩"]):
        ttk.Label(frm, text=head, foreground="#444").grid(row=3, column=col, sticky="w", padx=2)

    ensen_vars = []
    for i in range(conditions.ENSEN_COUNT):
        r = 4 + i
        row_vars = {
            "use": tk.BooleanVar(),
            "line": tk.StringVar(),
            "start": tk.StringVar(),
            "end": tk.StringVar(),
            "walk": tk.StringVar(),
        }
        ttk.Label(frm, text=f"沿線{i + 1}").grid(row=r, column=0, sticky="w", pady=3)
        entries = [
            ttk.Entry(frm, textvariable=row_vars["line"], width=14),
            ttk.Entry(frm, textvariable=row_vars["start"], width=12),
            ttk.Entry(frm, textvariable=row_vars["end"], width=12),
        ]
        for col, ent in enumerate(entries, start=2):
            ent.grid(row=r, column=col, padx=2)
        walk_box = ttk.Frame(frm)
        walk_box.grid(row=r, column=5, sticky="w", padx=2)
        entries.append(ttk.Entry(walk_box, textvariable=row_vars["walk"], width=5))
        entries[-1].pack(side="left")
        ttk.Label(walk_box, text=" 分以内").pack(side="left")

        # 「使う」を外した沿線は入力欄をグレー表示（値は残すので再チェックで元に戻る）
        def sync_state(rv=row_vars, ents=entries):
            for ent in ents:
                ent.state(["!disabled"] if rv["use"].get() else ["disabled"])

        ttk.Checkbutton(frm, variable=row_vars["use"], command=sync_state).grid(row=r, column=1)
        row_vars["_sync"] = sync_state
        ensen_vars.append(row_vars)

    # --- 価格 ---
    ttk.Separator(frm).grid(row=8, column=0, columnspan=6, sticky="we", pady=8)
    ttk.Label(frm, text="価格").grid(row=9, column=0, sticky="w")
    price_box = ttk.Frame(frm)
    price_box.grid(row=9, column=1, columnspan=5, sticky="w")
    pmin_var, pmax_var = tk.StringVar(), tk.StringVar()
    ttk.Entry(price_box, textvariable=pmin_var, width=8).pack(side="left")
    ttk.Label(price_box, text=" 万円 〜 ").pack(side="left")
    ttk.Entry(price_box, textvariable=pmax_var, width=8).pack(side="left")
    ttk.Label(price_box, text=" 万円（空欄＝指定なし）").pack(side="left")

    note = (
        "※ 沿線名・駅名はREINSの表記と完全に同じ文字で入力してください（例: 東海道線 / 香櫨園）。\n"
        "※ 使わない沿線は「使う」のチェックを外してください。入力内容は次回も残ります。"
    )
    ttk.Label(frm, text=note, foreground="#555").grid(
        row=10, column=0, columnspan=6, sticky="w", pady=(12, 8)
    )

    def fill_form(c: dict) -> None:
        shubetsu_var.set(c.get("shubetsu1", ""))
        for row_vars, row in zip(ensen_vars, c.get("ensen", [])):
            row_vars["use"].set(bool(row.get("use")))
            for key in ("line", "start", "end", "walk"):
                row_vars[key].set(row.get(key, ""))
            row_vars["_sync"]()
        pmin_var.set(c.get("price_min", ""))
        pmax_var.set(c.get("price_max", ""))

    def read_form() -> dict:
        return {
            "shubetsu1": conditions.normalize(shubetsu_var.get()),
            "ensen": [
                {
                    "use": bool(rv["use"].get()),
                    **{k: conditions.normalize(rv[k].get()) for k in ("line", "start", "end", "walk")},
                }
                for rv in ensen_vars
            ],
            "price_min": conditions.normalize(pmin_var.get()),
            "price_max": conditions.normalize(pmax_var.get()),
        }

    def checked_form() -> dict | None:
        c = read_form()
        errors = conditions.validate(c)
        if errors:
            messagebox.showwarning("入力を確認してください", "\n".join(errors), parent=root)
            return None
        return c

    def on_start():
        c = checked_form()
        if c is None:
            return
        conditions.save_conditions(c)
        result["cond"] = c
        root.destroy()

    def on_save_only():
        c = checked_form()
        if c is None:
            return
        conditions.save_conditions(c)
        messagebox.showinfo("保存しました", "検索条件を保存しました。", parent=root)

    def on_reset():
        if messagebox.askyesno("確認", "最初の条件（初期値）に戻しますか？", parent=root):
            fill_form(copy.deepcopy(conditions.DEFAULT_CONDITIONS))

    btns = ttk.Frame(frm)
    btns.grid(row=11, column=0, columnspan=6, sticky="we", pady=(4, 0))
    start_btn = ttk.Button(btns, text="この条件で検索開始", command=on_start)
    start_btn.pack(side="right", padx=4)
    ttk.Button(btns, text="保存のみ", command=on_save_only).pack(side="right", padx=4)
    ttk.Button(btns, text="キャンセル", command=root.destroy).pack(side="right", padx=4)
    ttk.Button(btns, text="初期値に戻す", command=on_reset).pack(side="left", padx=4)

    fill_form(cond)

    # 黒い画面(コマンドプロンプト)の後ろに隠れないよう、最前面に出す
    root.lift()
    root.attributes("-topmost", True)
    root.after(300, lambda: root.attributes("-topmost", False))
    start_btn.focus_set()

    # テスト用の参照（自動テストから部品を操作するため）
    root._form = {  # type: ignore[attr-defined]
        "fill": fill_form, "read": read_form, "start": on_start,
        "shubetsu": shubetsu_var, "ensen": ensen_vars, "pmin": pmin_var, "pmax": pmax_var,
    }
    _ON_OPEN(root)
    root.mainloop()
    return result["cond"]


def _noop(_root) -> None:
    pass


# 自動テストで画面を開いた直後に処理を差し込むためのフック（通常は何もしない）
_ON_OPEN = _noop


if __name__ == "__main__":
    print(open_conditions())
