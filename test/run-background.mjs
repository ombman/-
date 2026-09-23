/* 管理画面を開いたまま別のタブに移ると、ブラウザは画面の描画を止める。
   pdf.js は描画の続きを requestAnimationFrame で予約するため、そのままだと
   資料画像の作成が途中で止まってしまう。
   ここでは requestAnimationFrame が二度と実行されない状態（＝裏に回ったタブと
   同じ状態）を作り、それでも最後まで作成しきれるかを確かめる。 */
import { chromium } from 'playwright';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
import { routeOcr } from './ocr-route.mjs';
const ROOT='/home/user/-/wix-embed', FIX='/home/user/-/test/fixtures/list';
const FILE=process.env.WIDGET_FILE||'index.html';
const PDFJS=path.join('/home/user/-/test','node_modules','pdfjs-dist');
const srv=http.createServer((q,r)=>{
  const url=q.url.split('?')[0];
  if(url.endsWith('.pdf')){r.writeHead(200,{'Content-Type':'application/pdf'});return r.end(fs.readFileSync(path.join(FIX,path.basename(url))));}
  const f=path.join(ROOT,url==='/'?FILE:url);
  if(!fs.existsSync(f)){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8298,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext();
await ctx.route('https://cdnjs.cloudflare.com/**',rt=>{
  const rel=rt.request().url().split('/3.11.174/')[1]||'';
  const local=rel.startsWith('cmaps/')||rel.startsWith('standard_fonts/')?path.join(PDFJS,rel):path.join(PDFJS,'build',path.basename(rel));
  if(!fs.existsSync(local))return rt.fulfill({status:404,body:''});
  rt.fulfill({status:200,contentType:rel.startsWith('cmaps/')?'application/octet-stream':'text/javascript',body:fs.readFileSync(local)});});
await routeOcr(ctx);
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR',e.message));

/* ページが動き出す前に、requestAnimationFrame を「予約しても実行されない」
   ものに差し替える。裏に回ったタブとまったく同じ状態になる。 */
await p.addInitScript(() => {
  window.__rafCalls = 0;
  window.requestAnimationFrame = function () { window.__rafCalls++; return 0; };
  window.cancelAnimationFrame = function () {};
});

await p.goto('http://127.0.0.1:8298/'+FILE+'?mode=admin');
await p.waitForFunction(()=>!!window.__RE);

let pass=0,fail=0;
const ok=(n,c,g)=>{c?(pass++,console.log(`  \x1b[32m✔\x1b[0m ${n}${g?' — '+g:''}`)):(fail++,console.log(`  \x1b[31m✖ ${n} — ${g}\x1b[0m`))};

const r = await p.evaluate(async () => {
  const buf = await (await fetch('/scanned.pdf')).arrayBuffer();
  const dt = new DataTransfer();
  dt.items.add(new File([buf],'scanned.pdf',{type:'application/pdf'}));
  document.getElementById('dz').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true}));
  const t0 = Date.now();
  let lastProg = null;
  while (Date.now()-t0 < 60000) {
    const txt = document.getElementById('dropLog').textContent || '';
    const m = txt.match(/([0-9]+)／([0-9]+)ページ/);
    if (m) lastProg = Number(m[1]);
    if (txt.indexOf('作成しました') >= 0) {
      return { done: true, ms: Date.now()-t0, lastProg,
               imgs: document.querySelectorAll('img.sheet-thumb').length,
               raf: window.__rafCalls };
    }
    await new Promise(r=>setTimeout(r,200));
  }
  return { done: false, ms: Date.now()-t0, lastProg,
           imgs: document.querySelectorAll('img.sheet-thumb').length,
           raf: window.__rafCalls,
           log: (document.getElementById('dropLog').textContent||'').replace(/\s+/g,' ').slice(-120) };
});

console.log(`\n画面の描画が止まった状態での結果`);
console.log(`  完了したか: ${r.done}　かかった時間: ${r.ms}ms`);
console.log(`  進んだページ: ${r.lastProg ?? 'なし'}　資料画像: ${r.imgs}枚`);
console.log(`  描画の予約が実行されなかった回数: ${r.raf}`);
if (!r.done) console.log(`  画面のログ: ${r.log}`);

console.log('\n-- 裏に回ったタブでも資料画像を作りきる');
ok('最後まで作成が終わる', r.done === true, r.done ? '' : `${r.lastProg ?? 0}ページで止まった`);
ok('5ページ分の資料画像がそろう', r.imgs === 5, `${r.imgs}枚`);

console.log(`\n=== ${pass} 成功 / ${fail} 失敗 ===`);
await b.close(); srv.close();
process.exit(fail?1:0);
