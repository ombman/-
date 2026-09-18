/* ④ 情報元の消し漏れが無いことを、実際の資料に出てきた表記で確認する */
import { chromium } from 'playwright';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
const ROOT='/home/user/-/wix-embed';
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(fs.readFileSync(path.join(ROOT,process.env.WIDGET_FILE||'index.html')))});
await new Promise(r=>srv.listen(8250,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await (await b.newContext()).newPage();
p.on('pageerror',e=>console.log('PAGEERROR',e.message));
await p.goto('http://127.0.0.1:8250/'); await p.waitForFunction(()=>!!window.__RE);

let pass=0, fail=0;
const ok=(n,c,g)=>{c?(pass++,console.log(`  \x1b[32m✔\x1b[0m ${n}`)):(fail++,console.log(`  \x1b[31m✖ ${n} — 残存: ${g}\x1b[0m`))};

/* 実際の販売図面に出てきた書き方。
   消すのは「資料の出所」＝掲載元の不動産会社・連絡先・担当者だけ。
   分譲会社／施工会社／設計会社／管理会社は物件そのものの属性なので残す
   （利用者の指定：添付資料の黄色枠は残す、赤枠＝情報元の帯は消す）。 */
const CASES = [
  ['（株）表記',        '野村不動産（株））旧分譲【プラウド】シリーズ／2018年10月建築', ['野村不動産']],
  ['株式会社（前置き）','株式会社マイプレイス［大阪営業部］', ['マイプレイス']],
  ['㈱表記（単独）',    '㈱日本ハウズイング', ['ハウズイング']],
  ['(株)半角（単独）',  '和田興産(株)　西宮店', ['和田興産']],
  ['社名＋業種',        '帝人殖産 10,000円/月', ['帝人殖産']],
  ['有限会社＋営業所',  '有限会社テスト住宅販売　練馬営業所', ['テスト住宅販売']],
  ['宅建免許',          '宅建業免許／ 国土交通大臣免許(6)第6101号', ['第6101号','大臣免許']],
  ['宅建免許（大臣）',  '国土交通大臣（4）第7356号', ['第7356号']],
  ['所属協会',          '所属協会 （一社）兵庫宅建 芦屋・西宮支部', ['兵庫宅建']],
  ['保証協会',          '保証協会 （公社）宅地建物取引業保証協会', ['取引業保証協会']],
  ['電話（全角ラベル）','ＴＥＬ　0798-61-3039　ＦＡＸ　0798-61-3040', ['0798','3039']],
  ['携帯番号',          'Tel.080-4918-6787', ['080','4918']],
  ['メールアドレス',    'nobuki.syuto@my-place.jp', ['my-place.jp','nobuki']],
  ['ホームページ',      'www.my-place.jp', ['my-place']],
  ['担当者（姓名空白）','担当：味間 康高　取引士 栗田 裕仁', ['味間','康高','栗田','裕仁']],
  ['担当者（スラッシュ）','担当／信木 修人', ['信木','修人']],
];
console.log('-- 情報元の消し漏れ（文字）');
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

/* 物件の属性として書かれた会社名は、情報元ではないので残す */
console.log('\n-- 物件概要の欄に書かれた会社名は残す');
const KEEP_COMPANY = [
  ['分譲会社',        '分譲会社／ダイア建設株式会社', 'ダイア建設'],
  ['施工会社',        '施工会社／モリタ建設株式会社', 'モリタ建設'],
  ['設計会社',        '設計会社／株式会社柏場企画', '柏場企画'],
  ['管理会社',        '管理会社／株式会社東急コミュニティー', '東急コミュニティー'],
  ['(株)半角の並び',  '分譲会社： 和田興産(株)　施工会社： 今津建設(株)', '和田興産'],
  ['㈱表記',          '管理会社 日本ハウズイング㈱ 日勤', 'ハウズイング'],
  ['1文字ずつ空く欄', '分 譲 会 社\n兵庫県住宅供給公社', '住宅供給公社'],
  ['施工会社の欄',    '施 工 会 社　伊藤忠アーバンコミュニティ', '伊藤忠'],
  ['管理会社の欄',    '管理会社： 野村不動産パートナーズ（株）', '野村不動産'],
];
for (const [name, text, mustStay] of KEEP_COMPANY) {
  const out = await p.evaluate(t => window.__RE.redact(t, []).text, text);
  ok('残す：' + name, out.indexOf(mustStay) !== -1, '消えた  →  ' + out.replace(/\s+/g,' ').slice(0,60));
  const hit = await p.evaluate(t => window.__RE.isSensitiveText(t, []), text.replace(/\n/g,'　'));
  ok('画像でも消さない：' + name, hit === false, '誤検出');
}
/* ただし同じ行に連絡先が混ざっていれば、その行は情報元として消す */
const MIXED = '管理会社： 株式会社テスト管理　TEL 06-1234-5678';
const mixedOut = await p.evaluate(t => window.__RE.redact(t, []).text, MIXED);
ok('連絡先が混ざる行は消す', mixedOut.indexOf('06-1234-5678') === -1, mixedOut);
ok('連絡先が混ざる行は画像でも消す',
   await p.evaluate(t => window.__RE.isSensitiveText(t, []), MIXED) === true, '検出されず');

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
