/* 多段組みの図面で、会社情報だけが消え、物件情報が巻き添えにならないことを確認する */
import { chromium } from 'playwright';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
const ROOT='/home/user/-/wix-embed', FIX='/home/user/-/test/fixtures/list';
const PDFJS=path.join('/home/user/-/test','node_modules','pdfjs-dist');
const FILE=process.env.WIDGET_FILE || 'index.html';
const srv=http.createServer((q,r)=>{const url=q.url.split('?')[0];
 if(url.endsWith('.pdf')){r.writeHead(200,{'Content-Type':'application/pdf'});return r.end(fs.readFileSync(path.join(FIX,path.basename(url))));}
 const f=path.join(ROOT,url==='/'?FILE:url);
 if(!fs.existsSync(f)){r.writeHead(404);return r.end()}
 r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8270,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext();
await ctx.route('https://cdnjs.cloudflare.com/**',rt=>{
  const rel=rt.request().url().split('/3.11.174/')[1]||'';
  const local=rel.startsWith('cmaps/')||rel.startsWith('standard_fonts/')?path.join(PDFJS,rel):path.join(PDFJS,'build',path.basename(rel));
  if(!fs.existsSync(local))return rt.fulfill({status:404,body:''});
  rt.fulfill({status:200,contentType:rel.startsWith('cmaps/')?'application/octet-stream':'text/javascript',body:fs.readFileSync(local)});});
const p=await ctx.newPage();
let pass=0, fail=0;
p.on('pageerror',e=>{fail++;console.log('  \x1b[31m✖ JSエラー: '+e.message+'\x1b[0m')});
const ok=(n,c,g)=>{c?(pass++,console.log(`  \x1b[32m✔\x1b[0m ${n}${g?' — '+g:''}`)):(fail++,console.log(`  \x1b[31m✖ ${n} — ${g}\x1b[0m`))};
await p.goto('http://127.0.0.1:8270/'); await p.waitForFunction(()=>!!window.__RE);

const r = await p.evaluate(async () => {
  const buf = await (await fetch('/columns.pdf')).arrayBuffer();
  const file = new File([buf], 'columns.pdf', { type: 'application/pdf' });
  const pages = await window.__RE.renderRedactedPdf(file, []);
  const img = pages[0];
  const el = new Image();
  await new Promise(res => { el.onload = res; el.src = img.dataUrl; });
  const cv = document.createElement('canvas');
  cv.width = el.naturalWidth; cv.height = el.naturalHeight;
  const cx = cv.getContext('2d'); cx.drawImage(el, 0, 0);
  const W = cv.width, H = cv.height;
  const variance = (x, y, w, h) => {
    const d = cx.getImageData(Math.max(0,x), Math.max(0,y), Math.max(1,w), Math.max(1,h)).data;
    let sum=0, sq=0, n=0;
    for (let i=0;i<d.length;i+=4){const v=(d[i]+d[i+1]+d[i+2])/3; sum+=v; sq+=v*v; n++;}
    const m=sum/n; return Math.round(Math.sqrt(sq/n-m*m));
  };
  /* 8行を上から順に測る。左列 x<W/2、右列 x>W/2 */
  const rowH = Math.round(26 * (H / 595));   // 1行ぶんの高さ（横向きA4）
  /* 1行目の文字の上端。PDF上の 70pt から換算する */
  const top  = Math.round(H * 0.100);
  const rows = [];
  for (let i = 0; i < 8; i++) {
    const y = top + i * rowH;
    rows.push({ i, left: variance(20, y, Math.round(W*0.45), rowH),
                   right: variance(Math.round(W*0.52), y, Math.round(W*0.45), rowH) });
  }
  return { masked: img.masked, cropped: img.croppedPx, rows, W, H };
});
console.log('測定:', JSON.stringify(r.rows.map(x=>`行${x.i}: 左${x.left}/右${x.right}`)), '\n');
/* 右列の4行目=分譲会社、5行目=管理会社 → 消えているべき
   左列は全行とも残っているべき */
ok('会社情報を検出している', r.masked >= 2, `${r.masked}か所`);
ok('右列の「分譲会社」が消えている', r.rows[3].right <= 3, `ばらつき=${r.rows[3].right}`);
ok('右列の「管理会社」が消えている', r.rows[4].right <= 3, `ばらつき=${r.rows[4].right}`);
const leftAlive = r.rows.filter(x => x.left >= 6).length;
ok('左列の物件情報が1行も消えていない', leftAlive === 8, `残っている行数 ${leftAlive}/8`);
ok('右列の「ペット」行は残っている', r.rows[5].right >= 6, `ばらつき=${r.rows[5].right}`);
ok('右列の「管理費」行は残っている', r.rows[6].right >= 6, `ばらつき=${r.rows[6].right}`);
ok('右列の「現況」行は残っている', r.rows[7].right >= 6, `ばらつき=${r.rows[7].right}`);
ok('右列の「共有持分」行は残っている', r.rows[2].right >= 6, `ばらつき=${r.rows[2].right}`);
ok('右列の「物件名」行は残っている', r.rows[0].right >= 6, `ばらつき=${r.rows[0].right}`);
console.log(`\n=== ${pass} 成功 / ${fail} 失敗 ===`);
await b.close(); srv.close();
process.exit(fail?1:0);
