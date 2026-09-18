/* スキャン資料（文字データの無いPDF）を文字認識で読み取り、
   情報元だけを消して物件情報を残せているかを画素で確かめる */
import { chromium } from 'playwright';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
import { routeOcr } from './ocr-route.mjs';
const ROOT='/home/user/-/wix-embed', FIX='/home/user/-/test/fixtures/list';
const FILE=process.env.WIDGET_FILE||'index.html';
const PDFJS=path.join('/home/user/-/test','node_modules','pdfjs-dist');
const srv=http.createServer((q,r)=>{const url=q.url.split('?')[0];
 if(url.endsWith('.pdf')){r.writeHead(200,{'Content-Type':'application/pdf'});return r.end(fs.readFileSync(path.join(FIX,path.basename(url))));}
 const f=path.join(ROOT,url==='/'?FILE:url);
 if(!fs.existsSync(f)){r.writeHead(404);return r.end()}
 r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8280,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext();
await ctx.route('https://cdnjs.cloudflare.com/**',rt=>{
  const rel=rt.request().url().split('/3.11.174/')[1]||'';
  const local=rel.startsWith('cmaps/')||rel.startsWith('standard_fonts/')?path.join(PDFJS,rel):path.join(PDFJS,'build',path.basename(rel));
  if(!fs.existsSync(local))return rt.fulfill({status:404,body:''});
  rt.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync(local)});});
await routeOcr(ctx);
const p=await ctx.newPage();
let pass=0, fail=0;
p.on('pageerror',e=>{fail++;console.log('  \x1b[31m✖ JSエラー: '+e.message+'\x1b[0m')});
const ok=(n,c,g)=>{c?(pass++,console.log(`  \x1b[32m✔\x1b[0m ${n}${g?' — '+g:''}`)):(fail++,console.log(`  \x1b[31m✖ ${n} — ${g}\x1b[0m`))};
await p.goto('http://127.0.0.1:8280/'); await p.waitForFunction(()=>!!window.__RE);

const r = await p.evaluate(async () => {
  const buf = await (await fetch('/scan_only.pdf')).arrayBuffer();
  const file = new File([buf], 'scan_only.pdf', { type: 'application/pdf' });
  const t0 = Date.now();
  const pages = await window.__RE.renderRedactedPdf(file, []);
  const img = pages[0];
  const el = new Image();
  await new Promise(res => { el.onload = res; el.src = img.dataUrl; });
  const cv = document.createElement('canvas');
  cv.width = el.naturalWidth; cv.height = el.naturalHeight;
  const cx = cv.getContext('2d'); cx.drawImage(el, 0, 0);
  const W = cv.width, H = cv.height, fullH = H + (img.croppedPx || 0);
  const variance = (x, y, w, h) => {
    const d = cx.getImageData(Math.max(0,x), Math.max(0,y), Math.max(1,w), Math.max(1,h)).data;
    let sum=0, sq=0, n=0;
    for (let i=0;i<d.length;i+=4){const v=(d[i]+d[i+1]+d[i+2])/3; sum+=v; sq+=v*v; n++;}
    const m=sum/n; return Math.round(Math.sqrt(sq/n-m*m));
  };
  const rowH = Math.round(26 * (fullH / 595)), top = Math.round(fullH * 0.100);
  const rows = [];
  for (let i = 0; i < 8; i++) {
    const y = top + i * rowH;
    rows.push({ i, left: variance(20, y, Math.round(W*0.45), rowH),
                   right: variance(Math.round(W*0.52), y, Math.round(W*0.45), rowH) });
  }
  /* 文字認識の結果から物件情報を取り出せるか */
  const rec = window.__RE.extract(img.ocrText || '', []).record;
  return { secs: Math.round((Date.now()-t0)/1000), masked: img.masked, cropped: img.croppedPx,
           rows, rec, textLen: (img.ocrText||'').replace(/\s/g,'').length };
});
console.log(`文字認識にかかった時間: ${r.secs}秒　読み取れた文字数: ${r.textLen}`);
console.log('測定:', JSON.stringify(r.rows.map(x=>`行${x.i}: 左${x.left}/右${x.right}`)), '\n');

console.log('-- 情報元だけを消す');
ok('スキャン資料から文字を読み取れている', r.textLen >= 100, `${r.textLen}文字`);
ok('情報元を検出している', r.masked >= 2, `${r.masked}か所`);
ok('最下部の情報元の帯を切り取っている', r.cropped > 0, `${r.cropped}px`);
const leftAlive = r.rows.filter(x => x.left >= 6).length;
ok('左列の物件情報が1行も消えていない', leftAlive === 8, `残っている行数 ${leftAlive}/8`);
ok('右列の「分譲会社」行は残っている', r.rows[3].right >= 6, `ばらつき=${r.rows[3].right}`);
ok('右列の「管理会社」行は残っている', r.rows[4].right >= 6, `ばらつき=${r.rows[4].right}`);
ok('右列の「管理費」行は残っている', r.rows[6].right >= 6, `ばらつき=${r.rows[6].right}`);
ok('右列の単独の社名は消えている', r.rows[7].right <= 3, `ばらつき=${r.rows[7].right}`);

console.log('\n-- 文字認識から物件情報を取り出す');
ok('価格', r.rec.priceMan === 5880, String(r.rec.priceMan));
ok('駅からの徒歩分数', r.rec.walkMin === 4, String(r.rec.walkMin));
ok('専有面積', r.rec.ownArea === 71.31, String(r.rec.ownArea));
ok('種別＝マンション', r.rec.type === 'mansion', r.rec.type);

console.log(`\n=== ${pass} 成功 / ${fail} 失敗 ===`);
await b.close(); srv.close();
process.exit(fail?1:0);
