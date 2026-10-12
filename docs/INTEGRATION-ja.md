# 3つの連携の取り決め

次の3つは、いつも一緒に動くように作っています。
どれかを変えるときは、この取り決めを守り、守れない変更をするときは3つ同時に直します。

| 名前 | 中身 | 置き場所（ブランチ） |
|---|---|---|
| Wix不動産物件ランディングページ | Wixに貼る掲載ページ（ユーザー画面・管理画面） | `claude/wix-real-estate-landing-page-oxzkoh` の `wix-embed/` |
| REINS自動検索アプリ開発 | REINSで図面PDFを集め、掲載ページのドロップ枠に渡して掲載するアプリ | `claude/reins-auto-search-app-m5im0v` の `src/` |
| 不動産マイソク資料フォーマット | 掲載する物件の書式（Canvaのマイソク3種類） | Canva（下記）と、掲載ページの `MK_BG`・`MK_LAYOUT` |

## 流れ

1. REINS自動検索アプリが図面PDFを保存する
2. アプリが掲載ページ（ombman.com/特集）を開き、ページの版を確かめる（古ければ中止）
3. 管理画面にログインし、ドロップ枠にPDFを渡す
4. 掲載ページがPDFを読み取り、業者の情報を消し、値をマイソク資料フォーマットに転記する
5. アプリが「すべてユーザー画面に掲載」を押す
6. ユーザー画面に、マイソク資料フォーマットで物件が並ぶ

## 取り決め1：掲載ページの部品（アプリが操作する）

アプリ（`src/wix_upload.py`）は、掲載ページの次の部品を id で探して操作します。
**これらの id・役割を変えないこと。** 変えるとアプリが止まります。

| 部品 | 役割 |
|---|---|
| `#dz` と `#fileInput` | ドロップ枠と、その受け口（アプリはこの2つがある枠を掲載ページとみなす） |
| `#toAdmin` | ユーザー画面の「管理者ログイン」 |
| `#pw`・`#btnLogin`・`#loginLog` | パスワード入力・ログインボタン・ログインの結果表示 |
| `#adminBody` | ログイン後の管理画面（見えたらログイン成功） |
| `#bulkBar`・`#bulkCount`・`#btnDiscardAll` | 読み取り結果の一括操作の帯・件数・すべて破棄 |
| `#dropLog`（中の `.spin`） | 読み取りの経過表示（`.spin` が無くなったら読み取り完了） |
| `#btnPublishAll` | すべてユーザー画面に掲載 |
| `#bulkLog`（中の `.ok`） | 掲載の結果（`.ok` が書かれたら完了） |

確認用のテスト：`test/run-reins-flow.mjs`。アプリと同じ手順・同じ id で操作し、マイソクで掲載されるところまで確かめます。

## 取り決め2：掲載ページの版

- 掲載ページは `<html data-widget-version="版">` と `CONFIG.WIDGET_VERSION` に同じ版を持つ（例 `2026-10-12.1`）。
- 掲載ページを変えたら、**版を上げてから** `node test/build-paste.mjs` で貼り付け用ファイルを作り直す。
- アプリは、公開中のページの版と、GitHub上の最新の貼り付け用ファイル
  （`wix-embed/paste-into-wix.html`）の版を比べ、古ければ資料を渡さずに止まる。
- 管理画面も、ログイン時に同じ比べ方をして、古ければ上に知らせを出す。
- Wixでは、貼り替えたあと必ず右上の「公開」を押す（プレビューや保存だけでは公開ページは変わらない）。

## 取り決め3：不動産マイソク資料フォーマット

Canvaのデザイン（元の書式）：

| 種別 | Canva |
|---|---|
| 戸建 | https://www.canva.com/design/DAHXORpMtJY/CNcd0G_e4exPcFS1NvQx3w/edit |
| 区分マンション | https://www.canva.com/design/DAHXOV6wQJI/Xs2NUNY9FfHPUrRcqUOtfQ/edit |
| 土地 | https://www.canva.com/design/DAHXObjaeFk/PQ2wDxAryOYDvbAGrHM4aQ/edit |

- 掲載ページは、この3つを画像にしたもの（Wixのメディアに置いた PNG、`MK_BG`）を背景にし、
  `MK_LAYOUT`（1123×794 の位置）に読み取った値を転記する。
- 写真・間取り図・アピール文は資料から切り出して入れ、物件概要の表（転記する値）と業者の帯は入れない。
- **Canvaのデザインを変えたら**：PNGに書き出してWixのメディアに上げ直し、`MK_BG` のURLと、
  欄の位置が変わったなら `MK_LAYOUT` を直し、版を上げて公開する。
- 掲載ページに入った物件は、拡大表示もこのマイソクで出す（資料そのものは出さない）。

## 変更するときの確認

- 掲載ページ：`cd test && for f in run-*.mjs; do node $f; done`（`run-reins-flow.mjs` を必ず含む）
- アプリ：`src/wix_upload.py` の id を変えていないこと。配布用ZIPを `python tools/build_release.py` で作り直す
