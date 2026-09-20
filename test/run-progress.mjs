/* スキャン資料は1ページの文字認識に数秒かかる。全ページ終わるまで画面が
   変わらないと「固まった」ように見えるため、ページ単位で確認画面へ
   反映されることを、実際のドロップ動作で確かめる。 */
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
await new Promise(r=>srv.listen(8290,'127.0.0.1',r));
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
await p.goto('http://127.0.0.1:8290/'+FILE+'?mode=admin');
await p.waitForFunction(()=>!!window.__RE);

let pass=0,fail=0;
const ok=(n,c,g)=>{c?(pass++,console.log(`  \x1b[32m✔\x1b[0m ${n}${g?' — '+g:''}`)):(fail++,console.log(`  \x1b[31m✖ ${n} — ${g}\x1b[0m`))};

/* ドロップして、完了を待たずに途中経過を記録しつづける */
const r = await p.evaluate(async () => {
  const buf = await (await fetch('/scanned.pdf')).arrayBuffer();
  const dt = new DataTransfer();
  dt.items.add(new File([buf],'scanned.pdf',{type:'application/pdf'}));
  document.getElementById('dz').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true}));

  const log = () => (document.getElementById('dropLog').textContent||'');
  const shots = [];          /* 途中経過の記録 */
  const t0 = Date.now();
  let doneAt = null;
  while (Date.now()-t0 < 300000) {
    const txt = log();
    const m = txt.match(/([0-9]+)／([0-9]+)ページ/);
    shots.push({ ms: Date.now()-t0,
                 prog: m ? Number(m[1]) : null,
                 total: m ? Number(m[2]) : null,
                 imgs: document.querySelectorAll('img.sheet-thumb').length });
    if (txt.indexOf('作成しました') >= 0) { doneAt = Date.now()-t0; break; }
    await new Promise(r=>setTimeout(r,200));
  }
  return { shots, doneAt, finalImgs: document.querySelectorAll('img.sheet-thumb').length,
           finalLog: log().replace(/\s+/g,' ').trim() };
});

/* 途中で進捗が出ていたか（1ページ目完了〜最終ページ完了の間に段階が見えるか） */
const progs = [...new Set(r.shots.map(s=>s.prog).filter(v=>v!=null))].sort((a,b)=>a-b);
/* 完了より前に資料画像が1枚以上ついていたか */
const early = r.shots.filter(s => s.imgs > 0);
const firstImgMs = early.length ? early[0].ms : null;

console.log(`\n完了まで: ${r.doneAt}ms　途中で見えた進捗: ${JSON.stringify(progs)}`);
console.log(`最初に資料画像が出た時点: ${firstImgMs}ms　最終的な資料画像: ${r.finalImgs}枚`);
console.log('画面のログ:', r.finalLog, '\n');

console.log('-- 途中経過が画面に出ること');
ok('「N／Mページ」の進捗が表示される', progs.length >= 1, JSON.stringify(progs));
ok('進捗が2段階以上すすむのが見える', progs.length >= 2, `${progs.length}段階`);
ok('全ページ完了より前に資料画像が出はじめる',
   firstImgMs != null && r.doneAt != null && firstImgMs < r.doneAt,
   `画像 ${firstImgMs}ms / 完了 ${r.doneAt}ms`);
ok('最終的に5ページ分の資料画像がそろう', r.finalImgs === 5, `${r.finalImgs}枚`);
ok('完了メッセージに「作成中」が残っていない', r.finalLog.indexOf('作成中') < 0, r.finalLog.slice(-60));
/* 進捗の差し替えに失敗すると「5／5ページ4／5ページ…」と古い表示が積み重なる */
ok('進捗表示が積み重なっていない', (r.finalLog.match(/／[0-9]+ページ/g)||[]).length === 0,
   (r.finalLog.match(/／[0-9]+ページ/g)||[]).join(''));

console.log(`\n=== ${pass} 成功 / ${fail} 失敗 ===`);
await b.close(); srv.close();
process.exit(fail?1:0);
