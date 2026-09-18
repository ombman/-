/* ① 写真の多い資料でも図面が掲載できる大きさに収まること
   ② 文字データが一部しか無い資料でも、画像から読み直して項目がそろうこと */
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
await new Promise(r=>srv.listen(8290,'127.0.0.1',r));
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
await p.goto('http://127.0.0.1:8290/'); await p.waitForFunction(()=>!!window.__RE);

/* ① 写真が多い資料 */
console.log('-- 写真の多い資料でも図面が出ること');
const photo = await p.evaluate(async () => {
  const buf = await (await fetch('/photo.pdf')).arrayBuffer();
  const f = new File([buf],'photo.pdf',{type:'application/pdf'});
  const imgs = await window.__RE.renderRedactedPdf(f, []);
  const im = imgs[0];
  return { chars: im.dataUrl.length, kb: Math.round(im.bytes/1024), fits: im.fits,
           w: im.width, h: im.height, masked: im.masked, cropped: im.croppedPx };
});
console.log('  画像:', JSON.stringify(photo));
ok('掲載できる大きさに収まっている', photo.fits === true, `${photo.kb}KB`);
ok('保存側の上限（900,000文字）を下回る', photo.chars < 900000, `${photo.chars}文字`);
ok('図面が空になっていない', photo.kb > 20, `${photo.kb}KB`);
ok('情報元を消している', photo.masked >= 1 || photo.cropped > 0, `${photo.masked}か所/${photo.cropped}px`);
ok('読める大きさを保っている', photo.w >= 700, `幅${photo.w}px`);

/* ①-b 上限を超える大きさの画像は、収まるまで自動で落とすこと */
console.log('\n-- 極端に重い画像でも収めること');
const big = await p.evaluate(() => {
  const cv = document.createElement('canvas');
  cv.width = 3000; cv.height = 2100;
  const cx = cv.getContext('2d');
  const im = cx.createImageData(cv.width, cv.height);
  for (let i = 0; i < im.data.length; i += 4) {
    im.data[i] = (Math.random()*255)|0; im.data[i+1] = (Math.random()*255)|0;
    im.data[i+2] = (Math.random()*255)|0; im.data[i+3] = 255;
  }
  cx.putImageData(im, 0, 0);
  const before = cv.toDataURL('image/jpeg', 0.72).length;
  const enc = window.__RE.encodeWithinBudget(cv);
  return { before, after: enc.dataUrl.length, fits: enc.fits !== false,
           budget: window.__RE.SHEET_BUDGET, w: enc.width, h: enc.height };
});
console.log('  そのままなら', big.before, '文字 →', big.after, '文字');
ok('そのままでは上限を超える（前提の確認）', big.before > big.budget, `${big.before}文字`);
ok('自動で上限内に収める', big.after <= big.budget && big.fits, `${big.after}文字`);
ok('小さくしすぎない', big.w >= 900, `幅${big.w}px`);

/* ② 文字データが一部しか無い資料 */
console.log('\n-- 文字データが一部しか無い資料');
const hybrid = await p.evaluate(async () => {
  const buf = await (await fetch('/hybrid.pdf')).arrayBuffer();
  const f = new File([buf],'hybrid.pdf',{type:'application/pdf'});
  /* 文字データだけで読んだ場合 */
  const secs = await window.__RE.readPdfFile(f);
  const before = window.__RE.extractAll(secs, [], { keepEmpty: true })[0];
  /* 画像から読み直した場合 */
  const imgs = await window.__RE.renderRedactedPdf(f, [], { ocrPages: { 1: true } });
  const after = window.__RE.extract((before.rawText||'') + '\n' + (imgs[0].ocrText||''), []);
  return { beforeFilled: before.filled, before: before.record,
           afterFilled: [after.record.priceMan, after.record.walkMin, after.record.ageYears,
                         after.record.ownArea, after.record.share]
                        .filter(v => v !== null && v !== undefined && v !== '').length,
           after: after.record, sheetFits: imgs[0].fits };
});
console.log('  文字データのみ:', hybrid.beforeFilled, '項目 ／ 画像から読み直し後:', hybrid.afterFilled, '項目');
ok('文字データだけでは項目がそろわない（前提の確認）', hybrid.beforeFilled <= 1, `${hybrid.beforeFilled}項目`);
ok('画像から読み直すと項目が増える', hybrid.afterFilled >= 3, `${hybrid.afterFilled}項目`);
ok('価格', hybrid.after.priceMan === 5880, String(hybrid.after.priceMan));
ok('駅からの徒歩分数', hybrid.after.walkMin === 4, String(hybrid.after.walkMin));
ok('専有面積', hybrid.after.ownArea === 71.31, String(hybrid.after.ownArea));
ok('この資料の図面も掲載できる', hybrid.sheetFits === true, String(hybrid.sheetFits));

/* ③ 掲載まで通して、ユーザー画面に図面が出ること */
console.log('\n-- ユーザー画面に図面が出ること');
await p.goto('http://127.0.0.1:8290/' + FILE + '?mode=admin');
await p.waitForFunction(()=>!!window.__RE);
await p.evaluate(()=>{try{localStorage.clear()}catch(e){}});
await p.fill('#pw', await p.evaluate(()=>window.__RE.CONFIG.FALLBACK_PASSWORD));
await p.click('#btnLogin'); await p.waitForSelector('#adminBody:not([hidden])');
await p.setInputFiles('#fileInput',[path.join(FIX,'photo.pdf'), path.join(FIX,'hybrid.pdf')]);
await p.waitForFunction(()=>document.getElementById('dropLog').textContent.split('作成しました').length>2,
  {timeout:300000});
const cards = (await p.$$('#reviewArea [data-act="publish"]')).length;
const thumbs = (await p.$$('#reviewArea img.sheet-thumb')).length;
ok('確認画面に2件出る', cards === 2, `${cards}件`);
ok('確認画面に図面が2枚出る', thumbs >= 2, `${thumbs}枚`);
await p.click('#btnPublishAll');
await p.waitForFunction(()=>document.querySelectorAll('#admRows tr [data-del]').length>=2,{timeout:30000});
await p.click('#toPublic'); await p.waitForTimeout(600);
const pub = await p.evaluate(()=>({
  cards: document.querySelectorAll('#pubGrid .card').length,
  imgs: Array.prototype.filter.call(document.querySelectorAll('#pubGrid img.sheet-thumb'),
        i => (i.getAttribute('src')||'').indexOf('data:image') === 0).length
}));
ok('ユーザー画面に2件出る', pub.cards === 2, `${pub.cards}件`);
ok('ユーザー画面の2件とも図面が付いている', pub.imgs === 2, `${pub.imgs}枚`);
await p.evaluate(()=>{try{localStorage.clear()}catch(e){}});

console.log(`\n=== ${pass} 成功 / ${fail} 失敗 ===`);
await b.close(); srv.close();
process.exit(fail?1:0);
