# このリポジトリで作業するときの約束

- 回答はすべて日本語で書く。
- 「Wix不動産物件ランディングページ」「REINS自動検索アプリ開発」「不動産マイソク資料フォーマット」の3つは連携して動く。
  作業の前に必ず `docs/INTEGRATION-ja.md`（連携の取り決め）を読み、取り決めを守る。
  - 掲載ページの部品の id（#dz・#fileInput・#btnPublishAll など）を変えない。
  - 掲載ページを変えたら版（WIDGET_VERSION と data-widget-version）を上げ、貼り付け用ファイルを作り直す。
  - マイソクの書式（Canva）を変えたら、掲載ページの MK_BG・MK_LAYOUT も直す。
