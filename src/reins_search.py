"""
reins_search.py
================
「売買物件検索」の手順を、設定ファイル（config/search_recipe.json）に書かれた
ステップの通りに実行する“エンジン”です。

なぜ設定ファイル駆動にするのか（重要な設計方針）:
    REINSの画面やボタン位置は変更される可能性があります。手順や特定条件を
    Pythonコードに埋め込むと、変更のたびにプログラムの修正が必要になります。
    そこで「手順＝JSONデータ」として外に出し、
        ・操作の種類(action)
        ・対象の特定候補(targets)  ← 複数書けて上から順に試す
        ・入力値(value)や確認条件(verify)
    を編集するだけで追従できるようにしています。

1ステップの基本サイクル（要件どおり）:
    1) （必要なら）スクロールして対象を画面内に入れる
    2) 対象を特定する（targets を上から試す）
    3) 操作する（クリック/入力/選択/チェック 等）
    4) 結果を確認する（verify）
    5) 問題なければ次のステップへ、駄目なら停止
"""

from __future__ import annotations

from typing import Any

from app_logger import dump_html, get_logger, screenshot
from locator import (
    ElementNotFoundError,
    check_target,
    click_target,
    fill_target,
    flexible_text_regex,
    is_visible,
    resolve_locator,
    select_target,
)


class StepError(Exception):
    """あるステップの実行に失敗したことを表す例外。"""


def run_recipe(page, recipe: dict[str, Any], settings: dict[str, Any]) -> None:
    """
    recipe に書かれた steps を順番に実行します。
    どこかのステップで失敗したら、その時点で停止して StepError を送出します。
    """
    log = get_logger()
    timeout_ms = int(settings.get("default_timeout_ms", 15000))
    pause = bool(settings.get("step_by_step_pause", False))

    steps = recipe.get("steps", [])
    total = len(steps)
    log.info("検索手順を開始します（全 %d ステップ）。", total)

    for index, step in enumerate(steps, start=1):
        desc = step.get("description", step.get("id", f"step {index}"))
        log.info("----- [%d/%d] %s -----", index, total, desc)

        try:
            _run_step(page, step, timeout_ms)
        except Exception as exc:
            # optional=true のステップは、失敗しても止めずに続行する
            # （クリックのタイムアウト等、あらゆる失敗を対象にする）
            if step.get("optional"):
                log.warning("  [任意ステップ] 失敗しましたが続行します: %s", exc)
                continue
            screenshot(page, f"ERROR_step{index:02d}")
            # セレクタ調整のため、失敗時点の画面HTMLも保存しておく
            dump_html(page, f"ERROR_step{index:02d}")
            raise StepError(
                f"ステップ {index}/{total}「{desc}」で停止しました。\n"
                f"理由: {exc}\n"
                f"→ config/search_recipe.json の該当ステップの targets（特定条件）を\n"
                f"   見直すと解決できることが多いです。logs/shots の画像も確認してください。"
            ) from exc

        # 各ステップ後にスクリーンショットを残す（後から検証できるように）
        screenshot(page, f"step{index:02d}_{_safe_name(step.get('id', desc))}")

        if pause:
            input(f"  [確認] ステップ {index} 完了。Enterで次へ進みます...")

    log.info("すべての検索手順が完了しました。")


def _run_step(page, step: dict[str, Any], default_timeout: int) -> None:
    """1つのステップを実行します。"""
    log = get_logger()
    action = step.get("action")
    targets = step.get("targets", [])
    value = step.get("value")
    timeout_ms = int(step.get("timeout_ms", default_timeout))
    coord = step.get("coordinate_fallback")

    # 1) 必要ならスクロール（対象を画面内へ）
    if step.get("scroll_into_view") and targets:
        _scroll_into_view(page, targets, timeout_ms)

    # 2)〜3) アクション実行
    if action == "click":
        click_target(page, targets, timeout_ms, coordinate_fallback=coord)
    elif action == "click_download":
        _click_download(page, targets, timeout_ms)
    elif action == "fill":
        fill_target(page, targets, value, timeout_ms)
    elif action == "select":
        select_target(page, targets, value, timeout_ms)
    elif action == "choose":
        _choose(page, targets, value, timeout_ms)
    elif action == "check":
        check_target(page, targets, timeout_ms)
    elif action == "scroll":
        _scroll_page(page, step)
    elif action == "wait_for":
        resolve_locator(page, targets, timeout_ms)
    elif action == "wait_ms":
        _safe_wait(page, int(value or 1000))
    elif action == "verify":
        _verify(page, step, timeout_ms)
    elif action == "screenshot":
        screenshot(page, _safe_name(step.get("id", "manual")))
    elif action == "dump_html":
        dump_html(page, _safe_name(step.get("id", "manual")))
    else:
        raise StepError(f"未知のアクションです: {action!r}")

    # 4) 結果確認（verify 指定がある場合）
    verify = step.get("verify")
    if verify and action != "verify":
        _check_verify(page, verify, timeout_ms)
        log.info("  [OK] 操作結果を確認しました。")


def _choose(page, targets, value, timeout_ms) -> None:
    """
    「ドロップダウン(select)でも、クリック式のリストでも選べる」万能選択。

    REINSの入力ガイド内の始駅/終駅などは、実際にプルダウンかリストクリックか
    画面次第で分かりません。そこで:
        1) まず対象を <select> とみなして項目を選ぶ
        2) 失敗したら、その値の文字（例:「西宮北口」）をクリックして選ぶ
    の順に試します。
    """
    log = get_logger()
    # 1) select として試す
    try:
        select_target(page, targets, value, timeout_ms)
        return
    except Exception:
        log.debug("  ・select として選べず、クリック式として再試行します: %r", value)

    # 2) クリック式リストとして試す（値の文字をクリック）
    click_targets = [{"by": "text", "value": str(value), "options": {"exact": True}},
                     {"by": "text", "value": str(value)}]
    click_target(page, click_targets, timeout_ms)


def _click_download(page, targets, timeout_ms) -> None:
    """
    「クリックして図面をダウンロード保存」する専用処理。

    REINSは『一括取得』直後に操作ウィンドウを閉じるため、ブラウザ任せの
    ダウンロード（save_as）は保存前に接続が切れて失敗する。
    そこで:
      1) クリック時のリクエスト（メソッド/本文/URL）を記録し、
      2) expect_download でダウンロードURLを取得したら、
      3) ログイン中のセッション(=context.request、Cookie共有)で“URLから直接”取得して保存する。
         これはブラウザのページ生存に依存しないため、ウィンドウが閉じても保存できる。
      4) それでも駄目なら従来の save_as を試す。
    """
    import time as _t
    import urllib.request

    from browser import DOWNLOAD_DIR

    log = get_logger()
    ctx = page.context

    # 捕捉したダウンロードの (URL, ファイル名) を、捕捉時（＝接続が生きている間）に控える。
    # 図面は「2分割」等で複数ファイルになることがあるため、すべて集める。
    found: list[tuple[str, str]] = []
    seen_urls: set[str] = set()

    def _grab(d):
        try:
            u = d.url
            fn = d.suggested_filename
            if u and u not in seen_urls:
                seen_urls.add(u)
                found.append((u, fn or ""))
        except Exception:
            pass

    # 診断: ダウンロード関連のリクエストが何本飛んでいるかを記録
    #（2本飛んで検出1なら Chrome の複数DLブロック、1本なら REINS 側の問題）
    def _on_req(r):
        try:
            u = r.url or ""
            low = u.lower()
            if "reins" in low and ("datalizer" in low or "download" in low or "zmn" in low or ".pdf" in low):
                get_logger().info("  ・DL関連リクエスト: %s", u[:140])
        except Exception:
            pass

    ctx.on("page", lambda p: (p.on("download", _grab), p.on("request", _on_req)))
    for p in list(ctx.pages):
        try:
            p.on("download", _grab)
            p.on("request", _on_req)
        except Exception:
            pass

    # クリックして最初のダウンロードを確保。
    # 図面は別窓(ポップアップ)で落ちるため self.page 側では検出できないことがある。
    # その場合は expect_download が短時間で諦め、下の収集ループ(_grab)で拾う。
    try:
        with page.expect_download(timeout=min(timeout_ms, 6000)) as di:
            try:
                click_target(page, targets, timeout_ms)
            except Exception as exc:
                log.debug("  ・クリック時の例外（継続）: %s", exc)
        _grab(di.value)
    except Exception as exc:
        log.debug("  ・expect_downloadで未捕捉（%s）。ハンドラ捕捉を待ちます。", type(exc).__name__)

    # ログイン中のCookieを、接続が生きている今のうちに取得しておく
    cookie_header = ""
    try:
        cookies = ctx.cookies()
        reins_cookies = [c for c in cookies if "reins" in (c.get("domain") or "")]
        use = reins_cookies or cookies
        cookie_header = "; ".join(f"{c['name']}={c['value']}" for c in use)
    except Exception as exc:
        log.debug("Cookie取得に失敗: %s", exc)

    # 追加のダウンロード（2分割など）を待って集める。
    # 2つ目が来たら少し待って打ち切り、来なければ最大時間まで待つ。
    deadline = _t.time() + 20
    while _t.time() < deadline:
        live = next((p for p in ctx.pages if not p.is_closed()), None)
        if live is None:
            # ページが全て閉じても、少しの間は追加ダウンロードイベントを待つ
            try:
                _t.sleep(0.5)
            except Exception:
                pass
            if _t.time() >= deadline:
                break
            continue
        try:
            live.wait_for_timeout(500)
        except Exception:
            try:
                _t.sleep(0.5)
            except Exception:
                pass
        if len(found) >= 2:
            # 2つ揃ったら、念のためもう少しだけ待って終了
            break

    log.info("検出したダウンロード件数: %d", len(found))
    if not found:
        raise StepError(
            "図面のダウンロードを検出できませんでした。"
            "『一括取得』の押下対象や前段の手順を確認してください。"
        )

    # ブラウザから独立して、Cookie付きでURLから直接ダウンロードして保存する
    saved = 0
    for i, (url, fn) in enumerate(found, start=1):
        try:
            name = fn or f"zumen_{int(_t.time())}_{i}.pdf"
            dest = DOWNLOAD_DIR / name
            if dest.exists():
                dest = DOWNLOAD_DIR / f"{dest.stem}_{int(_t.time())}_{i}{dest.suffix}"
            req = urllib.request.Request(
                url,
                headers={
                    "Cookie": cookie_header,
                    "User-Agent": "Mozilla/5.0",
                    "Referer": "https://system.reins.jp/",
                },
            )
            with urllib.request.urlopen(req, timeout=180) as r:
                data = r.read()
            with open(dest, "wb") as f:
                f.write(data)
            log.info("図面を保存しました（%dバイト）: %s", len(data), dest)
            saved += 1
        except Exception as exc:
            log.warning("図面の保存に失敗（%s）: %s", url, exc)

    if saved == 0:
        raise StepError("図面ダウンロードURLからの保存にすべて失敗しました。")
    log.info("図面を %d ファイル、downloads フォルダに保存しました。", saved)


def _scroll_into_view(page, targets, timeout_ms) -> None:
    """対象要素が画面内に来るようスクロールします。"""
    try:
        locator, _ = resolve_locator(page, targets, timeout_ms)
        locator.scroll_into_view_if_needed(timeout=timeout_ms)
    except ElementNotFoundError:
        # まだ見つからない場合は下方向へ少しスクロールしてから本操作に任せる
        page.mouse.wheel(0, 600)


def _scroll_page(page, step) -> None:
    """ページを指定方向・量だけスクロールします。"""
    dy = int(step.get("value", 600))
    page.mouse.wheel(0, dy)


def _safe_wait(page, ms: int) -> None:
    """
    指定ミリ秒待ちます。図面ダウンロード後にREINSが操作ページを閉じても
    エラーにならないよう、生きているタブ（keep-alive等）で待機します。
    ※Playwrightのイベント（ダウンロード保存）を処理するため time.sleep ではなく
      Page.wait_for_timeout を使います。
    """
    try:
        if not page.is_closed():
            page.wait_for_timeout(ms)
            return
    except Exception:
        pass
    # ページが閉じている場合は、コンテキスト内の生きているタブで待つ
    try:
        for p in page.context.pages:
            try:
                if not p.is_closed():
                    p.wait_for_timeout(ms)
                    return
            except Exception:
                continue
    except Exception:
        pass


def _verify(page, step, timeout_ms) -> None:
    """action=verify 用。verify 条件を満たさなければ失敗にします。"""
    verify = step.get("verify")
    if not verify:
        raise StepError("verifyアクションですが verify 条件が指定されていません。")
    _check_verify(page, verify, timeout_ms)


def _check_verify(page, verify: dict[str, Any], timeout_ms: int) -> None:
    """
    確認条件をチェックします。対応する条件:
        {"visible_targets": [...]}   … いずれかの要素が見えていればOK
        {"contains": "文字列"}        … 画面内にその文字が含まれていればOK
        {"not_contains": "文字列"}    … その文字が無ければOK
    """
    log = get_logger()

    targets = verify.get("visible_targets")
    if targets:
        if not is_visible(page, targets, timeout_ms):
            raise StepError(f"確認失敗: 期待した要素が見つかりません（{targets}）")

    contains = verify.get("contains")
    if contains:
        try:
            # スペースの有無を無視して判定（REINSの表示ゆれ対策）
            page.get_by_text(flexible_text_regex(contains)).first.wait_for(
                state="visible", timeout=timeout_ms
            )
        except Exception as exc:
            raise StepError(f"確認失敗: 画面に「{contains}」が見つかりません。") from exc

    not_contains = verify.get("not_contains")
    if not_contains:
        if is_visible(page, [{"by": "text", "value": not_contains}], timeout_ms=2000):
            raise StepError(f"確認失敗: 画面に本来無いはずの「{not_contains}」が見つかりました。")

    log.debug("  verify OK: %s", verify)


def _safe_name(text: str) -> str:
    """スクリーンショットのファイル名に使えるよう、記号を除いた短い名前にします。"""
    keep = "".join(c if c.isalnum() else "_" for c in str(text))
    return keep[:40] or "step"
