"""
locator.py
==========
「画面上の操作対象（ボタン・入力欄・選択欄など）を特定する」処理をまとめた
モジュールです。この方針が本アプリの核心です。

考え方（要件どおり）:
    1) まずHTML要素として特定する（ラベル・ボタン名・input・select・role など）。
       → 画面の見た目が少し変わっても壊れにくい。
    2) 複数の特定方法を「上から順に」試し、最初に見つかったものを使う。
       → REINSの画面構造が変わっても、設定ファイルの候補を足すだけで追従できる。
    3) どうしてもHTMLで特定できないときだけ、座標クリックを補助として使う。

このモジュールは「1つのターゲット定義（by と value）」から Playwright の
Locator（＝画面要素への参照）を作ります。実際の手順（recipe）側からは
resolve_locator() / click_target() などを呼びます。
"""

from __future__ import annotations

import re
from typing import Any

from app_logger import get_logger


class ElementNotFoundError(Exception):
    """どの特定方法でも対象が見つからなかったときに送出します。"""


def flexible_text_regex(value: str) -> "re.Pattern[str]":
    """
    「スペースや改行の有無を無視して」文字列に一致する正規表現を作ります。

    REINSはボタン名を「売買 物件検索」のように語の間にスペースを入れて表示する
    ことがあり、"売買物件検索"（スペース無し）では一致しません。そこで各文字の
    間に \\s*（空白ゼロ個以上）を差し込み、表示上のスペース差を吸収します。
    例: "売買物件検索" → 売\\s*買\\s*物\\s*件\\s*検\\s*索
    （部分一致。前後に他の文字があっても、この並びが含まれていればヒット）
    """
    stripped = re.sub(r"\s+", "", str(value))
    if not stripped:
        return re.compile(".*")
    return re.compile(r"\s*".join(re.escape(ch) for ch in stripped))


def _build_locator(page, by: str, value: str, options: dict[str, Any] | None = None):
    """
    1つの特定方法から Playwright の Locator を作ります。

    by（特定方法）の種類:
        label       : <label>のテキスト（入力欄・選択欄の見出し）で特定
        role        : ボタン等の役割 + 表示名（例 role=button, name="ログイン"）
        text        : 表示されている文字列で特定
        placeholder : 入力欄のプレースホルダ文字で特定
        name        : HTMLのname属性で特定（input/select/textarea）
        id          : HTMLのid属性で特定
        css         : CSSセレクタで特定（上級者向け）
        xpath       : XPathで特定（上級者向け）
    """
    options = options or {}
    exact = bool(options.get("exact", False))
    role_name = options.get("role", "button")

    if by == "label":
        return page.get_by_label(value, exact=exact)
    if by == "role":
        # value が空のときは「名前で絞らず、その役割の要素」を対象にする。
        # 例: role=textbox（文字入力欄）を名前指定なしで掴む。
        if not value:
            return page.get_by_role(role_name)
        if exact:
            return page.get_by_role(role_name, name=value, exact=True)
        # 既定はスペースの有無を無視して名前一致（REINSの「売買 物件検索」対策）
        return page.get_by_role(role_name, name=flexible_text_regex(value))
    if by == "text":
        if exact:
            return page.get_by_text(value, exact=True)
        # 既定はスペースの有無を無視して部分一致
        return page.get_by_text(flexible_text_regex(value))
    if by == "placeholder":
        return page.get_by_placeholder(value, exact=exact)
    if by == "name":
        return page.locator(f"[name={_css_quote(value)}]")
    if by == "id":
        return page.locator(f"#{value}")
    if by == "css":
        return page.locator(value)
    if by == "xpath":
        return page.locator(f"xpath={value}")
    raise ValueError(f"未知の特定方法(by)です: {by}")


def _css_quote(value: str) -> str:
    """CSSセレクタ内で使う文字列を安全に引用符で囲みます。"""
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def resolve_locator(page, targets: list[dict[str, Any]], timeout_ms: int):
    """
    候補ターゲット（targets）を上から順に試し、実際に画面に存在する最初の
    要素の Locator を返します。

    引数:
        targets : [{"by": "...", "value": "...", "options": {...}}, ...]
        timeout_ms : 1つの候補を待つ最大時間
    戻り値:
        (locator, 使えた target 定義)
    見つからなければ ElementNotFoundError を送出します。
    """
    log = get_logger()
    last_error: Exception | None = None
    # 候補ごとの待ち時間は短めにして、次の候補へ素早く移る
    per_try = max(1000, int(timeout_ms / max(1, len(targets))))

    for target in targets:
        by = target.get("by")
        value = target.get("value", "")
        options = target.get("options")
        try:
            locator = _build_locator(page, by, value, options)
            # 複数一致した場合は最初の1つに絞る
            first = locator.first
            first.wait_for(state="visible", timeout=per_try)
            log.info("  → 要素を特定: by=%s value=%r", by, value)
            return first, target
        except Exception as exc:  # この候補では見つからなかった → 次へ
            last_error = exc
            log.debug("  ・候補で見つからず: by=%s value=%r (%s)", by, value, type(exc).__name__)

    raise ElementNotFoundError(
        f"対象を特定できませんでした。試した候補: {targets}\n"
        f"最後のエラー: {last_error}"
    )


def click_target(page, targets, timeout_ms, coordinate_fallback=None) -> None:
    """
    対象をクリックします。HTMLで特定できないときだけ座標で補助クリックします。
    """
    log = get_logger()
    try:
        locator, _ = resolve_locator(page, targets, timeout_ms)
        locator.click(timeout=timeout_ms)
        return
    except ElementNotFoundError:
        if coordinate_fallback:
            x, y = coordinate_fallback
            log.warning("  ! HTMLで特定できないため座標クリックで補助します: (%s, %s)", x, y)
            page.mouse.click(x, y)
            return
        raise


def fill_target(page, targets, value, timeout_ms) -> None:
    """入力欄に文字を入力します。"""
    locator, _ = resolve_locator(page, targets, timeout_ms)
    locator.fill(str(value), timeout=timeout_ms)


def select_target(page, targets, value, timeout_ms) -> None:
    """
    選択欄(select要素)から項目を選びます。
    まず「表示ラベル」で選び、だめなら「値(value属性)」で選びます。
    """
    locator, _ = resolve_locator(page, targets, timeout_ms)
    try:
        locator.select_option(label=str(value), timeout=timeout_ms)
    except Exception:
        locator.select_option(value=str(value), timeout=timeout_ms)


def _safe_is_checked(locator) -> bool:
    """チェック状態を安全に取得（取得できない場合はFalse扱い）。"""
    try:
        return bool(locator.is_checked())
    except Exception:
        return False


def _click_associated_label(page, locator, timeout_ms) -> bool:
    """
    チェックボックス本体に対応する<label>をクリックします。

    REINSのようなBootstrapVue製のカスタムチェックボックスは、本物の<input>が
    透明(opacity:0)で隠れ、その上に<label>が覆いかぶさっています。
    人間はラベル（文字部分）をクリックして切り替えるので、同じ操作を行います。
    <label for="＜inputのid＞"> を探してクリックします。
    """
    try:
        input_id = locator.get_attribute("id")
    except Exception:
        input_id = None
    if not input_id:
        return False
    label = page.locator(f"label[for={_css_quote(input_id)}]")
    try:
        if label.count() > 0:
            label.first.click(timeout=timeout_ms)
            return True
    except Exception:
        pass
    return False


def check_target(page, targets, timeout_ms) -> None:
    """
    チェックボックスにチェックを付けます（既に付いていれば何もしません）。

    隠れた入力欄(カスタムチェックボックス)にも対応するため、次の順で試します:
        1) 既にチェック済みなら何もしない
        2) 対応する<label>をクリック（人間と同じ操作。最も確実）
        3) force指定で入力欄を直接切り替え
        4) 通常のcheck（ここまで失敗した場合は例外を上位へ）
    """
    log = get_logger()
    locator, _ = resolve_locator(page, targets, timeout_ms)

    # 1) 既にチェック済み
    if _safe_is_checked(locator):
        return

    short = min(timeout_ms, 5000)

    # 2) 対応するラベルをクリック
    if _click_associated_label(page, locator, short):
        if _safe_is_checked(locator):
            log.info("  → ラベルをクリックしてチェックを付けました。")
            return

    # 3) force指定で直接切り替え
    try:
        locator.check(force=True, timeout=short)
        if _safe_is_checked(locator):
            log.info("  → force指定でチェックを付けました。")
            return
    except Exception as exc:
        log.debug("  ・force checkで失敗: %s", type(exc).__name__)

    # 4) 通常のcheck（最後の手段。失敗すれば例外が上位に伝わる）
    locator.check(timeout=timeout_ms)


def is_visible(page, targets, timeout_ms) -> bool:
    """対象が画面に見えているかどうかを返します（確認用）。"""
    try:
        resolve_locator(page, targets, timeout_ms)
        return True
    except ElementNotFoundError:
        return False
