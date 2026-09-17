/* ①② 一括削除・選択削除、③ 資料の全画面表示 を実際に操作して確認する */
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
await new Promise(r=>srv.listen(8260,'127.0.0.1',r));
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

await p.goto('http://127.0.0.1:8260/?mode=admin');
await p.waitForFunction(()=>!!window.__RE);
await p.fill('#pw', await p.evaluate(()=>window.__RE.CONFIG.FALLBACK_PASSWORD));
await p.click('#btnLogin'); await p.waitForSelector('#adminBody:not([hidden])');

/* 5件を掲載しておく */
await p.setInputFiles('#fileInput',[path.join(FIX,'bukken_list.pdf')]);
await p.waitForFunction(()=>document.querySelectorAll('#reviewArea .review').length>=5,{timeout:40000});
await p.click('#btnPublishAll');
await p.waitForFunction(()=>document.querySelectorAll('#admRows tr [data-del]').length>=5,{timeout:20000});
const total = (await p.$$('#admRows tr [data-del]')).length;
console.log('-- 前提');
ok('5件を掲載した', total >= 5, `${total}件`);

console.log('\n-- ② チェックを入れて一括削除');
ok('選択列が出ている', (await p.$$('#admRows .selbox')).length === total);
ok('操作バーが出ている', await p.isVisible('#admTools'));
ok('未選択では削除ボタンが押せない', await p.isDisabled('#btnDelSel'));
const boxes = await p.$$('#admRows .selbox');
await boxes[0].check(); await boxes[1].check();
await p.waitForTimeout(200);
ok('選択件数が出る', (await p.textContent('#selCount')) === '2件を選択中', await p.textContent('#selCount'));
ok('削除ボタンが押せるようになる', !(await p.isDisabled('#btnDelSel')));
p.once('dialog', d => d.accept());
await p.click('#btnDelSel');
await p.waitForFunction(t => document.querySelectorAll('#admRows tr [data-del]').length === t - 2, total, {timeout:20000});
ok('選択した2件だけ削除された', (await p.$$('#admRows tr [data-del]')).length === total - 2,
   `${(await p.$$('#admRows tr [data-del]')).length}件が残存`);
ok('結果がログに出る', /2件を削除しました/.test(await p.textContent('#admLog')), await p.textContent('#admLog'));

console.log('\n-- すべて選択');
await p.check('#chkAll'); await p.waitForTimeout(200);
ok('すべて選択できる', (await p.$$('#admRows .selbox:checked')).length === total - 2);
await p.uncheck('#chkAll'); await p.waitForTimeout(200);
ok('すべて解除できる', (await p.$$('#admRows .selbox:checked')).length === 0);

console.log('\n-- ① すべての物件を削除');
p.once('dialog', d => d.accept());
await p.click('#btnDelAll');
await p.waitForFunction(()=>document.querySelectorAll('#admRows tr [data-del]').length===0,{timeout:25000});
ok('全件削除された', (await p.$$('#admRows tr [data-del]')).length === 0);
ok('「登録されていません」が出る', await p.isVisible('#admEmpty'));
ok('操作バーが隠れる', !(await p.isVisible('#admTools')));

console.log('\n-- ③ 資料をクリックで全画面表示');
await p.setInputFiles('#fileInput',[path.join(FIX,'sheet.pdf')]);
await p.waitForFunction(()=>document.querySelectorAll('#reviewArea .review img.sheet-thumb').length>0,{timeout:40000});
await p.click('#reviewArea img.sheet-thumb'); await p.waitForTimeout(300);
ok('確認画面の資料をクリックで全画面になる', await p.isVisible('#viewer'));
const box = await p.locator('#viewerImg').boundingBox();
const vp = p.viewportSize();
ok('画面の大部分を使って表示される', box.height > vp.height * 0.7, `画像高さ ${Math.round(box.height)} / 画面 ${vp.height}`);
await p.click('#viewerImg'); await p.waitForTimeout(250);
ok('クリックで拡大できる', await p.locator('#viewer').evaluate(v=>v.classList.contains('zoomed')));
await p.keyboard.press('Escape'); await p.waitForTimeout(250);
ok('Escで閉じる', !(await p.isVisible('#viewer')));

await p.click('#btnPublishAll');
await p.waitForFunction(()=>document.querySelectorAll('#pubGrid').length>0);
await p.click('#toPublic'); await p.waitForTimeout(500);
await p.click('#pubGrid img.sheet-thumb'); await p.waitForTimeout(300);
ok('ユーザー画面の資料もクリックで全画面になる', await p.isVisible('#viewer'));
await p.click('#viewerClose'); await p.waitForTimeout(250);
ok('×で閉じる', !(await p.isVisible('#viewer')));

await p.evaluate(()=>{try{localStorage.clear()}catch(e){}});
console.log(`\n=== ${pass} 成功 / ${fail} 失敗 ===`);
await b.close(); srv.close();
process.exit(fail?1:0);
