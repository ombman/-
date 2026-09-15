/**
 * ランディングページ ウィジェットの動作確認テスト（Playwright / Chromium）
 *   - ③ 資料からの自動読み取り（戸建 / マンション）
 *   - ④ 情報元（電話番号・会社名・担当者名等）の削除
 *   - ② ドラッグ＆ドロップからの実登録フロー
 *   - ① 画面分離 / ⑤ フォント / ⑥⑦ LINEボタン
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', 'wix-embed');
const FIX  = path.join(HERE, 'fixtures');
const VENDOR = path.join(HERE, 'node_modules', 'pdfjs-dist', 'build');

let pass = 0, fail = 0;
const ok  = (n, c, extra='') => { c ? (pass++, console.log(`  \x1b[32m✔\x1b[0m ${n}${extra?' — '+extra:''}`))
                                    : (fail++, console.log(`  \x1b[31m✖ ${n}${extra?' — '+extra:''}\x1b[0m`)); };
const eq  = (n, got, want) => ok(n, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);

/* ---- 静的サーバ ---- */
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});
await new Promise(r => server.listen(8123, '127.0.0.1', r));
const FILE = process.env.WIDGET_FILE || 'index.html';
const BASE = `http://127.0.0.1:8123/${FILE}`;
console.log(`対象ファイル: wix-embed/${FILE}`);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext();
/* cdnjs は本環境から到達できないため、同一バージョンのローカル pdf.js を返す */
const PDFJS_ROOT = path.join(HERE, 'node_modules', 'pdfjs-dist');
await ctx.route('https://cdnjs.cloudflare.com/**', route => {
  const rel = route.request().url().split('/3.11.174/')[1] || '';
  const local = rel.startsWith('cmaps/') || rel.startsWith('standard_fonts/')
    ? path.join(PDFJS_ROOT, rel)
    : path.join(VENDOR, path.basename(rel));
  if (!fs.existsSync(local)) return route.fulfill({ status: 404, body: '' });
  route.fulfill({
    status: 200,
    contentType: rel.startsWith('cmaps/') || rel.startsWith('standard_fonts/') ? 'application/octet-stream' : 'text/javascript',
    body: fs.readFileSync(local)
  });
});

/* =========================================================
   1. 抽出・削除ロジックの単体確認
   ========================================================= */
console.log('\n[1] ③ 自動読み取り / ④ 情報元の削除');
const page = await ctx.newPage();
page.on('pageerror', e => { fail++; console.log('  \x1b[31m✖ JSエラー: ' + e.message + '\x1b[0m'); });
await page.goto(BASE);
await page.waitForFunction(() => !!window.__RE);

const FALLBACK_PW = await page.evaluate(() => window.__RE.CONFIG.FALLBACK_PASSWORD);
ok('予備パスワードが既定値から変更されている', FALLBACK_PW !== 'admin1234' && FALLBACK_PW.length >= 12);

const houseTxt = fs.readFileSync(path.join(FIX, 'house.txt'), 'utf8');
const manTxt   = fs.readFileSync(path.join(FIX, 'mansion.txt'), 'utf8');
const man2Txt  = fs.readFileSync(path.join(FIX, 'mansion2.txt'), 'utf8');

const h = await page.evaluate(t => window.__RE.extract(t, []), houseTxt);
console.log('  -- 戸建（※1：価格/駅徒歩/築年数/延床面積）');
eq('種別=戸建', h.record.type, 'house');
eq('価格 6,480万円', h.record.priceMan, 6480);
eq('駅徒歩 7分', h.record.walkMin, 7);
eq('最寄駅名', h.record.station, '桜台駅');
eq('延床面積 96.88㎡', h.record.floorArea, 96.88);
eq('築年数（平成29年6月築→9年）', h.record.ageYears, new Date().getFullYear() - 2017 - (new Date().getMonth() + 1 < 6 ? 1 : 0));
ok('築年を保持', h.record.builtLabel === '2017年6月', String(h.record.builtLabel));

console.log('  -- マンション／区分（※1：価格/駅徒歩/築年数/占有面積/持分）');
const m = await page.evaluate(t => window.__RE.extract(t, []), manTxt);
eq('種別=マンション', m.record.type, 'mansion');
eq('価格 1億2,800万円 → 12800', m.record.priceMan, 12800);
eq('駅徒歩 4分', m.record.walkMin, 4);
eq('最寄駅名', m.record.station, '中目黒駅');
eq('専有面積 68.42㎡', m.record.ownArea, 68.42);
eq('持分 100000分の1250', m.record.share, '100000分の1250');
ok('築年数が算出される', m.record.ageYears !== null, `${m.record.ageYears}年`);
ok('価格表記', await page.evaluate(() => window.__RE.priceLabel(12800)) === '1億2,800万円', '1億2,800万円');

const m2 = await page.evaluate(t => window.__RE.extract(t, []), man2Txt);
console.log('  -- マンション（表記ゆれ：占有面積 / m2 / 築22年 / 全角）');
eq('種別=マンション', m2.record.type, 'mansion');
eq('価格 4,980万円', m2.record.priceMan, 4980);
eq('駅徒歩は最短の3分', m2.record.walkMin, 3);
eq('最寄駅名（最短の駅）', m2.record.station, '西新宿駅');
eq('占有面積 55.1㎡', m2.record.ownArea, 55.1);
eq('持分 50000分の430', m2.record.share, '50000分の430');
eq('築年数 22年', m2.record.ageYears, 22);

console.log('  -- ④ 情報元の削除');
for (const [label, res] of [['戸建', h], ['マンション', m], ['ゆれ', m2]]) {
  const t = res.cleanText;
  ok(`${label}: 電話番号が残っていない`, !/0\d{1,3}[-\s]?\d{2,4}[-\s]?\d{3,4}/.test(t.replace(/［削除済み］/g,'')) && !/0120/.test(t));
  ok(`${label}: 会社名が残っていない`, !/株式会社|有限会社|㈱|不動産|住宅販売|地所/.test(t));
  ok(`${label}: 担当者名が残っていない`, !/山田|鈴木|佐藤|担当[^者]?[:：]?\s*\S/.test(t.replace(/担当者?[:：]?\s*［削除済み］/g,'')));
  ok(`${label}: メール/URLが残っていない`, !/@|https?:\/\/|www\./.test(t));
  ok(`${label}: 免許番号が残っていない`, !/第\s*\d+\s*号/.test(t));
  ok(`${label}: 物件情報は保持されている`, res.record.priceMan !== null && res.record.walkMin !== null);
}
const ng = await page.evaluate(t => window.__RE.redact(t, ['グランドヒルズ中目黒']), manTxt);
ok('追加削除ワードが効く', !/グランドヒルズ中目黒/.test(ng.text));

/* =========================================================
   2. ① 画面分離 / ⑤ フォント / ⑥⑦ LINE
   ========================================================= */
console.log('\n[2] ① 画面分離 / ⑤ Meiryo UI / ⑥⑦ LINEボタン');
ok('ユーザー画面が表示（既定）', await page.isVisible('#view-public'));
ok('管理画面は非表示（既定）', !(await page.isVisible('#view-admin')));
const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
ok('⑤ body のフォント先頭が Meiryo UI', /^["']?Meiryo UI/.test(font), font);
const hrefs = await page.$$eval('.btn-line', els => els.map(e => e.getAttribute('href')));
ok('⑥ LINEボタンが存在', hrefs.length >= 3, `${hrefs.length}個`);
ok('⑦ 全てのリンク先が https://lin.ee/ucovrzE', hrefs.every(h => h === 'https://lin.ee/ucovrzE'));
ok('⑥ フローティングLINEボタンが可視', await page.isVisible('.line-float'));

const admin = await ctx.newPage();
await admin.goto(BASE + '?mode=admin');
await admin.waitForFunction(() => !!window.__RE);
ok('① ?mode=admin で管理画面', await admin.isVisible('#view-admin') && !(await admin.isVisible('#view-public')));
ok('① 管理画面はパスワードで保護', await admin.isVisible('#adminLogin') && !(await admin.isVisible('#adminBody')));

/* Wix に「HTMLコード」として直接貼り付けた場合は URL クエリが使えないため、
   Velo ページコードからの setMode メッセージで切り替わることを確認する */
const pasted = await ctx.newPage();
await pasted.goto(BASE);            // クエリ無し = 既定はユーザー画面
await pasted.waitForFunction(() => !!window.__RE);
ok('クエリ無しならユーザー画面', await pasted.isVisible('#view-public'));
await pasted.evaluate(() => window.postMessage({ channel: 'reLp', action: 'setMode', payload: 'admin' }, '*'));
await pasted.waitForTimeout(300);
ok('① Velo からの setMode で管理画面に切り替わる（貼り付け方式）',
   await pasted.isVisible('#view-admin') && !(await pasted.isVisible('#view-public')));
await pasted.evaluate(() => window.postMessage({ channel: 'reLp', action: 'setMode', payload: 'public' }, '*'));
await pasted.waitForTimeout(300);
ok('setMode で公開画面に戻せる', await pasted.isVisible('#view-public'));
await pasted.close();

/* 1ページ構成：ページ内リンクだけで管理画面へ行けること */
const onepage = await ctx.newPage();
await onepage.goto(BASE);
await onepage.waitForFunction(() => !!window.__RE);
ok('公開画面に管理者ログイン導線がある', await onepage.isVisible('#toAdmin'));
await onepage.click('#toAdmin');
await onepage.waitForTimeout(300);
ok('① リンクから管理画面に切り替わる（1ページ構成）',
   await onepage.isVisible('#view-admin') && !(await onepage.isVisible('#view-public')));
ok('① 切り替え後もパスワードで保護されている',
   await onepage.isVisible('#adminLogin') && !(await onepage.isVisible('#adminBody')));
await onepage.click('#toPublic');
await onepage.waitForTimeout(300);
ok('ユーザー画面に戻れる', await onepage.isVisible('#view-public'));
/* 実際にログインして掲載まで通るか（1ページ構成の通しフロー） */
await onepage.click('#toAdmin');
await onepage.fill('#pw', FALLBACK_PW);
await onepage.click('#btnLogin');
await onepage.waitForSelector('#adminBody:not([hidden])', { timeout: 8000 });
await onepage.setInputFiles('#fileInput', [path.join(FIX, 'mansion2.txt')]);
await onepage.waitForFunction(() => document.querySelectorAll('#reviewArea .review').length === 1, { timeout: 15000 });
await onepage.click('#reviewArea [data-act="publish"]');
await onepage.waitForTimeout(600);
await onepage.click('#toPublic');
await onepage.waitForTimeout(300);
ok('1ページ構成でも掲載がユーザー画面に反映される',
   (await onepage.$$('#pubGrid .card')).length >= 1);
await onepage.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await onepage.close();

/* =========================================================
   3. ② D&D → ③④ → 掲載 の通しフロー（PDF）
   ========================================================= */
console.log('\n[3] ② ドラッグ＆ドロップ通しフロー（PDF実ファイル）');
await admin.fill('#pw', 'wrong-password');
await admin.click('#btnLogin');
await admin.waitForTimeout(300);
ok('誤ったパスワードは拒否', await admin.isVisible('#adminLogin'));

await admin.fill('#pw', FALLBACK_PW);
await admin.click('#btnLogin');
await admin.waitForSelector('#adminBody:not([hidden])', { timeout: 8000 });
ok('ログイン成功で管理画面本体が表示', await admin.isVisible('#dz'));

await admin.setInputFiles('#fileInput', [path.join(FIX, 'house.pdf'), path.join(FIX, 'mansion.pdf')]);
await admin.waitForFunction(() => document.querySelectorAll('#reviewArea .review').length === 2, { timeout: 25000 });
ok('② PDF 2件を読み取り、確認画面が2件表示', (await admin.$$('#reviewArea .review')).length === 2);

const drafts = await admin.evaluate(() => window.__drafts_dbg ? null : Array.from(document.querySelectorAll('#reviewArea .review')).map(r => ({
  head: r.querySelector('.hd').textContent.trim().slice(0, 40),
  vals: Array.from(r.querySelectorAll('.fields .row')).map(x => (x.querySelector('label')?.textContent || '') + '=' + (x.querySelector('input,select')?.value || '')),
  redacted: r.querySelector('.redact').textContent.replace(/\s+/g, ' ').slice(0, 60)
})));
drafts.forEach(d => console.log('    ' + d.vals.join(' | ')));
const allVals = drafts.map(d => d.vals.join('|')).join('||');
ok('③ PDFから価格を読み取り', /価格（万円）=6480/.test(allVals) && /価格（万円）=12800/.test(allVals));
ok('③ PDFから駅徒歩を読み取り', /徒歩分数（分）=7/.test(allVals) && /徒歩分数（分）=4/.test(allVals));
ok('③ PDFから延床面積を読み取り（戸建）', /延床面積（㎡）=96.88/.test(allVals));
ok('③ PDFから専有面積・持分を読み取り（区分）', /専有面積（㎡）=68.42/.test(allVals) && /持分=100000分の1250/.test(allVals));
ok('④ 削除件数が表示される', drafts.every(d => /削除しました/.test(d.redacted)), drafts[0].redacted);
const rawShown = await admin.$$eval('#reviewArea .raw pre', e => e.map(x => x.textContent).join('\n'));
ok('④ 確認用テキストにも情報元が残っていない', !/株式会社|有限会社|03-1234|0120|@/.test(rawShown));

/* 掲載 */
/* 掲載するたびに確認欄が再描画されるため、毎回引き直す */
for (let i = 0; i < 5; i++) {
  const b = await admin.$('#reviewArea [data-act="publish"]');
  if (!b) break;
  await b.click();
  await admin.waitForTimeout(500);
}
await admin.waitForFunction(() => document.querySelectorAll('#reviewArea .review').length === 0, { timeout: 8000 });
ok('掲載後、確認欄が空になる', (await admin.$$('#reviewArea .review')).length === 0);
const rows = await admin.$$eval('#admRows tr', r => r.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
ok('管理画面の掲載一覧に2件', rows.length === 2, rows.join(' / '));
rows.forEach(r => console.log('    ' + r));

/* ユーザー画面に反映されるか */
const pub = await ctx.newPage();
await pub.goto(BASE);
await pub.waitForSelector('#pubGrid .card', { timeout: 8000 });
const cards = await pub.$$eval('#pubGrid .card', cs => cs.map(c => c.textContent.replace(/\s+/g, ' ').trim()));
ok('① ユーザー画面に2件が掲載される', cards.length === 2, `${cards.length}件`);
cards.forEach(c => console.log('    ' + c.slice(0, 150)));
ok('ユーザー画面に価格が表示', cards.join().includes('6,480万円') && cards.join().includes('1億2,800万円'));
ok('戸建カードに延床面積', cards.some(c => /延床面積\s*96\.88㎡/.test(c)));
ok('区分カードに専有面積と持分', cards.some(c => /専有面積\s*68\.42㎡/.test(c) && /持分\s*100000分の1250/.test(c)));
ok('④ ユーザー画面に情報元が出ていない', !/株式会社|有限会社|03-1234|0120|山田|鈴木/.test(cards.join()));
ok('カード内にもLINEボタン', (await pub.$$eval('#pubGrid .btn-line', e => e.map(x => x.href))).every(h => h === 'https://lin.ee/ucovrzE'));

/* 絞り込み */
await pub.selectOption('#fType', 'house');
await pub.waitForTimeout(200);
ok('種別で絞り込みできる', (await pub.$$('#pubGrid .card')).length === 1);

/* 削除 */
await admin.click('#admRows [data-del]');
await admin.waitForTimeout(500);

/* レスポンシブ */
await pub.setViewportSize({ width: 390, height: 780 });
await pub.waitForTimeout(200);
const overflow = await pub.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok('スマホ幅で横スクロールが発生しない', overflow <= 1, `overflow=${overflow}px`);
await pub.screenshot({ path: path.join(HERE, 'shot-public-mobile.png'), fullPage: true });
await pub.setViewportSize({ width: 1280, height: 900 });
await pub.waitForTimeout(200);
await pub.screenshot({ path: path.join(HERE, 'shot-public.png'), fullPage: true });
await admin.screenshot({ path: path.join(HERE, 'shot-admin.png'), fullPage: true });

/* =========================================================
   4. 異常系
   ========================================================= */
console.log('\n[4] 異常系');
const bad = path.join(FIX, 'empty.txt');
fs.writeFileSync(bad, 'あ');
await admin.setInputFiles('#fileInput', [bad]);
await admin.waitForTimeout(800);
const lastLog = await admin.$$eval('#dropLog div', e => e.map(x => x.className + ':' + x.textContent).pop());
ok('テキストが取れない資料はエラー表示', /err/.test(lastLog || ''), lastLog);

await browser.close();
server.close();
console.log(`\n=== 結果: ${pass} 件成功 / ${fail} 件失敗 ===`);
process.exit(fail ? 1 : 0);
