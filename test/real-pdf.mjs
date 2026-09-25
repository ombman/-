/* 手元の実物PDFを、管理画面と同じ処理で読み取り・加工して結果を書き出す。
   公開リポジトリに実物の資料を入れないため、PDFはリポジトリ外のパスを渡す。
     REAL_PDF=/path/to/file.pdf OUT=/path/to/outdir node test/real-pdf.mjs
   出力：p{n}_orig.jpg（元の紙面）/ p{n}_out.jpg（掲載用に加工した紙面）/ result.json */
import { chromium } from 'playwright';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
import { routeOcr } from './ocr-route.mjs';
const PDF = process.env.REAL_PDF, OUT = process.env.OUT;
const PAGES = (process.env.PAGES || '').split(',').filter(Boolean).map(Number);
if (!PDF || !OUT) { console.error('REAL_PDF と OUT を指定してください'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const ROOT='/home/user/-/wix-embed', FILE=process.env.WIDGET_FILE||'index.html';
const PDFJS=path.join('/home/user/-/test','node_modules','pdfjs-dist');
const srv=http.createServer((q,r)=>{const url=q.url.split('?')[0];
  if(url==='/real.pdf'){r.writeHead(200,{'Content-Type':'application/pdf'});return r.end(fs.readFileSync(PDF));}
  const f=path.join(ROOT,url==='/'?FILE:url);
  if(!fs.existsSync(f)){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8299,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext();
await ctx.route('https://cdnjs.cloudflare.com/**',rt=>{
  const rel=rt.request().url().split('/3.11.174/')[1]||'';
  const local=rel.startsWith('cmaps/')||rel.startsWith('standard_fonts/')?path.join(PDFJS,rel):path.join(PDFJS,'build',path.basename(rel));
  if(!fs.existsSync(local))return rt.fulfill({status:404,body:''});
  rt.fulfill({status:200,contentType:rel.startsWith('cmaps/')?'application/octet-stream':'text/javascript',body:fs.readFileSync(local)});});
await routeOcr(ctx);
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('PAGEERROR',e.message));
await p.goto('http://127.0.0.1:8299/'+FILE);
await p.waitForFunction(()=>!!window.__RE);

const res = await p.evaluate(async (only) => {
  const RE = window.__RE;
  const buf = await (await fetch('/real.pdf')).arrayBuffer();
  const file = new File([buf], 'real.pdf', { type: 'application/pdf' });
  const secs = await RE.readPdfFile(file);
  const all = RE.extractAll(secs, [], { keepEmpty: true });
  const ocrPages = {};
  all.forEach(r => { if (r.noText || r.filled < 3) ocrPages[r.pageNo] = true; });
  const imgs = {};
  await RE.renderRedactedPdf(file, [], { ocrPages, onPage: im => { imgs[im.pageNo] = im; } });
  /* 元の紙面も同じ大きさで描いておく（比較用） */
  const pdf = await window.pdfjsLib.getDocument({ data: buf.slice(0), cMapUrl: RE.CONFIG.PDFJS_BASE + 'cmaps/', cMapPacked: true, standardFontDataUrl: RE.CONFIG.PDFJS_BASE + 'standard_fonts/' }).promise;
  const out = [];
  for (const r of all) {
    if (only.length && only.indexOf(r.pageNo) < 0) continue;
    const im = imgs[r.pageNo] || {};
    let rec = r.record, merged = null;
    if (im.ocrText && im.ocrText.replace(/\s/g, '').length >= 8) {
      merged = RE.extract((r.rawText || '') + '\n' + im.ocrText, []);
      merged.record.name = RE.mergeName(r.record.name, im.ocrText, merged.record.type);
      if (RE.filledCount(merged.record) >= r.filled) rec = merged.record;
    }
    const pg = await pdf.getPage(r.pageNo);
    const vp = pg.getViewport({ scale: 1.6 });
    const cv = document.createElement('canvas');
    cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
    await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp, intent: 'print' }).promise;
    out.push({
      page: r.pageNo, noText: !!r.noText, textItems: (secs[r.pageNo-1]||'').replace(/\s/g,'').length,
      name: rec.name, type: rec.type, priceMan: rec.priceMan, walkMin: rec.walkMin, station: rec.station,
      age: rec.ageYears, built: rec.builtLabel, ownArea: rec.ownArea, floorArea: rec.floorArea, share: rec.share,
      masked: im.masked, croppedPx: im.croppedPx, overPaint: im.overPaint,
      rawText: (secs[r.pageNo-1]||'').slice(0, 1500), ocrText: (im.ocrText||'').slice(0, 1500),
      orig: cv.toDataURL('image/jpeg', 0.7), outImg: im.dataUrl || null
    });
  }
  return out;
}, PAGES);

const summary = res.map(r => {
  const save = (u, n) => { if (u) fs.writeFileSync(path.join(OUT, n), Buffer.from(u.split(',')[1], 'base64')); };
  save(r.orig, `p${r.page}_orig.jpg`); save(r.outImg, `p${r.page}_out.jpg`);
  const { orig, outImg, ...rest } = r; return rest;
});
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(summary, null, 1));
summary.forEach(s => console.log(
  `p${s.page} ${s.noText?'[scan]':'[text]'} name=${JSON.stringify(s.name)} price=${s.priceMan} ` +
  `walk=${s.station||''}/${s.walkMin} age=${s.age} own=${s.ownArea} floor=${s.floorArea} share=${s.share} ` +
  `masked=${s.masked} crop=${s.croppedPx} over=${s.overPaint}`));
await b.close(); srv.close();
