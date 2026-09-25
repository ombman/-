/* 検証用：実物PDFの指定ページについて、帯の判定に使った行と結果を出す。
   REAL_PDF=... PAGES=8 node test/band-debug.mjs */
import { chromium } from 'playwright';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
import { routeOcr } from './ocr-route.mjs';
const PDF=process.env.REAL_PDF, PAGES=(process.env.PAGES||'').split(',').map(Number);
const ROOT='/home/user/-/wix-embed', PDFJS=path.join('/home/user/-/test','node_modules','pdfjs-dist');
const srv=http.createServer((q,r)=>{const u=q.url.split('?')[0];
  if(u==='/real.pdf'){r.writeHead(200,{'Content-Type':'application/pdf'});return r.end(fs.readFileSync(PDF));}
  const f=path.join(ROOT,u==='/'?'index.html':u); if(!fs.existsSync(f)){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8303,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext();
await ctx.route('https://cdnjs.cloudflare.com/**',rt=>{const rel=rt.request().url().split('/3.11.174/')[1]||'';
  const local=rel.startsWith('cmaps/')||rel.startsWith('standard_fonts/')?path.join(PDFJS,rel):path.join(PDFJS,'build',path.basename(rel));
  if(!fs.existsSync(local))return rt.fulfill({status:404,body:''});
  rt.fulfill({status:200,contentType:rel.startsWith('cmaps/')?'application/octet-stream':'text/javascript',body:fs.readFileSync(local)});});
await routeOcr(ctx);
const p=await ctx.newPage(); await p.goto('http://127.0.0.1:8303/'); await p.waitForFunction(()=>!!window.__RE);
const res=await p.evaluate(async (pages)=>{ window.__RE_DEBUG=true;
  const buf=await (await fetch('/real.pdf')).arrayBuffer(); const file=new File([buf],'r.pdf',{type:'application/pdf'});
  const out={}; await window.__RE.renderRedactedPdf(file,[],{onPage:im=>{ if(pages.includes(im.pageNo)) out[im.pageNo]=im.debug; }});
  return out; }, PAGES);
for (const [pg,d] of Object.entries(res)) {
  console.log(`=== p${pg} H=${d.H} W=${d.W} band=${JSON.stringify({cutAt:d.band.cutAt,isBand:d.band.isBand,box:d.band.box,cut:d.band.cutTexts})} gaps=${JSON.stringify(d.why)}`);
  d.lines.filter(l=>l.y>d.H*0.7).sort((a,b)=>a.y-b.y).forEach(l=>console.log(`  y=${l.y} x=${l.x} ${l.s?'[消]':'    '} ${l.t.slice(0,70)}`));
}
await b.close(); srv.close();
