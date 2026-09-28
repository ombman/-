/* 資料に埋め込まれた日本語フォントをブラウザが読み込めない環境（Windows版Chromeの一部や
   Wixの埋め込み枠の中など）でも、資料画像から日本語の文字が消えないことを確かめる。
   以前はフォントの読み込みに失敗すると、数字以外の文字がすべて消えた資料画像になっていた。 */
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
await new Promise(r=>srv.listen(8308,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
let pass=0,fail=0;
const ok=(n,c,g)=>{c?(pass++,console.log(`  \x1b[32m✔\x1b[0m ${n}${g?' — '+g:''}`)):(fail++,console.log(`  \x1b[31m✖ ${n} — ${g}\x1b[0m`))};

async function render(block) {
  const ctx = await b.newContext();
  await ctx.route('https://cdnjs.cloudflare.com/**',rt=>{const rel=rt.request().url().split('/3.11.174/')[1]||'';
    const local=rel.startsWith('cmaps/')||rel.startsWith('standard_fonts/')?path.join(PDFJS,rel):path.join(PDFJS,'build',path.basename(rel));
    if(!fs.existsSync(local))return rt.fulfill({status:404,body:''});
    rt.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync(local)});});
  await routeOcr(ctx);
  const p = await ctx.newPage();
  if (block) await p.addInitScript(() => {
    /* フォントの読み込みがすべて失敗する環境を作る */
    const F = window.FontFace;
    window.FontFace = function (a, b2, c) { const f = new F(a, b2, c); f.load = () => Promise.reject(new Error('blocked')); return f; };
    document.fonts.add = () => document.fonts;
  });
  await p.goto('http://127.0.0.1:8308/' + FILE);
  await p.waitForFunction(() => !!window.__RE);
  /* 資料画像の文字の部分（上半分の左側）の濃い画素を数える */
  const r = await p.evaluate(async () => {
    const buf = await (await fetch('/embedded.pdf')).arrayBuffer();
    const file = new File([buf], 'embedded.pdf', { type: 'application/pdf' });
    let url = null;
    await window.__RE.renderRedactedPdf(file, [], { onPage: im => { url = im.dataUrl; } });
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, Math.floor(img.width * 0.6), Math.floor(img.height * 0.55)).data;
    let dark = 0; for (let i = 0; i < d.length; i += 4) if (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11 < 128) dark++;
    return dark;
  });
  await ctx.close();
  return r;
}
const normal = await render(false);
const blocked = await render(true);
console.log(`\n文字の部分の濃い画素：通常 ${normal} ／ フォントを読み込めない環境 ${blocked}`);
ok('通常の環境で日本語の文字が描かれている', normal > 3000, String(normal));
ok('フォントを読み込めない環境でも日本語の文字が消えない', blocked > normal * 0.8 && blocked < normal * 1.2, `${blocked}/${normal}`);
console.log(`\n=== ${pass} 成功 / ${fail} 失敗 ===`);
await b.close(); srv.close();
process.exit(fail?1:0);
