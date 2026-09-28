/* 横倒しで貼られた資料（文字データなし）の向きを直して読み取れるかを確かめる。
   同じ内容を正しい向きで貼った資料（scan_only.pdf）と同じ項目が読めればよい。 */
import { chromium } from 'playwright';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
import { routeOcr } from './ocr-route.mjs';
const ROOT='/home/user/-/wix-embed', FIX='/home/user/-/test/fixtures/list';
const FILE=process.env.WIDGET_FILE||'index.html';
const PDFJS=path.join('/home/user/-/test','node_modules','pdfjs-dist');
const srv=http.createServer((q,r)=>{const url=q.url.split('?')[0];
  if(url.endsWith('.pdf')){r.writeHead(200,{'Content-Type':'application/pdf'});return r.end(fs.readFileSync(path.join(FIX,path.basename(url))));}
  const f=path.join(ROOT,url==='/'?FILE:url); if(!fs.existsSync(f)){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8309,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext();
await ctx.route('https://cdnjs.cloudflare.com/**',rt=>{const rel=rt.request().url().split('/3.11.174/')[1]||'';
  const local=rel.startsWith('cmaps/')||rel.startsWith('standard_fonts/')?path.join(PDFJS,rel):path.join(PDFJS,'build',path.basename(rel));
  if(!fs.existsSync(local))return rt.fulfill({status:404,body:''});
  rt.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync(local)});});
await routeOcr(ctx);
const p=await ctx.newPage();
await p.goto('http://127.0.0.1:8309/'+FILE); await p.waitForFunction(()=>!!window.__RE);
let pass=0,fail=0;
const ok=(n,c,g)=>{c?(pass++,console.log(`  \x1b[32m✔\x1b[0m ${n}${g?' — '+g:''}`)):(fail++,console.log(`  \x1b[31m✖ ${n} — ${g}\x1b[0m`))};
const read = name => p.evaluate(async (name) => {
  const R = window.__RE;
  const buf = await (await fetch('/' + name)).arrayBuffer();
  const file = new File([buf], name, { type: 'application/pdf' });
  const secs = await R.readPdfFile(file);
  const res = R.extractAll(secs, [], { keepEmpty: true })[0];
  let im = null;
  await R.renderRedactedPdf(file, [], { ocrPages: { 1: true }, onPage: x => { im = x; } });
  const m = R.mergeOcrResult(res, im, []);
  const img = new Image(); img.src = im.dataUrl; await img.decode();
  return { rec: m ? m.record : null, w: img.width, h: img.height };
}, name);
const up = await read('scan_only.pdf');
const rot = await read('rotated.pdf');
const f = r => r.rec ? `価格=${r.rec.priceMan} 徒歩=${r.rec.station}/${r.rec.walkMin} 面積=${r.rec.ownArea}` : 'なし';
console.log(`\n正しい向き: ${f(up)}（${up.w}x${up.h}）\n横倒し    : ${f(rot)}（${rot.w}x${rot.h}）`);
ok('横倒しの資料から価格を読む', rot.rec && rot.rec.priceMan != null && rot.rec.priceMan === up.rec.priceMan, `${rot.rec && rot.rec.priceMan}`);
ok('横倒しの資料から駅徒歩を読む', rot.rec && rot.rec.walkMin != null && rot.rec.walkMin === up.rec.walkMin, `${rot.rec && rot.rec.walkMin}`);
ok('資料画像を正しい向き（横長）にする', rot.w > rot.h, `${rot.w}x${rot.h}`);
console.log(`\n=== ${pass} 成功 / ${fail} 失敗 ===`);
await b.close(); srv.close();
process.exit(fail?1:0);
