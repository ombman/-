/* PDFをドラッグ＆ドロップしたとき、全ページが取りこぼされずに確認画面へ出ることを、
   実際の管理画面の動作で確かめる（文字が取り出せないスキャンページ込み） */
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
await new Promise(r=>srv.listen(8260,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext();
await ctx.route('https://cdnjs.cloudflare.com/**',rt=>{
  const rel=rt.request().url().split('/3.11.174/')[1]||'';
  const local=rel.startsWith('cmaps/')||rel.startsWith('standard_fonts/')?path.join(PDFJS,rel):path.join(PDFJS,'build',path.basename(rel));
  if(!fs.existsSync(local))return rt.fulfill({status:404,body:''});
  rt.fulfill({status:200,contentType:rel.startsWith('cmaps/')?'application/octet-stream':'text/javascript',body:fs.readFileSync(local)});});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR',e.message));
await p.goto('http://127.0.0.1:8260/'+FILE+'?mode=admin');
await p.waitForFunction(()=>!!window.__RE);

let pass=0,fail=0;
const ok=(n,c,g)=>{c?(pass++,console.log(`  \x1b[32m✔\x1b[0m ${n}${g?' — '+g:''}`)):(fail++,console.log(`  \x1b[31m✖ ${n} — ${g}\x1b[0m`))};

/* ① 抽出そのもの（PDF＝全ページ、テキストファイル＝空ブロックは除く） */
const raw = await p.evaluate(async () => {
  const buf = await (await fetch('/scanned.pdf')).arrayBuffer();
  const secs = await window.__RE.readPdfFile(new File([buf],'scanned.pdf',{type:'application/pdf'}));
  const all = window.__RE.extractAll(secs, [], { keepEmpty: true });
  const txt  = window.__RE.extractAll(['', '   '], [], {});
  return { pdfPages: secs.length, got: all.map(r=>({page:r.pageNo,noText:!!r.noText,filled:r.filled})),
           textFileEmpty: txt.length };
});
console.log('PDFページ数:', raw.pdfPages, '／確認画面に出たページ:', JSON.stringify(raw.got), '\n');
ok('PDFの全ページが確認画面に出る', raw.got.length === raw.pdfPages, `${raw.got.length}/${raw.pdfPages}ページ`);
ok('文字のあるページは項目を読み取れている', raw.got.filter(g=>g.filled>=3).length === 2,
   raw.got.map(g=>g.filled).join(','));
ok('文字の無いページは「手入力が必要」の印が付く', raw.got.filter(g=>g.noText).length === 3,
   raw.got.filter(g=>g.noText).map(g=>g.page).join(','));
ok('テキストファイルの空ブロックは出さない', raw.textFileEmpty === 0, String(raw.textFileEmpty));

/* ② 実際にドロップしたときの画面表示 */
const ui = await p.evaluate(async () => {
  const buf = await (await fetch('/scanned.pdf')).arrayBuffer();
  const dt = new DataTransfer();
  dt.items.add(new File([buf],'scanned.pdf',{type:'application/pdf'}));
  document.getElementById('dz').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true}));
  const t0 = Date.now();
  while (Date.now()-t0 < 20000) {
    const n = document.querySelectorAll('[data-act="publish"]').length;
    if (n > 0 && !document.querySelector('#dropLog .spin')) return {
      cards: n,
      scanBadges: Array.prototype.filter.call(document.querySelectorAll('span.tag'), e => e.textContent.indexOf('スキャン画像') >= 0).length,
      log: (document.getElementById('dropLog').textContent||'').replace(/\s+/g,' ').trim()
    };
    await new Promise(r=>setTimeout(r,200));
  }
  return { cards:0, scanBadges:0, log:(document.getElementById('dropLog').textContent||'').trim() };
});
console.log('\n画面のログ:', ui.log, '\n');
ok('ドロップすると5ページ分の確認カードが出る', ui.cards === 5, `${ui.cards}枚`);
ok('スキャンページには印が付いている', ui.scanBadges === 3, `${ui.scanBadges}件`);
ok('エラーで止まらない', !/読み取れません|失敗|エラー/.test(ui.log), ui.log);

console.log(`\n=== ${pass} 成功 / ${fail} 失敗 ===`);
await b.close(); srv.close();
process.exit(fail?1:0);
