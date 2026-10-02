/* 資料が多いと文字認識に数分かかる。その途中で画面を閉じても作業が消えず、
   開き直したら続きから再開できることを確かめる。 */
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
await new Promise(r=>srv.listen(8297,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
/* 同じブラウザ内で開き直すため、context は使い回す（IndexedDB を残すため） */
const ctx=await b.newContext();
await ctx.route('https://cdnjs.cloudflare.com/**',rt=>{
  const rel=rt.request().url().split('/3.11.174/')[1]||'';
  const local=rel.startsWith('cmaps/')||rel.startsWith('standard_fonts/')?path.join(PDFJS,rel):path.join(PDFJS,'build',path.basename(rel));
  if(!fs.existsSync(local))return rt.fulfill({status:404,body:''});
  rt.fulfill({status:200,contentType:rel.startsWith('cmaps/')?'application/octet-stream':'text/javascript',body:fs.readFileSync(local)});});
await routeOcr(ctx);

let pass=0,fail=0;
const ok=(n,c,g)=>{c?(pass++,console.log(`  \x1b[32m✔\x1b[0m ${n}${g?' — '+g:''}`)):(fail++,console.log(`  \x1b[31m✖ ${n} — ${g}\x1b[0m`))};

/* --- 1回目：資料を読み取ってから、画面を閉じる --- */
const p1=await ctx.newPage();
p1.on('pageerror',e=>console.log('PAGEERROR',e.message));
await p1.goto('http://127.0.0.1:8297/'+FILE+'?mode=admin');
await p1.waitForFunction(()=>!!window.__RE);

const first = await p1.evaluate(async () => {
  const buf = await (await fetch('/scanned.pdf')).arrayBuffer();
  const dt = new DataTransfer();
  dt.items.add(new File([buf],'scanned.pdf',{type:'application/pdf'}));
  document.getElementById('dz').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true}));
  const t0 = Date.now();
  while (Date.now()-t0 < 300000) {
    if (document.getElementById('dropLog').textContent.indexOf('作成しました') >= 0) break;
    await new Promise(r=>setTimeout(r,200));
  }
  /* 保管が書き終わるのを待つ（まとめ書きの待ち時間ぶん） */
  await new Promise(r=>setTimeout(r,1500));
  const names = Array.prototype.map.call(
    document.querySelectorAll('[data-f="name"]'), e => e.value);
  return { cards: document.querySelectorAll('[data-act="publish"]').length,
           imgs: document.querySelectorAll('img.sheet-thumb').length, names };
});
console.log(`\n1回目：確認カード ${first.cards}枚／資料画像 ${first.imgs}枚`);
ok('資料を読み取れている', first.cards === 5, `${first.cards}枚`);
ok('資料画像が付いている', first.imgs === 5, `${first.imgs}枚`);

/* 画面を閉じる（タブを閉じるのと同じ） */
await p1.close();

/* --- 2回目：開き直して、続きから再開できるか --- */
const p2=await ctx.newPage();
p2.on('pageerror',e=>console.log('PAGEERROR',e.message));
await p2.goto('http://127.0.0.1:8297/'+FILE+'?mode=admin');
await p2.waitForFunction(()=>!!window.__RE);
/* 保管庫からの読み出しは非同期なので、カードが出るまで待つ */
await p2.waitForFunction(() => document.querySelectorAll('[data-act="publish"]').length > 0,
                         null, { timeout: 15000 }).catch(()=>{});

const again = await p2.evaluate(() => ({
  cards: document.querySelectorAll('[data-act="publish"]').length,
  imgs: document.querySelectorAll('img.sheet-thumb').length,
  names: Array.prototype.map.call(document.querySelectorAll('[data-f="name"]'), e => e.value),
  log: (document.getElementById('dropLog').textContent||'').replace(/\s+/g,' ').trim(),
}));
console.log(`2回目：確認カード ${again.cards}枚／資料画像 ${again.imgs}枚`);
console.log('画面のログ:', again.log.slice(0,80), '\n');

console.log('-- 画面を閉じても続きから作業できる');
ok('開き直すと下書きが戻っている', again.cards === first.cards, `${again.cards}/${first.cards}枚`);
ok('資料画像も戻っている', again.imgs === first.imgs, `${again.imgs}/${first.imgs}枚`);
ok('入力していた内容が保たれている',
   JSON.stringify(again.names) === JSON.stringify(first.names),
   `${JSON.stringify(again.names)} / ${JSON.stringify(first.names)}`);
ok('戻したことが画面に出る', again.log.indexOf('戻しました') >= 0, again.log.slice(0,60));

/* --- すべて破棄したら保管庫も消えること --- */
await p2.evaluate(() => {
  window.confirm = () => true;
  document.getElementById('btnDiscardAll').click();
});
await p2.waitForTimeout(1500);
await p2.close();
const p3=await ctx.newPage();
await p3.goto('http://127.0.0.1:8297/'+FILE+'?mode=admin');
await p3.waitForFunction(()=>!!window.__RE);
await p3.waitForTimeout(2000);
const after = await p3.evaluate(() => document.querySelectorAll('[data-act="publish"]').length);
ok('すべて破棄すると次に開いても戻らない', after === 0, `${after}枚`);

/* --- 資料画像の作成の途中で閉じても、開き直してログインすれば続きから再開する --- */
const login = async (pg) => {
  await pg.fill('#pw', await pg.evaluate(()=>window.__RE.CONFIG.FALLBACK_PASSWORD));
  await pg.click('#btnLogin'); await pg.waitForSelector('#adminBody:not([hidden])');
};
const p4=await ctx.newPage();
p4.on('pageerror',e=>console.log('PAGEERROR',e.message));
await p4.goto('http://127.0.0.1:8297/'+FILE+'?mode=admin');
await p4.waitForFunction(()=>!!window.__RE);
await login(p4);
const mid = await p4.evaluate(async () => {
  const buf = await (await fetch('/scanned.pdf')).arrayBuffer();
  const dt = new DataTransfer();
  dt.items.add(new File([buf],'scanned.pdf',{type:'application/pdf'}));
  document.getElementById('dz').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true}));
  const t0 = Date.now();
  while (Date.now()-t0 < 300000) {
    if (/作成中… [12]／5ページ/.test(document.getElementById('dropLog').textContent)) break;
    await new Promise(r=>setTimeout(r,100));
  }
  await new Promise(r=>setTimeout(r,1200));   /* 下書きの保管（まとめ書き）を待つ */
  const t = document.getElementById('dropLog').textContent;
  return { log: t.replace(/\s+/g,' '), imgs: document.querySelectorAll('img.sheet-thumb').length,
           names: Array.prototype.map.call(document.querySelectorAll('[data-f="name"]'), e => e.value) };
});
console.log('\n途中で閉じる前:', mid.imgs + '枚の資料画像', mid.log.slice(-90));
ok('作成中に「閉じても大丈夫」と出る', mid.log.indexOf('閉じても大丈夫') >= 0, mid.log.slice(-60));
ok('途中で閉じる（全ページ終わる前）', mid.imgs < 5, `${mid.imgs}枚`);
await p4.close();

const p5=await ctx.newPage();
p5.on('pageerror',e=>console.log('PAGEERROR',e.message));
await p5.goto('http://127.0.0.1:8297/'+FILE+'?mode=admin');
await p5.waitForFunction(()=>!!window.__RE);
await p5.waitForFunction(() => document.querySelectorAll('[data-act="publish"]').length > 0, null, { timeout: 15000 }).catch(()=>{});
await login(p5);
const res5 = await p5.evaluate(async () => {
  const t0 = Date.now();
  while (Date.now()-t0 < 300000) {
    if (document.getElementById('dropLog').textContent.indexOf('作成しました') >= 0) break;
    await new Promise(r=>setTimeout(r,200));
  }
  await new Promise(r=>setTimeout(r,1500));
  return { log: document.getElementById('dropLog').textContent.replace(/\s+/g,' '),
           cards: document.querySelectorAll('[data-act="publish"]').length,
           imgs: document.querySelectorAll('img.sheet-thumb').length,
           names: Array.prototype.map.call(document.querySelectorAll('[data-f="name"]'), e => e.value),
           pending: window.__RE.__drafts ? window.__RE.__drafts().filter(d => /途中/.test(d.why)).length : -1 };
});
console.log('開き直した後:', res5.log.slice(0,160));
ok('開き直すと続きから再開すると出る', res5.log.indexOf('再開') >= 0, res5.log.slice(0,80));
ok('再開して全ページの資料画像ができる', res5.imgs === 5 && res5.cards === 5, `${res5.imgs}枚／${res5.cards}件`);
ok('作成待ちの物件が残らない', res5.pending === 0, `${res5.pending}件`);
ok('一度に読み取った場合と同じ結果になる', JSON.stringify(res5.names.slice().sort()) === JSON.stringify(first.names.slice().sort()),
   `${JSON.stringify(res5.names)} / ${JSON.stringify(first.names)}`);
const jobsLeft = await p5.evaluate(() => new Promise(r => { const q = indexedDB.open('reLpDrafts', 1);
  q.onsuccess = () => { const g = q.result.transaction('v1').objectStore('v1').getAllKeys(); g.onsuccess = () => r(g.result.filter(k => String(k).indexOf('job:') === 0).length); }; }));
ok('終わったら保管したPDFを消す', jobsLeft === 0, `${jobsLeft}件`);

console.log(`\n=== ${pass} 成功 / ${fail} 失敗 ===`);
await b.close(); srv.close();
process.exit(fail?1:0);
