/* 日本語の文字の対応表（CMap）を、いつもの配信元から読み込めない環境でも読み取れること。
   読み込めないと pdf.js はエラーにせず日本語を空のまま続けるため、物件名・所在地などが空になり、
   資料画像からも日本語が消えていた。予備の配信元から読み込み、どこからも読めなければ中止して理由を出す。 */
import { chromium } from 'playwright';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
import { routeOcr } from './ocr-route.mjs';
const ROOT='/home/user/-/wix-embed', FIX='/home/user/-/test/fixtures';
const FILE=process.env.WIDGET_FILE||'index.html';
const PDFJS=path.join('/home/user/-/test','node_modules','pdfjs-dist');
const srv=http.createServer((q,r)=>{const url=q.url.split('?')[0];
  if(url.endsWith('.pdf')){r.writeHead(200,{'Content-Type':'application/pdf'});return r.end(fs.readFileSync(path.join(FIX,path.basename(url))));}
  const f=path.join(ROOT,url==='/'?FILE:url); if(!fs.existsSync(f)){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8317,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
let pass=0,fail=0;
const ok=(n,c,g)=>{c?(pass++,console.log(`  \x1b[32m✔\x1b[0m ${n}${g?' — '+g:''}`)):(fail++,console.log(`  \x1b[31m✖ ${n} — ${g}\x1b[0m`))};

async function run(mode) {
  const ctx = await b.newContext();
  const used = [];
  await ctx.route('https://cdnjs.cloudflare.com/**',rt=>{const rel=rt.request().url().split('/3.11.174/')[1]||'';
    if (rel.startsWith('cmaps/') && mode !== 'normal') return rt.fulfill({status:404,body:''});
    const local=rel.startsWith('cmaps/')||rel.startsWith('standard_fonts/')?path.join(PDFJS,rel):path.join(PDFJS,'build',path.basename(rel));
    if(!fs.existsSync(local))return rt.fulfill({status:404,body:''});
    if (rel.startsWith('cmaps/')) used.push('cdnjs');
    rt.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync(local)});});
  await routeOcr(ctx);
  await ctx.route(/pdfjs-dist@3\.11\.174\/cmaps\//, rt => {
    if (mode === 'none') return rt.fulfill({status:404,body:''});
    used.push(rt.request().url().includes('jsdelivr') ? 'jsdelivr' : 'unpkg');
    rt.fulfill({status:200,contentType:'application/octet-stream',body:fs.readFileSync(path.join(PDFJS,'cmaps',rt.request().url().split('/').pop()))});
  });
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8317/' + FILE);
  await p.waitForFunction(() => !!window.__RE);
  const r = await p.evaluate(async () => {
    const buf = await (await fetch('/mansion.pdf')).arrayBuffer();
    const file = new File([buf], 'mansion.pdf', { type: 'application/pdf' });
    try {
      const secs = await window.__RE.readPdfFile(file);
      const rec = window.__RE.extractAll(secs, [], { keepEmpty: true })[0].record;
      return { name: rec.name, price: rec.priceMan, text: secs.join('').slice(0, 200) };
    } catch (e) { return { err: e.message }; }
  });
  await ctx.close();
  return Object.assign(r, { used: [...new Set(used)] });
}

console.log('\n-- いつもの配信元から読める');
const a = await run('normal');
ok('物件名・価格を読める', !!a.name && a.price != null, JSON.stringify(a.name) + ' ' + a.price);
console.log('\n-- いつもの配信元が止められている');
const m = await run('mirror');
ok('予備の配信元から対応表を読み込む', m.used.includes('jsdelivr'), JSON.stringify(m.used));
ok('物件名・価格を同じく読める', m.name === a.name && m.price === a.price, JSON.stringify(m.name) + ' ' + m.price);
console.log('\n-- どこからも読み込めない');
const n = await run('none');
ok('空のまま続けず、理由を出して中止する', /CMap/.test(n.err || ''), n.err || JSON.stringify(n));

await b.close(); srv.close();
console.log(`\n=== ${pass} 成功 / ${fail} 失敗 ===`);
process.exit(fail ? 1 : 0);
