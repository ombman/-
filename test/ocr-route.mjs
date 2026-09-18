/* テスト環境からは jsdelivr に出られないため、
   文字認識エンジンの配信をローカルの node_modules から返す */
import fs from 'node:fs'; import path from 'node:path';
const NM = '/home/user/-/test/node_modules';
export function routeOcr(ctx) {
  return ctx.route('https://cdn.jsdelivr.net/**', rt => {
    const u = rt.request().url();
    let local = null, type = 'text/javascript';
    if (u.includes('tesseract.js@') && u.endsWith('tesseract.min.js')) local = path.join(NM,'tesseract.js/dist/tesseract.min.js');
    else if (u.includes('tesseract.js@') && u.endsWith('worker.min.js')) local = path.join(NM,'tesseract.js/dist/worker.min.js');
    else if (u.includes('tesseract.js-core@')) { local = path.join(NM,'tesseract.js-core', path.basename(u));
      if (u.endsWith('.wasm')) type = 'application/wasm'; }
    else if (u.includes('@tesseract.js-data/jpn')) { local = path.join(NM,'@tesseract.js-data/jpn/4.0.0', path.basename(u));
      type = 'application/octet-stream'; }
    if (!local || !fs.existsSync(local)) return rt.fulfill({ status: 404, body: '' });
    rt.fulfill({ status: 200, contentType: type, body: fs.readFileSync(local) });
  });
}
