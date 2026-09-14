"""
settings_gui.py
===============
初回起動時や設定変更時に開く「設定画面」です（tkinter製・OS標準で追加インストール不要）。

この画面でできること:
    - REINSのログインURLを入力・変更する（コードに直書きしない要件のため）
    - ログインID・パスワードを入力する（保存は安全な保管庫へ。画面はマスク表示）
    - 保存済みのログイン情報を削除する

セキュリティ:
    パスワード欄は show="●" でマスクし、画面に文字を表示しません。
    保存先はソースコードや設定ファイルではなく、OSの安全な保管庫（keyring）です。
"""

from __future__ import annotations

import tkinter as tk
from tkinter import messagebox, ttk

import config
import credentials


def open_settings(require_credentials: bool = False) -> bool:
    """
    設定画面を開きます。

    引数:
        require_credentials : True の場合、ID/パスワード未入力だと保存させません
                              （初回起動時にログイン情報を必ず入れてもらう用途）。
    戻り値:
        保存して閉じたら True、キャンセルしたら False
    """
    settings = config.load_settings()
    service = settings.get("credential_service", "reins-auto-search")
    existing = credentials.load_credentials(service)

    result = {"saved": False}

    root = tk.Tk()
    root.title("REINS自動検索アプリ 設定")
    root.geometry("520x360")
    root.resizable(False, False)

    frm = ttk.Frame(root, padding=16)
    frm.pack(fill="both", expand=True)

    # --- REINS ログインURL ---
    ttk.Label(frm, text="REINS ログインページのURL").grid(row=0, column=0, sticky="w", pady=(0, 2))
    url_var = tk.StringVar(value=settings.get("login_url", ""))
    url_entry = ttk.Entry(frm, textvariable=url_var, width=60)
    url_entry.grid(row=1, column=0, columnspan=2, sticky="we", pady=(0, 12))

    # --- ログインID ---
    ttk.Label(frm, text="ログインID").grid(row=2, column=0, sticky="w", pady=(0, 2))
    id_var = tk.StringVar(value=(existing.username if existing else ""))
    id_entry = ttk.Entry(frm, textvariable=id_var, width=40)
    id_entry.grid(row=3, column=0, columnspan=2, sticky="we", pady=(0, 12))

    # --- パスワード（マスク表示） ---
    pw_label = "パスワード" + ("（保存済み。変更する場合のみ入力）" if existing else "")
    ttk.Label(frm, text=pw_label).grid(row=4, column=0, sticky="w", pady=(0, 2))
    pw_var = tk.StringVar(value="")
    pw_entry = ttk.Entry(frm, textvariable=pw_var, width=40, show="●")  # ● でマスク
    pw_entry.grid(row=5, column=0, columnspan=2, sticky="we", pady=(0, 4))

    # パスワードの表示/非表示トグル
    show_var = tk.BooleanVar(value=False)

    def toggle_show():
        pw_entry.configure(show="" if show_var.get() else "●")

    ttk.Checkbutton(frm, text="パスワードを表示", variable=show_var, command=toggle_show).grid(
        row=6, column=0, sticky="w", pady=(0, 12)
    )

    # --- 動きを見せる（headless）設定 ---
    headless_var = tk.BooleanVar(value=bool(settings.get("headless", False)))
    ttk.Checkbutton(
        frm, text="画面を表示せずに実行する（上級者向け／通常はオフ）", variable=headless_var
    ).grid(row=7, column=0, columnspan=2, sticky="w", pady=(0, 8))

    # --- 説明 ---
    note = (
        "※ パスワードはこのアプリやファイルには保存されず、Windowsの資格情報\n"
        "　 マネージャー（安全な保管庫）に保存されます。画面にも表示しません。"
    )
    ttk.Label(frm, text=note, foreground="#555").grid(
        row=8, column=0, columnspan=2, sticky="w", pady=(0, 12)
    )

    def on_save():
        url = url_var.get().strip()
        user = id_var.get().strip()
        pw = pw_var.get()

        if not url:
            messagebox.showwarning("入力エラー", "REINSのログインURLを入力してください。")
            return
        if require_credentials and not user:
            messagebox.showwarning("入力エラー", "ログインIDを入力してください。")
            return
        # 新規で保存済みが無いのにパスワード空はNG（初回）
        if require_credentials and not existing and not pw:
            messagebox.showwarning("入力エラー", "パスワードを入力してください。")
            return

        # 設定保存
        settings["login_url"] = url
        settings["headless"] = bool(headless_var.get())
        config.save_settings(settings)

        # 認証情報保存（パスワード未入力かつ既存ありなら、IDだけ更新のためパスワードは既存を維持）
        if user:
            if pw:
                credentials.save_credentials(service, user, pw)
            elif existing:
                # パスワード欄が空 = 既存のパスワードを維持しつつIDを更新
                credentials.save_credentials(service, user, existing.password)

        result["saved"] = True
        messagebox.showinfo("保存しました", "設定を保存しました。")
        root.destroy()

    def on_delete():
        if messagebox.askyesno("確認", "保存済みのログイン情報を削除しますか？"):
            credentials.delete_credentials(service)
            id_var.set("")
            pw_var.set("")
            messagebox.showinfo("削除しました", "ログイン情報を削除しました。")

    def on_cancel():
        root.destroy()

    btns = ttk.Frame(frm)
    btns.grid(row=9, column=0, columnspan=2, sticky="e", pady=(4, 0))
    ttk.Button(btns, text="保存して閉じる", command=on_save).pack(side="right", padx=4)
    ttk.Button(btns, text="キャンセル", command=on_cancel).pack(side="right", padx=4)
    ttk.Button(btns, text="ログイン情報を削除", command=on_delete).pack(side="left", padx=4)

    frm.columnconfigure(0, weight=1)
    url_entry.focus_set()
    root.mainloop()

    return result["saved"]


if __name__ == "__main__":
    open_settings(require_credentials=True)
