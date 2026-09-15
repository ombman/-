/**
 * Wix の「HTMLコードを貼り付ける」欄に収めるための圧縮版を生成する。
 *   入力: wix-embed/index.html
 *   出力: wix-embed/paste-into-wix.html
 * 動作は index.html と同一（test/run.mjs を両方に対して実行して確認している）。
 */
import { minify } from 'html-minifier-terser';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'wix-embed', 'index.html');
const OUT = path.join(HERE, '..', 'wix-embed', 'paste-into-wix.html');

const src = fs.readFileSync(SRC, 'utf8');
const out = await minify(src, {
  collapseWhitespace: true,
  conservativeCollapse: false,
  removeComments: true,
  minifyCSS: true,
  minifyJS: { compress: { drop_console: false }, mangle: true },
  removeAttributeQuotes: false,
  keepClosingSlash: true
});

const banner = '<!-- Wix エディタ「埋め込み → HTMLコード」に、このファイルの中身をすべて貼り付けてください。\n' +
  '     元ファイル: wix-embed/index.html（編集は必ず元ファイル側で行い、node test/build-paste.mjs で再生成） -->\n';
fs.writeFileSync(OUT, banner + out);
console.log(`元: ${src.length.toLocaleString()} 文字 → 圧縮後: ${(banner + out).length.toLocaleString()} 文字`);
