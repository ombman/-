/* 販売図面の最下部にある「帯情報」（社名ロゴ・営業所・住所・電話・免許番号・
   担当者・取引態様・自社広告が1枠にまとまった業者欄）を、ページごと
   切り取れているかを確かめる。
   帯には連絡先そのものではない行（報酬形態・取引態様・自社広告）も並ぶため、
   それらを理由に切り取りが見送られないことを重点的に見る。 */
import { chromium } from 'playwright';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
const ROOT='/home/user/-/wix-embed';
const FILE=process.env.WIDGET_FILE||'index.html';
const srv=http.createServer((q,r)=>{
  const f=path.join(ROOT,q.url.split('?')[0]==='/'?FILE:q.url.split('?')[0]);
  if(!fs.existsSync(f)){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8295,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await (await b.newContext()).newPage();
p.on('pageerror',e=>console.log('PAGEERROR',e.message));
await p.goto('http://127.0.0.1:8295/'+FILE);
await p.waitForFunction(()=>!!window.__RE);

let pass=0,fail=0;
const ok=(n,c,g)=>{c?(pass++,console.log(`  \x1b[32m✔\x1b[0m ${n}${g?' — '+g:''}`)):(fail++,console.log(`  \x1b[31m✖ ${n} — ${g}\x1b[0m`))};

/* ウィル不動産販売の図面を再現した行データ。
   y はページ高 1000px に対する位置。帯は 860px から下。 */
const PAGE_H = 1000;
const layout = [
  /* --- 物件情報（残すべき範囲） --- */
  { y: 120, text: '阪急「夙川駅」徒歩4分' },
  { y: 160, text: 'JR「さくら夙川駅」徒歩9分の2沿線アクセス' },
  { y: 240, text: '専有面積: 71.31平米  その他:' },
  { y: 270, text: 'バルコニー: 8.98平米　（　南　向き）' },
  { y: 300, text: '構造: RC造　5階建て　3階部分　3LDK' },
  { y: 330, text: '建築: 2000年7月築　総戸数: 33戸' },
  { y: 380, text: '分譲会社: 全日空ビルディング株式会社' },
  { y: 410, text: '施工会社: 五洋建設株式会社' },
  { y: 440, text: '管理会社: 日本ハウズイング株式会社 神戸支店' },
  { y: 500, text: '管理費 月額 14,260円　修繕積立金:月額 27,310円' },
  { y: 560, text: '駐車場: 空有　月額 16,000 〜 22,000円' },
  { y: 620, text: '設備: 電気 / 上下水道 / 都市ガス / エレベーター' },
  { y: 700, text: '現況: 空家　引渡時期: 相談' },
  { y: 800, text: '※本物件は概略の為、図面と現況が異なる場合は現況を優先させて頂きます' },
  /* --- ここから下が帯情報（切り取るべき範囲） --- */
  { y: 870, text: 'ウィル不動産販売' },
  { y: 890, text: '担当　永柳' },
  { y: 900, text: '取引態様　専任媒介' },
  { y: 915, text: '西宮営業所' },
  { y: 930, text: '〒662-0834 西宮市南昭和町3-18' },
  { y: 945, text: '●報酬形態:分かれ' },
  { y: 960, text: '●広告: 広告不可' },
  { y: 975, text: '不動産会社様のサイト制作を承ります　ウィルスタジオ 検索' },
];

const r = await p.evaluate(({ layout, PAGE_H }) => {
  /* 実際の描画経路と同じ判定を使うため、テスト用に切り取り位置だけを求める */
  return window.__RE.findBandTop(layout, PAGE_H);
}, { layout, PAGE_H });

console.log(`\nページ高: ${PAGE_H}px　切り取り位置: ${r.cutAt}px　帯と判定: ${r.isBand}`);
console.log(`切り取られる行: ${JSON.stringify(r.cutTexts)}\n`);

console.log('-- 帯情報を切り取る');
ok('帯情報だと判定できている', r.isBand === true, String(r.isBand));
/* 帯のすぐ上にある免責注記（「現況を優先させて頂きます」）は物件情報では
   ないため、帯と一緒に切られてよい。その上の物件情報を守れていればよい。 */
ok('物件情報の行より下だけを切っている', r.cutAt <= 870 && r.cutAt > 700,
   `${r.cutAt}px（社名870px・免責注記800px・現況700px）`);
ok('担当者名が切り取られている', r.cutTexts.some(t=>t.indexOf('永柳')>=0), r.cutTexts.join(' / '));
ok('取引態様が切り取られている', r.cutTexts.some(t=>t.indexOf('専任媒介')>=0), '');
ok('営業所・住所が切り取られている', r.cutTexts.some(t=>t.indexOf('西宮営業所')>=0)
   && r.cutTexts.some(t=>t.indexOf('662-0834')>=0), '');
ok('報酬形態・広告可否が切り取られている', r.cutTexts.some(t=>t.indexOf('報酬形態')>=0)
   && r.cutTexts.some(t=>t.indexOf('広告不可')>=0), '');
ok('自社広告が切り取られている', r.cutTexts.some(t=>t.indexOf('ウィルスタジオ')>=0), '');

console.log('\n-- 物件情報は残す');
const kept = layout.filter(l => l.y < r.cutAt).map(l => l.text);
ok('専有面積が残っている', kept.some(t=>t.indexOf('71.31')>=0), '');
ok('築年が残っている', kept.some(t=>t.indexOf('2000年7月')>=0), '');
ok('駅徒歩が残っている', kept.some(t=>t.indexOf('徒歩4分')>=0), '');
ok('管理費が残っている', kept.some(t=>t.indexOf('14,260')>=0), '');
ok('分譲会社・施工会社の欄は残っている',
   kept.some(t=>t.indexOf('全日空ビルディング')>=0) && kept.some(t=>t.indexOf('五洋建設')>=0), '');
ok('現況・引渡時期の欄が残っている', kept.some(t=>t.indexOf('空家')>=0), '');
ok('設備の欄が残っている', kept.some(t=>t.indexOf('エレベーター')>=0), '');

/* 帯が無いページを切ってしまわないこと */
console.log('\n-- 帯が無いページは切らない');
const noBand = await p.evaluate(({ PAGE_H }) => window.__RE.findBandTop([
  { y: 300, text: '専有面積: 71.31平米' },
  { y: 700, text: '現況: 空家　引渡時期: 相談' },
  { y: 900, text: '※図面は略図につき現況を優先させて頂きます' },
  { y: 950, text: '※掲載の写真は実際のものと異なる場合があります' },
], PAGE_H), { PAGE_H });
ok('注記だけの下部は切り取らない', noBand.isBand === false && noBand.cutAt === PAGE_H,
   `cutAt=${noBand.cutAt} isBand=${noBand.isBand}`);

/* 物件情報が帯の位置まで続くページを切りすぎないこと */
const deep = await p.evaluate(({ PAGE_H }) => window.__RE.findBandTop([
  { y: 300, text: '専有面積: 71.31平米' },
  { y: 880, text: '管理費 月額 14,260円' },
  { y: 940, text: '株式会社サンプル不動産　TEL 000-0000-0000' },
], PAGE_H), { PAGE_H });
ok('物件情報の行より下だけを切る', deep.cutAt > 880 && deep.isBand === true,
   `cutAt=${deep.cutAt}（管理費は880px）`);

/* 実際の図面2種で確かめる。どちらも帯の下に但し書きが入っており、
   但し書きで判定が止まると帯が丸ごと残ってしまう。 */
console.log('\n-- 但し書きがあっても帯を切る（コンフィアンス不動産の図面）');
const conf = await p.evaluate(({ PAGE_H }) => window.__RE.findBandTop([
  { y: 260, text: 'マンション　名称　価格　万円　交通' },
  { y: 720, text: 'リノベーション内容　周辺環境' },
  { y: 880, text: 'CONFIANCE　大阪府知事(3)第55822号' },
  { y: 895, text: '株式会社コンフィアンス不動産' },
  { y: 910, text: '大阪市中央区北久宝寺町1-2-1 オーセンティック東船場303号' },
  { y: 920, text: '物件確認はこちら　物件専用QRコード' },
  { y: 930, text: 'TEL 06-6125-5801　info@confiance-f.co.jp' },
  { y: 940, text: '取引態様　売主　報酬形態　正規' },
  { y: 955, text: '※掲載図面と現況が異なる場合は現況優先となります。' },
], PAGE_H), { PAGE_H });
console.log(`   切り取り位置: ${conf.cutAt}px　帯と判定: ${conf.isBand}`);
ok('帯だと判定できている', conf.isBand === true, String(conf.isBand));
ok('社名ロゴの行から切っている', conf.cutAt <= 880 && conf.cutAt > 720,
   `${conf.cutAt}px（社名880px・周辺環境720px）`);
ok('TEL・メールが切り取られている',
   conf.cutTexts.some(t=>t.indexOf('06-6125-5801')>=0)
   && conf.cutTexts.some(t=>t.indexOf('confiance-f.co.jp')>=0), '');
ok('免許番号が切り取られている', conf.cutTexts.some(t=>t.indexOf('第55822号')>=0), '');
ok('「リノベーション内容・周辺環境」は残る',
   conf.cutTexts.every(t=>t.indexOf('周辺環境')<0), '');

console.log('\n-- 下部が物件情報で終わる図面は切らない（コスモハイツ甲子園口）');
const cosmo = await p.evaluate(({ PAGE_H }) => window.__RE.findBandTop([
  { y: 500, text: '築年月　昭和48年11月　総戸数　93戸' },
  { y: 540, text: '管理形態　全部委託　施工会社　(株)熊谷組' },
  { y: 580, text: '管理費　13,600 円/月　修繕積立金　15,800 円/月' },
  { y: 620, text: '現況　空室　引渡日　即日' },
  { y: 660, text: '駐車場　空無' },
  { y: 700, text: '本体設備' },
  { y: 740, text: '各戸設備　エアコン各部屋及びリビングに設置済み' },
  { y: 790, text: '備考　※上記専有面積にはMB・物入2.56㎡含まれています' },
  { y: 820, text: '※食洗器・浴室乾燥暖房・エアコン4基' },
  { y: 850, text: '※管理会社：三菱地所コミュニティ㈱' },
  { y: 880, text: '※101号室' },
  { y: 930, text: '会員番号　　　　物件番号' },
  { y: 960, text: '※図面と現況が異なる場合は、現状を優先します。' },
], PAGE_H), { PAGE_H });
console.log(`   切り取り位置: ${cosmo.cutAt}px　帯と判定: ${cosmo.isBand}`);
const cosmoKept = t => cosmo.cutTexts.every(c => c.indexOf(t) < 0);
ok('管理費は消えない', cosmoKept('13,600'), cosmo.cutTexts.join(' / '));
ok('現況・引渡日は消えない', cosmoKept('空室'), '');
ok('各戸設備は消えない', cosmoKept('エアコン各部屋'), '');
ok('備考の専有面積の注記は消えない', cosmoKept('2.56'), '');
ok('切り取りは下から22%以内', cosmo.cutAt === PAGE_H || cosmo.cutAt >= PAGE_H * 0.78,
   `cutAt=${cosmo.cutAt}（下限 ${PAGE_H*0.78}px）`);

/* 社名ロゴは画像で位置が取れないため、文字の上端ちょうどで切ると
   ロゴの上部や枠の罫線が残る。帯の上の行との中間で切れているか。 */
console.log('\n-- 帯をきれいに切る（ロゴや枠線を残さない）');
const logo = await p.evaluate(({ PAGE_H }) => window.__RE.findBandTop([
  { y: 700, h: 14, text: '現況　空家　引渡時期　相談' },
  { y: 880, h: 30, text: 'ウィル不動産販売' },
  { y: 900, h: 12, text: '担当　永柳　取引態様　専任媒介' },
  { y: 940, h: 12, text: '〒662-0834 西宮市南昭和町3-18' },
], PAGE_H), { PAGE_H });
console.log(`   切り取り位置: ${logo.cutAt}px（帯の最上行880px・その上の行は714pxで終わる）`);
ok('帯の最上行より上で切っている', logo.cutAt < 880, `${logo.cutAt}px`);
ok('上の物件情報は残している', logo.cutAt > 714, `${logo.cutAt}px（現況の行は714pxで終わる）`);

/* 物件名の読み取り。スキャン資料では名前の欄が化けることがある */
console.log('\n-- 化けた物件名を採用しない');
const names = await p.evaluate(() => [
  '物件名　團闢闔闠a x]オートロック対応マンション施工会社新井組',
  '物件名　|を|プレステージ西宮香杯園Nニーg',
  '物件名　杏nノ',
  '建物名称　プレステージ西宮香枦園',
  '建物名称　ネオ・ディ甲子園高潮',
  '建物名称　ワコーレ夙川公園ザ・テラス',
].map(t => window.__RE.extract(t, []).record.name));
const shown = ['團闢闔闠…（記号と英字が混じる）','|を|プレステージ…','杏nノ',
               'プレステージ西宮香枦園','ネオ・ディ甲子園高潮','ワコーレ夙川公園ザ・テラス'];
shown.forEach((s,i)=>console.log(`   ${s} → ${JSON.stringify(names[i])}`));
ok('記号と会社名が混じった化けを使わない', names[0] === null, JSON.stringify(names[0]));
ok('先頭と末尾にゴミが付いた化けを使わない', names[1] === null, JSON.stringify(names[1]));
ok('短すぎる化けを使わない', names[2] === null, JSON.stringify(names[2]));
ok('正しい物件名は読み取れる', names[3] === 'プレステージ西宮香枦園', JSON.stringify(names[3]));
ok('中黒を含む物件名も読み取れる', names[4] === 'ネオ・ディ甲子園高潮', JSON.stringify(names[4]));
ok('長い物件名も読み取れる', names[5] === 'ワコーレ夙川公園ザ・テラス', JSON.stringify(names[5]));

/* 指示したもの以外は消さないこと */
console.log('\n-- 物件情報は消さない（消すのは情報元だけ）');
const sens = await p.evaluate(() => [
  ['専有面積　71.31㎡', false],
  ['価格　3,490万円', false],
  ['築年月　2000年7月　総戸数　33戸', false],
  ['管理費　月額 14,260円　修繕積立金　月額 27,310円', false],
  ['交通　阪急神戸線 夙川駅 徒歩4分', false],
  ['間取り　3LDK', false],
  ['用途地域　第一種中高層住居専用', false],
  ['分譲会社　全日空ビルディング株式会社', false],
  ['管理会社　日本ハウズイング株式会社 神戸支店', false],
  ['株式会社コンフィアンス不動産　TEL 06-6125-5801', true],
  ['担当　永柳　TEL 0798-62-3121', true],
  ['info@confiance-f.co.jp', true],
  ['大阪府知事(3)第55822号', true],
].map(([t, want]) => ({ t, want, got: window.__RE.isSensitiveText(t, []) })));
sens.forEach(s => ok((s.want ? '消す：' : '残す：') + s.t.slice(0,28), s.got === s.want,
                     `判定=${s.got}`));

console.log(`\n=== ${pass} 成功 / ${fail} 失敗 ===`);
await b.close(); srv.close();
process.exit(fail?1:0);
