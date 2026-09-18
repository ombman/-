/* 実際の販売図面（レインズシート形式）の書き方で、
   ※1の項目と物件概要がどこまで取れるかを固定する */
import { chromium } from 'playwright';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
const ROOT='/home/user/-/wix-embed';
const FILE=process.env.WIDGET_FILE||'index.html';
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(fs.readFileSync(path.join(ROOT,FILE)))});
await new Promise(r=>srv.listen(8291,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await (await b.newContext()).newPage();
let pass=0, fail=0;
p.on('pageerror',e=>{fail++;console.log('  \x1b[31m✖ JSエラー: '+e.message+'\x1b[0m')});
const ok=(n,c,g,w)=>{c?(pass++,console.log(`  \x1b[32m✔\x1b[0m ${n}`)):(fail++,console.log(`  \x1b[31m✖ ${n} — got=${g} want=${w}\x1b[0m`))};
await p.goto('http://127.0.0.1:8291/'); await p.waitForFunction(()=>!!window.__RE);

/* ── レインズシート（添付資料と同じ書き方） ── */
const SHEET = [
 '物件番号 4250759',
 'ダイアパレス甲子園 403号室',
 '▶阪神本線『甲子園駅』まで…徒歩7分 ▶阪神本線『久寿川駅』まで…徒歩5分',
 '■販売価格（消費税込） 4,290万円',
 '3LDK+2WIC',
 '物件概要',
 '◆所在地／兵庫県西宮市甲子園洲鳥町1-12',
 '◆構造・階数／鉄骨鉄筋コンクリート造9階建4階部分',
 '◆築年月／2000年9月',
 '◆現況／空室',
 '◆引渡日／相談',
 '◆用途地域／第1種住居地域・近隣商業地域',
 '◆総戸数／42戸',
 '◆管理費／月額8,705円',
 '◆修繕積立金／月額17,200円',
 '◆土地権利／所有権',
 '◆分譲会社／ダイア建設株式会社',
 '◆施工会社／モリタ建設株式会社',
 '◆設計会社／株式会社柏場企画',
 '◆管理会社／株式会社東急コミュニティー',
 '◆ペット飼育／犬・猫1匹まで飼育可（細則有）',
 '■専有面積 73.05㎡ ■バルコニー面積 11.34㎡',
 '■アルコーブ面積 1.12㎡',
 '株式会社マイプレイス［大阪営業部］',
 '国土交通大臣（4）第7356号',
 'TEL.06-7653-7127　担当／信木 修人',
 'nobuki.syuto@my-place.jp　www.my-place.jp',
].join('\n');

const r = await p.evaluate(t => {
  const e = window.__RE.extract(t, []);
  return { rec: e.record, clean: e.cleanText };
}, SHEET);
const rec = r.rec;
console.log('-- ※1の項目');
ok('物件名', rec.name === 'ダイアパレス甲子園', rec.name, 'ダイアパレス甲子園');
ok('種別＝マンション', rec.type === 'mansion', rec.type, 'mansion');
ok('価格', rec.priceMan === 4290, rec.priceMan, 4290);
ok('駅からの徒歩分数（近い方）', rec.walkMin === 5, rec.walkMin, 5);
ok('最寄駅', rec.station === '久寿川駅', rec.station, '久寿川駅');
ok('築年月', rec.builtLabel === '2000年9月', rec.builtLabel, '2000年9月');
ok('築年数が入る', typeof rec.ageYears === 'number' && rec.ageYears >= 20, rec.ageYears, '20以上');
ok('専有面積', rec.ownArea === 73.05, rec.ownArea, 73.05);

console.log('\n-- 物件概要（ユーザー画面に載る項目）');
const det = {}; (rec.details||[]).forEach(d => { det[d.label] = d.value; });
console.log('  ', JSON.stringify(det));
const WANT = { '所在地':'兵庫県西宮市甲子園洲鳥町1-12', '間取り':'3LDK+2WIC',
  '所在階':'4階部分', 'バルコニー面積':'11.34㎡', '総戸数':'42戸',
  '管理費':'8,705円', '修繕積立金':'17,200円',
  '用途地域':'第1種住居地域・近隣商業地域', '土地権利':'所有権', '現況':'空室' };
Object.keys(WANT).forEach(k => ok(k, det[k] === WANT[k], det[k], WANT[k]));
ok('建物構造が取れている', /造/.test(det['建物構造']||''), det['建物構造'], '…造…');
ok('概要が10項目以上', Object.keys(det).length >= 10, Object.keys(det).length, '10以上');

console.log('\n-- 情報元は消え、物件情報は残る');
const c = r.clean;
['マイプレイス','06-7653-7127','信木','my-place.jp','第7356号'].forEach(w =>
  ok('消えている：' + w, c.indexOf(w) === -1, '残存', 'なし'));
['ダイア建設','モリタ建設','柏場企画','東急コミュニティー'].forEach(w =>
  ok('残っている：' + w, c.indexOf(w) !== -1, 'ない', 'あり'));

console.log(`\n=== ${pass} 成功 / ${fail} 失敗 ===`);
await b.close(); srv.close();
process.exit(fail?1:0);
