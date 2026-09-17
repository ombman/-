/* ④ 情報元の消し漏れが無いことを、実際の資料に出てきた表記で確認する */
import { chromium } from 'playwright';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
const ROOT='/home/user/-/wix-embed';
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(fs.readFileSync(path.join(ROOT,'index.html')))});
await new Promise(r=>srv.listen(8250,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await (await b.newContext()).newPage();
p.on('pageerror',e=>console.log('PAGEERROR',e.message));
await p.goto('http://127.0.0.1:8250/'); await p.waitForFunction(()=>!!window.__RE);

let pass=0, fail=0;
const ok=(n,c,g)=>{c?(pass++,console.log(`  \x1b[32m✔\x1b[0m ${n}`)):(fail++,console.log(`  \x1b[31m✖ ${n} — 残存: ${g}\x1b[0m`))};

/* 実際の販売図面に出てきた書き方 */
const CASES = [
  ['（株）表記',        '野村不動産（株））旧分譲【プラウド】シリーズ／2018年10月建築', ['野村不動産']],
  ['(株)半角表記',      '分譲会社： 和田興産(株)　施工会社： 今津建設(株)', ['和田興産','今津建設']],
  ['㈱表記',            '管理会社 日本ハウズイング㈱ 日勤', ['ハウズイング']],
  ['分譲会社の欄',      '分 譲 会 社\n兵庫県住宅供給公社', ['住宅供給公社']],
  ['施工会社の欄',      '施 工 会 社　伊藤忠アーバンコミュニティ', ['伊藤忠']],
  ['管理会社の欄',      '管理会社： 野村不動産パートナーズ（株）', ['野村不動産','パートナーズ']],
  ['社名＋業種',        '帝人殖産 10,000円/月', ['帝人殖産']],
  ['全日空ビルディング','分譲会社： 全日空ビルディング（株）', ['全日空']],
  ['宅建免許',          '宅建業免許／ 国土交通大臣免許(6)第6101号', ['第6101号','大臣免許']],
  ['所属協会',          '所属協会 （一社）兵庫宅建 芦屋・西宮支部', ['兵庫宅建']],
  ['保証協会',          '保証協会 （公社）宅地建物取引業保証協会', ['取引業保証協会']],
  ['電話（全角ラベル）','ＴＥＬ　0798-61-3039　ＦＡＸ　0798-61-3040', ['0798','3039']],
  ['担当者（姓名空白）','担当：味間 康高　取引士 栗田 裕仁', ['味間','康高','栗田','裕仁']],
];
console.log('-- 文字としての消し漏れ');
for (const [name, text, banned] of CASES) {
  const out = await p.evaluate(t => window.__RE.redact(t, []).text, text);
  const left = banned.filter(w => out.indexOf(w) !== -1);
  ok(name, left.length === 0, left.join(',') + '  →  ' + out.replace(/\s+/g,' ').slice(0,70));
}

console.log('\n-- 画像として消す対象と判定されるか');
for (const [name, text] of CASES) {
  const hit = await p.evaluate(t => window.__RE.isSensitiveText(t, []), text.replace(/\n/g,''));
  ok(name + '（画像側で検出）', hit === true, '検出されず');
}

console.log('\n-- 物件情報は消さない');
const KEEP = ['総額 3,780 万円','阪急神戸線 西宮北口 駅 徒歩 9 分','専有面積 73.32㎡',
              '共有持分 7049 709457','間取り 3LDK','築年月 2018年1月','現況 空家'];
for (const t of KEEP) {
  const out = await p.evaluate(x => window.__RE.redact(x, []).text, t);
  ok('残す：' + t.slice(0,16), out === t, out);
  const hit = await p.evaluate(x => window.__RE.isSensitiveText(x, []), t);
  ok('画像でも消さない：' + t.slice(0,16), hit === false, '誤検出');
}
console.log(`\n=== ${pass} 成功 / ${fail} 失敗 ===`);
await b.close(); srv.close();
process.exit(fail?1:0);
