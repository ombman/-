/* Wixのページに埋め込まれたときの保存のやり取りを確かめる。
   以前は4秒で打ち切っていたため、画像付きの保存に時間がかかると
   Wixに保存されないまま、このブラウザ内にだけ保存されて消えていた。 */
import { chromium } from 'playwright';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
const ROOT='/home/user/-/wix-embed', FILE=process.env.WIDGET_FILE||'index.html';
/* 親ページ（Wixのページコードの代わり）：保存の返事を delay ミリ秒遅らせる。delay<0 なら返事をしない */
const HOST = `<!doctype html><meta charset="utf-8"><body>
<iframe id="f" src="/${FILE}?mode=admin" style="width:1000px;height:800px"></iframe>
<script>
window.saved = []; window.delay = 0;
const f = document.getElementById('f');
f.addEventListener('load', () => f.contentWindow.postMessage({ channel: 'reLp', action: 'setMode', payload: 'admin' }, '*'));
window.addEventListener('message', ev => {
  const m = ev.data; if (!m || m.channel !== 'reLp' || !m.rid) return;
  const reply = b => f.contentWindow.postMessage(Object.assign({ channel: 'reLp', rid: m.rid }, b), '*');
  if (m.action === 'login') return reply({ ok: true, token: 't' });
  if (m.action === 'list') return reply({ ok: true, items: window.saved });
  if (m.action === 'save') {
    if (window.delay < 0) return;
    setTimeout(() => { window.saved.push(Object.assign({ _id: 'w' + window.saved.length }, m.payload.record)); reply({ ok: true, item: m.payload.record }); }, window.delay);
  }
});
</script>`;
const srv=http.createServer((q,r)=>{const url=q.url.split('?')[0];
  if(url==='/host.html'){r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return r.end(HOST);}
  const f=path.join(ROOT,url==='/'?FILE:url); if(!fs.existsSync(f)){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8307,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await (await b.newContext()).newPage();
p.on('pageerror',e=>console.log('PAGEERROR',e.message));
await p.goto('http://127.0.0.1:8307/host.html');
const fr = await (await p.waitForSelector('#f')).contentFrame();
await fr.waitForFunction(()=>!!window.__RE);
await p.waitForTimeout(500);
let pass=0,fail=0;
const ok=(n,c,g)=>{c?(pass++,console.log(`  \x1b[32m✔\x1b[0m ${n}${g?' — '+g:''}`)):(fail++,console.log(`  \x1b[31m✖ ${n} — ${g}\x1b[0m`))};
const rec = { type: 'mansion', name: 'テスト', priceMan: 1000, sourceFile: 'a.pdf' };

console.log('\n-- Wixへの保存に時間がかかっても、Wixに保存する');
await p.evaluate(()=>{ window.delay = 6000; });
const r1 = await fr.evaluate(async (rec) => {
  const R = window.__RE;
  try { await R.Store.save(Object.assign({}, rec), 't'); return { ok: true, mode: R.Store.mode, local: (localStorage.getItem('reLp.properties.v1')||'[]').length }; }
  catch (e) { return { ok: false, err: e.message }; }
}, rec);
const saved1 = await p.evaluate(()=>window.saved.length);
ok('6秒かかる保存でもWixに保存される', r1.ok && saved1 === 1, JSON.stringify(r1) + ' Wix件数=' + saved1);
ok('このブラウザ内の保存に切り替わらない', r1.mode === 'wix' && r1.local <= 2, JSON.stringify(r1));

console.log('\n-- 返事が来ないときはエラーとして知らせる（黙って消えない）');
await p.evaluate(()=>{ window.delay = -1; });
const r2 = await fr.evaluate(async (rec) => {
  const R = window.__RE; R.CONFIG.BRIDGE_SAVE_TIMEOUT_MS = 1500;
  try { await R.Store.save(Object.assign({}, rec), 't'); return { ok: true, mode: R.Store.mode }; }
  catch (e) { return { ok: false, err: e.message, mode: R.Store.mode }; }
}, rec);
ok('時間切れはエラーになる', r2.ok === false && /時間切れ/.test(r2.err || ''), JSON.stringify(r2));
const local2 = await fr.evaluate(()=>JSON.parse(localStorage.getItem('reLp.properties.v1')||'[]').length);
ok('このブラウザ内に保存したことにしない', local2 === 0, '件数=' + local2);

console.log(`\n=== ${pass} 成功 / ${fail} 失敗 ===`);
await b.close(); srv.close();
process.exit(fail?1:0);
