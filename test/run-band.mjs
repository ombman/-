/* 販売図面の最下部にある「帯情報」（社名ロゴ・営業所・住所・電話・免許番号・
   担当者・取引態様・自社広告が1枠にまとまった業者欄）を、ページごと
   切り取れているかを確かめる。
   帯には連絡先そのものではない行（報酬形態・取引態様・自社広告）も並ぶため、
   それらを理由に切り取りが見送られないことを重点的に見る。 */
import { chromium } from 'playwright';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
const ROOT='/home/user/-/wix-embed';
const FILE=process.env.WIDGET_FILE||'index.html';
const srv=http.createServer((q,r)=>{
  const f=path.join(ROOT,q.url.split('?')[0]==='/'?FILE:q.url.split('?')[0]);
  if(!fs.existsSync(f)){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8295,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await (await b.newContext()).newPage();
p.on('pageerror',e=>console.log('PAGEERROR',e.message));
await p.goto('http://127.0.0.1:8295/'+FILE);
await p.waitForFunction(()=>!!window.__RE);

let pass=0,fail=0;
const ok=(n,c,g)=>{c?(pass++,console.log(`  \x1b[32m✔\x1b[0m ${n}${g?' — '+g:''}`)):(fail++,console.log(`  \x1b[31m✖ ${n} — ${g}\x1b[0m`))};

/* ウィル不動産販売の図面を再現した行データ。
   y はページ高 1000px に対する位置。帯は 860px から下。 */
const PAGE_H = 1000;
const layout = [
  /* --- 物件情報（残すべき範囲） --- */
  { y: 120, text: '阪急「夙川駅」徒歩4分' },
  { y: 160, text: 'JR「さくら夙川駅」徒歩9分の2沿線アクセス' },
  { y: 240, text: '専有面積: 71.31平米  その他:' },
  { y: 270, text: 'バルコニー: 8.98平米　（　南　向き）' },
  { y: 300, text: '構造: RC造　5階建て　3階部分　3LDK' },
  { y: 330, text: '建築: 2000年7月築　総戸数: 33戸' },
  { y: 380, text: '分譲会社: 全日空ビルディング株式会社' },
  { y: 410, text: '施工会社: 五洋建設株式会社' },
  { y: 440, text: '管理会社: 日本ハウズイング株式会社 神戸支店' },
  { y: 500, text: '管理費 月額 14,260円　修繕積立金:月額 27,310円' },
  { y: 560, text: '駐車場: 空有　月額 16,000 〜 22,000円' },
  { y: 620, text: '設備: 電気 / 上下水道 / 都市ガス / エレベーター' },
  { y: 700, text: '現況: 空家　引渡時期: 相談' },
  { y: 800, text: '※本物件は概略の為、図面と現況が異なる場合は現況を優先させて頂きます' },
  /* --- ここから下が帯情報（切り取るべき範囲） --- */
  { y: 870, text: 'ウィル不動産販売' },
  { y: 890, text: '担当　永柳' },
  { y: 900, text: '取引態様　専任媒介' },
  { y: 915, text: '西宮営業所' },
  { y: 930, text: '〒662-0834 西宮市南昭和町3-18' },
  { y: 945, text: '●報酬形態:分かれ' },
  { y: 960, text: '●広告: 広告不可' },
  { y: 975, text: '不動産会社様のサイト制作を承ります　ウィルスタジオ 検索' },
];

const r = await p.evaluate(({ layout, PAGE_H }) => {
  /* 実際の描画経路と同じ判定を使うため、テスト用に切り取り位置だけを求める */
  return window.__RE.findBandTop(layout, PAGE_H);
}, { layout, PAGE_H });

console.log(`\nページ高: ${PAGE_H}px　切り取り位置: ${r.cutAt}px　帯と判定: ${r.isBand}`);
console.log(`切り取られる行: ${JSON.stringify(r.cutTexts)}\n`);

console.log('-- 帯情報を切り取る');
ok('帯情報だと判定できている', r.isBand === true, String(r.isBand));
ok('社名ロゴの行から切り取っている', r.cutAt <= 870 && r.cutAt > 800,
   `${r.cutAt}px（社名は870px・注記は800px）`);
ok('担当者名が切り取られている', r.cutTexts.some(t=>t.indexOf('永柳')>=0), r.cutTexts.join(' / '));
ok('取引態様が切り取られている', r.cutTexts.some(t=>t.indexOf('専任媒介')>=0), '');
ok('営業所・住所が切り取られている', r.cutTexts.some(t=>t.indexOf('西宮営業所')>=0)
   && r.cutTexts.some(t=>t.indexOf('662-0834')>=0), '');
ok('報酬形態・広告可否が切り取られている', r.cutTexts.some(t=>t.indexOf('報酬形態')>=0)
   && r.cutTexts.some(t=>t.indexOf('広告不可')>=0), '');
ok('自社広告が切り取られている', r.cutTexts.some(t=>t.indexOf('ウィルスタジオ')>=0), '');

console.log('\n-- 物件情報は残す');
const kept = layout.filter(l => l.y < r.cutAt).map(l => l.text);
ok('専有面積が残っている', kept.some(t=>t.indexOf('71.31')>=0), '');
ok('築年が残っている', kept.some(t=>t.indexOf('2000年7月')>=0), '');
ok('駅徒歩が残っている', kept.some(t=>t.indexOf('徒歩4分')>=0), '');
ok('管理費が残っている', kept.some(t=>t.indexOf('14,260')>=0), '');
ok('分譲会社・施工会社の欄は残っている',
   kept.some(t=>t.indexOf('全日空ビルディング')>=0) && kept.some(t=>t.indexOf('五洋建設')>=0), '');
ok('図面下の注記は残っている', kept.some(t=>t.indexOf('現況を優先')>=0), '');

/* 帯が無いページを切ってしまわないこと */
console.log('\n-- 帯が無いページは切らない');
const noBand = await p.evaluate(({ PAGE_H }) => window.__RE.findBandTop([
  { y: 300, text: '専有面積: 71.31平米' },
  { y: 700, text: '現況: 空家　引渡時期: 相談' },
  { y: 900, text: '※図面は略図につき現況を優先させて頂きます' },
  { y: 950, text: '※掲載の写真は実際のものと異なる場合があります' },
], PAGE_H), { PAGE_H });
ok('注記だけの下部は切り取らない', noBand.isBand === false && noBand.cutAt === PAGE_H,
   `cutAt=${noBand.cutAt} isBand=${noBand.isBand}`);

/* 物件情報が帯の位置まで続くページを切りすぎないこと */
const deep = await p.evaluate(({ PAGE_H }) => window.__RE.findBandTop([
  { y: 300, text: '専有面積: 71.31平米' },
  { y: 880, text: '管理費 月額 14,260円' },
  { y: 940, text: '株式会社サンプル不動産　TEL 000-0000-0000' },
], PAGE_H), { PAGE_H });
ok('物件情報の行より下だけを切る', deep.cutAt > 880 && deep.isBand === true,
   `cutAt=${deep.cutAt}（管理費は880px）`);

console.log(`\n=== ${pass} 成功 / ${fail} 失敗 ===`);
await b.close(); srv.close();
process.exit(fail?1:0);
