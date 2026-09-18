/* ④ PDFから情報元を消したページ画像が正しく作られるかを画素で確認する */
import { chromium } from 'playwright';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
const ROOT='/home/user/-/wix-embed', FIX='/home/user/-/test/fixtures/list';
const FILE=process.env.WIDGET_FILE||'index.html';
const PDFJS=path.join('/home/user/-/test','node_modules','pdfjs-dist');
const srv=http.createServer((q,r)=>{
  const url=q.url.split('?')[0];
  if(url.endsWith('.pdf')){r.writeHead(200,{'Content-Type':'application/pdf'});return r.end(fs.readFileSync(path.join(FIX,path.basename(url))));}
  const f=path.join(ROOT,url==='/'?FILE:url);
  if(!fs.existsSync(f)){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8240,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext();
await ctx.route('https://cdnjs.cloudflare.com/**',rt=>{
  const rel=rt.request().url().split('/3.11.174/')[1]||'';
  const local=rel.startsWith('cmaps/')||rel.startsWith('standard_fonts/')?path.join(PDFJS,rel):path.join(PDFJS,'build',path.basename(rel));
  if(!fs.existsSync(local))return rt.fulfill({status:404,body:''});
  rt.fulfill({status:200,contentType:rel.startsWith('cmaps/')?'application/octet-stream':'text/javascript',body:fs.readFileSync(local)});});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR',e.message));
await p.goto('http://127.0.0.1:8240/'+FILE+'?mode=admin');
await p.waitForFunction(()=>!!window.__RE);


const r = await p.evaluate(async () => {
  const buf = await (await fetch('/sheet.pdf')).arrayBuffer();
  const file = new File([buf], 'sheet.pdf', { type: 'application/pdf' });
  const pages = await window.__RE.renderRedactedPdf(file, []);
  const img = pages[0];
  /* 画像を読み込んで、領域ごとの「色のばらつき」を測る */
  const el = new Image();
  await new Promise(res => { el.onload = res; el.src = img.dataUrl; });
  const cv = document.createElement('canvas');
  cv.width = el.naturalWidth; cv.height = el.naturalHeight;
  const cx = cv.getContext('2d'); cx.drawImage(el, 0, 0);
  const variance = (x, y, w, h) => {
    const d = cx.getImageData(x, y, w, h).data;
    let sum = 0, sq = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { const v = (d[i]+d[i+1]+d[i+2])/3; sum += v; sq += v*v; n++; }
    const m = sum/n; return Math.round(Math.sqrt(sq/n - m*m));
  };
  const W = cv.width, H = cv.height;
  return {
    masked: img.masked, croppedPx: img.croppedPx,
    outH: H, headerVar: variance(0, 0, W, Math.floor(H*0.09)),
    bodyVar: variance(0, Math.floor(H*0.12), W, Math.floor(H*0.35)),
    bytes: Math.round(img.dataUrl.length * 0.75 / 1024)
  };
});
let pass=0, fail=0;
const ok=(n,c,g)=>{c?(pass++,console.log(`  \x1b[32m✔\x1b[0m ${n}${g?' — '+g:''}`)):(fail++,console.log(`  \x1b[31m✖ ${n} — ${g}\x1b[0m`))};
console.log('測定:', JSON.stringify(r), '\n');
ok('情報元を検出している', r.masked >= 4, `${r.masked}か所`);
ok('下部の連絡先の帯を切り取っている', r.croppedPx > 0, `${r.croppedPx}px 切り取り`);
ok('上部の社名帯が同色で塗られ、文字が消えている', r.headerVar <= 2, `ばらつき=${r.headerVar}（0に近いほど無地）`);
ok('物件情報の本文は残っている', r.bodyVar >= 8, `ばらつき=${r.bodyVar}`);
ok('画像サイズが実用的', r.bytes < 400, `${r.bytes}KB`);

/* 1行が複数の断片に分かれていても検出できること */
console.log('\n-- 分割された連絡先の検出');
const sp = await p.evaluate(async () => {
  const buf = await (await fetch('/split.pdf')).arrayBuffer();
  const file = new File([buf], 'split.pdf', { type: 'application/pdf' });
  const pages = await window.__RE.renderRedactedPdf(file, []);
  const img = pages[0];
  const el = new Image();
  await new Promise(res => { el.onload = res; el.src = img.dataUrl; });
  const cv = document.createElement('canvas');
  cv.width = el.naturalWidth; cv.height = el.naturalHeight;
  const cx = cv.getContext('2d'); cx.drawImage(el, 0, 0);
  const variance = (x, y, w, h) => {
    const d = cx.getImageData(x, y, w, h).data;
    let sum=0, sq=0, n=0;
    for (let i=0;i<d.length;i+=4){const v=(d[i]+d[i+1]+d[i+2])/3; sum+=v; sq+=v*v; n++;}
    const m=sum/n; return Math.round(Math.sqrt(sq/n-m*m));
  };
  const H = cv.height, W = cv.width;
  return { masked: img.masked,
           contactVar: variance(0, Math.floor(H*0.23), Math.floor(W*0.6), Math.floor(H*0.11)),
           bodyVar: variance(0, Math.floor(H*0.12), W, Math.floor(H*0.10)) };
});
console.log('  測定:', JSON.stringify(sp));
ok('分割された電話番号・担当者名を検出', sp.masked >= 2, `${sp.masked}行`);
ok('その行が消えている', sp.contactVar <= 2, `ばらつき=${sp.contactVar}`);
ok('物件情報は残っている', sp.bodyVar >= 8, `ばらつき=${sp.bodyVar}`);


/* 通しの流れ：ドロップ → 画像生成 → 掲載 → ユーザー画面に表示 */
console.log('\n-- 管理画面からユーザー画面までの通し');
await p.goto('http://127.0.0.1:8240/'+FILE+'?mode=admin');
await p.waitForFunction(() => !!window.__RE);
await p.fill('#pw', await p.evaluate(() => window.__RE.CONFIG.FALLBACK_PASSWORD));
await p.click('#btnLogin');
await p.waitForSelector('#adminBody:not([hidden])');
await p.setInputFiles('#fileInput', [path.join(FIX, 'sheet.pdf')]);
await p.waitForFunction(() => document.querySelectorAll('#reviewArea .review img').length > 0, { timeout: 40000 });
ok('確認画面に資料画像が出る', (await p.$$('#reviewArea .review img')).length === 1);
ok('作成件数がログに出る', /資料画像を <b>1件<\/b>作成/.test(await p.innerHTML('#dropLog')),
   (await p.textContent('#dropLog')).replace(/\s+/g,' ').slice(-60));
ok('切り取りの実施が伝わる', /切り取り/.test(await p.textContent('#dropLog')));

await p.click('#btnPublishAll');
await p.waitForFunction(() => document.querySelectorAll('#reviewArea .review').length === 0, { timeout: 15000 });
await p.click('#toPublic'); await p.waitForTimeout(500);
const pub = await p.$$eval('#pubGrid .card img', e => e.map(x => x.getAttribute('src').slice(0, 30)));
ok('ユーザー画面のカードに資料画像が出る', pub.length === 1 && pub[0].startsWith('data:image/jpeg'), pub[0]);
/* カード下部の注意書き（「情報元（会社名・電話番号・担当者名等）は…」）は
   こちらが書いた定型文なので、判定から除く */
const cardText = (await p.$$eval('#pubGrid .card', c => c.map(x => x.textContent).join('')))
  .replace(/※[^※]*掲載しておりません。/g, '');
ok('ユーザー画面に会社名・連絡先の文字が無い',
   !/株式会社|有限会社|TEL|FAX|担当|免許|@|サンプル不動産|テスト住宅販売|山田|鈴木/.test(cardText),
   cardText.replace(/\s+/g,' ').slice(0, 120));

/* 「掲載しない」を選べること */
await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

console.log(`\n=== ${pass} 成功 / ${fail} 失敗 ===`);
await b.close(); srv.close();
process.exit(fail?1:0);
