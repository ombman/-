/* 3つの連携の確認：REINS自動検索アプリ（claude/reins-auto-search-app-m5im0v の src/wix_upload.py）が
   掲載ページに対して行う操作を、同じ部品（id）・同じ順番でなぞり、
   ドロップした資料が「不動産マイソク資料フォーマット」（Canvaのマイソク）で掲載されることを確かめる。
   掲載ページの部品の id を変えるとアプリが動かなくなるので、変えたらこのテストが失敗する。
   部品の一覧は docs/INTEGRATION-ja.md（連携の取り決め）にある */
import { chromium } from 'playwright';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
const ROOT='/home/user/-/wix-embed', FIX='/home/user/-/test/fixtures';
const FILE=process.env.WIDGET_FILE||'paste-into-wix.html';
const PDFJS=path.join('/home/user/-/test','node_modules','pdfjs-dist');
const srv=http.createServer((q,r)=>{const url=q.url.split('?')[0];
  /* Wixと同じく、掲載ページは「HTMLコード」の枠（iframe）の中に入る */
  if(url==='/'){r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return r.end('<!doctype html><title>特集</title><iframe src="/w/'+FILE+'" style="width:1200px;height:900px"></iframe>');}
  const f=path.join(ROOT,path.basename(url)); if(!fs.existsSync(f)){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8319,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext();
await ctx.route('https://cdnjs.cloudflare.com/**',rt=>{const rel=rt.request().url().split('/3.11.174/')[1]||'';
  const local=rel.startsWith('cmaps/')||rel.startsWith('standard_fonts/')?path.join(PDFJS,rel):path.join(PDFJS,'build',path.basename(rel));
  if(!fs.existsSync(local))return rt.fulfill({status:404,body:''});
  rt.fulfill({status:200,contentType:rel.startsWith('cmaps/')?'application/octet-stream':'text/javascript',body:fs.readFileSync(local)});});
await ctx.route('https://static.wixstatic.com/**',rt=>rt.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64')}));
await ctx.route('https://raw.githubusercontent.com/**',rt=>rt.abort());
let pass=0,fail=0;
const ok=(n,c,g)=>{c?(pass++,console.log(`  \x1b[32m✔\x1b[0m ${n}${g?' — '+g:''}`)):(fail++,console.log(`  \x1b[31m✖ ${n} — ${g}\x1b[0m`))};
const p=await ctx.newPage();
p.on('pageerror',e=>{fail++;console.log('  \x1b[31m✖ JSエラー: '+e.message+'\x1b[0m')});
await p.goto('http://127.0.0.1:8319/');

console.log('\n-- アプリと同じ手順で掲載ページを操作する');
/* find_widget_frame：#dz と #fileInput がある枠 */
let frame=null;
for(let i=0;i<40&&!frame;i++){ for(const f of p.frames()){ try{ if(await f.locator('#dz').count() && await f.locator('#fileInput').count()) frame=f; }catch(e){} } if(!frame) await p.waitForTimeout(250); }
ok('枠（iframe）の中にドロップ枠 #dz と受け口 #fileInput がある', !!frame);
/* check_widget_version：<html data-widget-version> */
const ver = await frame.evaluate(() => document.documentElement.getAttribute('data-widget-version'));
const cfg = fs.readFileSync(path.join(ROOT, FILE), 'utf8').match(/WIDGET_VERSION:\s*["']([^"']+)["']/);
ok('版の表示 data-widget-version がある（アプリが古い版を見分ける）', !!ver && cfg && ver === cfg[1], `${ver} / ${cfg && cfg[1]}`);
/* _login：#toAdmin → #pw → #btnLogin → #adminBody */
await frame.locator('#toAdmin').scrollIntoViewIfNeeded(); await frame.locator('#toAdmin').click();
await frame.locator('#pw').waitFor({state:'visible'});
await frame.fill('#pw', await frame.evaluate(()=>window.__RE.CONFIG.FALLBACK_PASSWORD));
await frame.locator('#btnLogin').click();
await frame.locator('#adminBody').waitFor({state:'visible',timeout:20000});
ok('#toAdmin → #pw → #btnLogin で管理画面 #adminBody が出る', await frame.locator('#adminBody').isVisible());
ok('ログインの結果欄 #loginLog がある', await frame.locator('#loginLog').count() === 1);
/* _discard_leftovers：#bulkBar / #bulkCount / #btnDiscardAll */
ok('前回分の破棄に使う #bulkBar・#bulkCount・#btnDiscardAll がある',
   await frame.locator('#bulkBar').count()===1 && await frame.locator('#bulkCount').count()===1 && await frame.locator('#btnDiscardAll').count()===1);
/* upload_to_wix：#fileInput に渡し、#dropLog > * が出る */
await frame.locator('#dz').scrollIntoViewIfNeeded();
await frame.locator('#fileInput').setInputFiles([path.join(FIX,'mansion.pdf')]);
await frame.locator('#dropLog > *').first().waitFor({state:'visible',timeout:60000});
ok('#fileInput に渡すと #dropLog に読み取り中の表示が出る', true);
/* publish_all：#dropLog .spin が5秒続けて無くなるまで待つ */
let quiet=0; const t0=Date.now();
while(Date.now()-t0<600000){ if(await frame.locator('#dropLog .spin').count()) quiet=0; else if(++quiet>=5) break; await p.waitForTimeout(1000); }
ok('読み取り中の印 #dropLog .spin が消える', quiet>=5, `${Math.round((Date.now()-t0)/1000)}秒`);
ok('#bulkBar が出て、件数 #bulkCount が読める', await frame.locator('#bulkBar').isVisible() && /\d/.test(await frame.locator('#bulkCount').innerText()), await frame.locator('#bulkCount').innerText());
await frame.locator('#btnPublishAll').click();
await frame.locator('#bulkLog .ok').waitFor({state:'attached',timeout:120000});
ok('#btnPublishAll を押すと結果 #bulkLog .ok が書かれる', true, (await frame.locator('#bulkLog').textContent()||'').trim().slice(0,40));

console.log('\n-- 不動産マイソク資料フォーマットで掲載される');
await frame.evaluate(()=>{ const b=document.getElementById('toPublic'); if(b) b.click(); });
await frame.locator('#pubGrid .mk-wrap').first().waitFor({state:'attached',timeout:20000});
const mk = await frame.evaluate(()=>{ const w=document.querySelector('#pubGrid .mk-wrap'); const bg=w.querySelector('.mk');
  return { bg: bg && bg.style.backgroundImage, sheet: !!w.querySelector('img.mk-sheet'), text: w.innerText.replace(/\s+/g,' ') }; });
const rec = await frame.evaluate(()=>{ const c=document.querySelector('#pubGrid .card'); return { name: c.querySelector('h3').textContent, price: c.querySelector('.price').textContent }; });
ok('掲載された物件はマイソク（Canvaの書式の背景）で表示される', /wixstatic\.com/.test(mk.bg||''), (mk.bg||'').slice(0,60));
ok('マイソクに資料の写真・間取り図が入る', mk.sheet);
const priceNum = (rec.price.match(/[0-9,]+/) || [''])[0];
ok('マイソクに読み取った値が転記される（物件名・価格）', rec.name.length > 2 && mk.text.includes(rec.name.replace(/\s.*$/, '')) && !!priceNum && mk.text.includes(priceNum), rec.name + ' ' + rec.price);

await b.close(); srv.close();
console.log(`\n=== ${pass} 成功 / ${fail} 失敗 ===`);
process.exit(fail ? 1 : 0);
