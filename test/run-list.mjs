import { chromium } from 'playwright';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
const ROOT='/home/user/-/wix-embed', FIX='/home/user/-/test/fixtures/list';
const srv=http.createServer((q,r)=>{const f=path.join(ROOT,q.url.split('?')[0]==='/'?'index.html':q.url.split('?')[0]);
 if(!fs.existsSync(f)){r.writeHead(404);return r.end()} r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8210,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await (await b.newContext()).newPage();
p.on('pageerror',e=>console.log('PAGEERROR',e.message));
await p.goto('http://127.0.0.1:8210/index.html');
await p.waitForFunction(()=>!!window.__RE);

const pages=['p1','p2','p3','p4','p5'].map(n=>fs.readFileSync(path.join(FIX,n+'.txt'),'utf8'));
const res=await p.evaluate(secs=>window.__RE.extractAll(secs,[]).map(r=>({
  page:r.pageNo, ...r.record})), pages);

console.log('検出された物件数:', res.length, '（期待: 5）\n');
const want=[
 {page:1,name:'西宮北口ビューハイツ',priceMan:3780,walkMin:9,station:'西宮北口駅',ownArea:73.32,share:'7049/709457',built:1981},
 {page:2,name:'ワコーレ夙川公園ザ・テラス',priceMan:4890,walkMin:4,station:'香櫨園駅',ownArea:65.09,share:'65090/2186490',built:2018},
 {page:3,name:'グランクレスト夙川',priceMan:5880,walkMin:4,station:'夙川駅',ownArea:71.31,share:'7131/245724',built:2000},
 {page:4,name:'プラウド夙川コートテラス',priceMan:5970,walkMin:4,station:'さくら夙川駅',ownArea:77.61,share:'7761/838084',built:2018},
 /* 5ページ目は表組みが崩れて築年月が離れているため、築年は手入力（確認画面で補う） */
 {page:5,name:'阪急西宮マンション',priceMan:3100,walkMin:6,station:null,ownArea:37.88,share:'3788/967999',built:null},
];
let pass=0,fail=0;
const ok=(n,c,g,w)=>{c?(pass++,console.log(`  \x1b[32m✔\x1b[0m ${n}`)):(fail++,console.log(`  \x1b[31m✖ ${n} — got=${JSON.stringify(g)} want=${JSON.stringify(w)}\x1b[0m`))};
want.forEach(w=>{
  const r=res.find(x=>x.page===w.page);
  console.log(`-- ${w.page}ページ目：${w.name}`);
  if(!r){fail++;console.log('  \x1b[31m✖ 検出されず\x1b[0m');return;}
  ok('種別=マンション', r.type==='mansion', r.type,'mansion');
  ok('価格', r.priceMan===w.priceMan, r.priceMan, w.priceMan);
  ok('駅徒歩', r.walkMin===w.walkMin, r.walkMin, w.walkMin);
  if(w.station) ok('最寄駅', r.station===w.station, r.station, w.station);
  ok('専有面積', r.ownArea===w.ownArea, r.ownArea, w.ownArea);
  ok('持分', r.share===w.share, r.share, w.share);
  if(w.built) ok('築年', r.builtLabel && r.builtLabel.startsWith(String(w.built)), r.builtLabel, w.built+'年…');
  else ok('築年は未取得（手入力に回る）', r.builtLabel===null, r.builtLabel, null);
});

/* 実際に起きた誤読の再発防止：
   価格の記載が無い資料で、修繕積立金などの月額を価格として拾わないこと */
console.log('\n-- 誤読の再発防止');
const bad = await p.evaluate(() => {
  const t = ['物件種目 中古マンション', '専有面積 65.09㎡',
             '管理費： 月額 11,000', '修繕積立金： 月額 12,500',
             '駐車場： 月額 16,000', '共有持分：3,788/967,999'].join('\n');
  return { price: window.__RE.pickPrice(t), share: window.__RE.extract(t, []).record.share };
});
ok('価格が無い資料では価格を空にする（月額費用を拾わない）', bad.price === null, bad.price, null);
ok('その資料でも持分は取れる', bad.share === '3788/967999', bad.share, '3788/967999');

console.log(`\n=== ${pass} 成功 / ${fail} 失敗 ===`);
await b.close(); srv.close();
