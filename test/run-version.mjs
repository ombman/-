/* 掲載ページ（HTML）が古い版のまま公開されていると、改善した処理（マイソクへの転記など）が使われない。
   管理画面にログインしたとき、最新の版と比べて古ければ知らせることを確かめる */
import { chromium } from 'playwright';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
const ROOT='/home/user/-/wix-embed', FILE=process.env.WIDGET_FILE || 'index.html';
const PDFJS=path.join('/home/user/-/test','node_modules','pdfjs-dist');
const srv=http.createServer((q,r)=>{const url=q.url.split('?')[0];
 const f=path.join(ROOT,url==='/'?FILE:url); if(!fs.existsSync(f)){r.writeHead(404);return r.end()}
 r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8318,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
let pass=0,fail=0;
const ok=(n,c,g)=>{c?(pass++,console.log(`  \x1b[32m✔\x1b[0m ${n}${g?' — '+g:''}`)):(fail++,console.log(`  \x1b[31m✖ ${n} — ${g}\x1b[0m`))};
async function run(remote) {
  const ctx = await b.newContext();
  await ctx.route('https://cdnjs.cloudflare.com/**',rt=>{const rel=rt.request().url().split('/3.11.174/')[1]||'';
    const local=rel.startsWith('cmaps/')||rel.startsWith('standard_fonts/')?path.join(PDFJS,rel):path.join(PDFJS,'build',path.basename(rel));
    if(!fs.existsSync(local))return rt.fulfill({status:404,body:''}); rt.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync(local)});});
  await ctx.route('https://raw.githubusercontent.com/**', rt => remote == null ? rt.abort() : rt.fulfill({ status: 200, contentType: 'text/plain', body: remote }));
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8318/?mode=admin'); await p.waitForFunction(() => !!window.__RE);
  await p.fill('#pw', await p.evaluate(() => window.__RE.CONFIG.FALLBACK_PASSWORD));
  await p.click('#btnLogin'); await p.waitForSelector('#adminBody:not([hidden])');
  await p.waitForTimeout(1500);
  const r = { shown: await p.isVisible('#verWarn'), text: await p.textContent('#verWarn') };
  await ctx.close(); return r;
}
const mine = fs.readFileSync(path.join(ROOT, FILE), 'utf8').match(/WIDGET_VERSION: *['"]([^'"]+)['"]/)[1];
console.log('\n-- 管理画面で掲載ページの版を確かめる');
const a = await run('...WIDGET_VERSION:"2099-01-01.1"...');
ok('最新より古い版なら、貼り替えと公開を知らせる', a.shown && /古い版/.test(a.text) && a.text.includes('2099-01-01.1'), a.text.slice(0, 60));
const s = await run('...WIDGET_VERSION:"' + mine + '"...');
ok('最新の版なら何も出さない', !s.shown, String(s.shown));
const n = await run(null);
ok('最新の版を確かめられない（通信できない）ときは何も出さない', !n.shown, String(n.shown));
await b.close(); srv.close();
console.log(`\n=== ${pass} 成功 / ${fail} 失敗 ===`);
process.exit(fail ? 1 : 0);
