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

/* 文字認識だけで読んだ行は、読み違いで物件情報を消してしまわないよう
   判定を厳しくする（消すのは読み違えようのない連絡先だけ）。 */
console.log('\n-- 文字認識の行は読み違えようのない連絡先だけ消す');
const ocrCases = await p.evaluate(() => [
  ['専有面積　71.31㎡', false],
  ['株式会社コンフィアンス不動産', true],   /* 社名は情報元なので消す */
  ['大阪市中央区北久宝寺町1-2-1', false],
  ['物件確認はこちら', false],
  ['リノベーション内容', false],
  ['TEL 06-6125-5801', true],
  ['info@confiance-f.co.jp', true],
  ['06-6125-5801', true],
  ['大阪府知事(3)第55822号', true],
  ['https://confiance-f.co.jp', true],
  /* 管理会社の電話番号は物件の情報なので残す（「管理」が「寄理」と読まれても） */
  ['丸紅幅@施工会社:帖間組@密理組合:有@商理会社:希ライフサポート西洋@寄理会社TEL:06-6344.0331患管理形態:全部委託', false],
  ['●管理会社 TEL：06-6344-0331 ●管理形態：全部委託', false],
  ['フジホームバンク大阪店 TEL 06-4800-4689', true],
].map(([t, want]) => ({ t, want, got: window.__RE.isSensitiveText(t, [], true) })));
ocrCases.forEach(c => ok((c.want ? '消す：' : '残す：') + c.t.slice(0,26),
                         c.got === c.want, `判定=${c.got}`));

console.log('\n-- マイソク（Canvaのデザイン）への転記');
const mk = await p.evaluate(() => {
  const R = window.__RE;
  const land = R.extract('売地\n所在地 西宮市上鳴尾町13-18\n交通 阪神本線「鳴尾・武庫川女子大前」駅 徒歩4分\n価格 3,280万円\n土地面積 150.25㎡（45.45坪）\n用途地域 第一種住居地域　建ぺい率 60%　容積率 200%\n地目 宅地\n接道 南側公道 幅員6m\n建築条件 なし\n現況 更地\n引渡 相談\n取引態様 媒介\n株式会社サンプル不動産 TEL 06-1234-5678 所在地 大阪市北区梅田1-1-1', []).record;
  const house = R.extract('中古戸建\n所在地：西宮市甲子園口3丁目12-5\nJR神戸線「甲子園口」駅 徒歩8分\n価格 4,980万円\n土地面積 120.33㎡ 延床面積 98.50㎡\n間取り 4LDK 木造2階建\n築年月 2014年3月\n用途地域 第一種中高層住居専用地域\n駐車場 2台可\n権利 所有権', []).record;
  const ocrHouse = R.extract('戸建\n延床面積 98.5㎡\n土地面積 120㎡ 接道 南側', []).record;
  const html = R.maisokuHtml(Object.assign({ _id: 'x' }, land));
  return { land, house, ocrHouse, html };
});
ok('「売地」の資料を土地と判定する', mk.land.type === 'land', mk.land.type);
ok('土地面積を読む', mk.land.landArea === 150.25, String(mk.land.landArea));
ok('土地では築年数・延床面積を持たない', mk.land.ageYears == null && mk.land.floorArea == null, JSON.stringify([mk.land.ageYears, mk.land.floorArea]));
ok('所在地は物件のものを読む（業者の住所は使わない）', mk.land.extra.address === '西宮市上鳴尾町13-18', mk.land.extra.address);
ok('用途地域・建ぺい率・容積率を読む', mk.land.extra.zoning === '第一種住居地域' && mk.land.extra.coverage === '60' && mk.land.extra.far === '200', JSON.stringify(mk.land.extra));
ok('路線を読む', mk.land.extra.line === '阪神本線', mk.land.extra.line);
ok('戸建の間取り・構造・規模・駐車場を読む', mk.house.type === 'house' && mk.house.extra.layout === '4LDK' && mk.house.extra.structure === '木造' && mk.house.extra.floors === '2階建' && mk.house.extra.parking === '2台可', JSON.stringify(mk.house.extra));
ok('戸建の土地面積も読む', mk.house.landArea === 120.33, String(mk.house.landArea));
ok('建物の項目がある資料は土地にしない', mk.ocrHouse.type !== 'land', mk.ocrHouse.type);
ok('マイソクに価格・所在地が載る', mk.html.indexOf('3,280') >= 0 && mk.html.indexOf('西宮市上鳴尾町13-18') >= 0 && mk.html.indexOf('7ecbee_44982cdc') >= 0, mk.html.slice(0, 80));
ok('マイソクに業者の連絡先は載らない', !/06-1234-5678|サンプル不動産|梅田/.test(mk.html), '');

console.log('\n-- マイソクに入れる範囲（写真・間取り図）を見つける');
const vc = await p.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 850;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 1200, 850);
  x.fillStyle = '#000'; x.fillRect(0, 0, 1200, 3); x.fillRect(0, 90, 1200, 3);   /* 見出し欄 */
  x.fillStyle = '#7a9'; x.fillRect(30, 120, 600, 300);                            /* 写真 */
  x.fillStyle = '#000'; for (let i = 0; i < 18; i++) x.fillRect(790, 100 + i * 40, 400, 2);  /* 右の物件概要の表 */
  x.fillRect(790, 100, 2, 700);
  const none = document.createElement('canvas'); none.width = 800; none.height = 600;
  const y = none.getContext('2d'); y.fillStyle = '#fff'; y.fillRect(0, 0, 800, 600); y.fillStyle = '#7a9'; y.fillRect(50, 50, 700, 500);
  return { crop: window.__RE.findVisualCrop(c), none: window.__RE.findVisualCrop(none) };
});
{ const m = String(vc.crop).match(/;([0-9.]+),([0-9.]+),([0-9.]+),([0-9.]+)/);
  ok('右側の物件概要の表を外し、写真の側だけにする', m && Number(m[1]) === 0 && Math.abs(Number(m[3]) - 790 / 1200) < 0.02, vc.crop);
  ok('上の見出し欄（価格・物件名）も外す', m && Number(m[2]) > 0.09 && Number(m[2]) < 0.15, vc.crop);
  ok('表が無い資料は全体を使う', vc.none === null, String(vc.none)); }

/* 横罫線の無い物件概要（右に細かい文字だけが並び、縦線1本で区切られている様式） */
const vs = await p.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 850;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 1200, 850);
  x.fillStyle = '#a01'; x.fillRect(0, 20, 1200, 14);                             /* 上の色帯 */
  x.fillStyle = '#000'; x.fillRect(150, 110, 700, 2);                             /* 物件名の下線 */
  x.fillStyle = '#a01'; x.fillRect(40, 150, 820, 50);                             /* アピール文の帯 */
  x.fillStyle = '#fff'; x.fillRect(200, 168, 400, 14);                            /* 帯の白抜き文字 */
  x.fillStyle = '#7a9'; x.fillRect(40, 230, 420, 300);                            /* 写真 */
  x.fillStyle = '#000'; x.strokeStyle = '#000'; x.lineWidth = 3;
  x.strokeRect(560, 230, 280, 520); x.fillRect(560, 480, 280, 3);                 /* 間取り図（壁は横の線とつながる） */
  x.fillRect(870, 50, 3, 790);                                                    /* 区切りの縦線 */
  for (let i = 0; i < 32; i++) for (let k = 0; k < 12 + (i % 3) * 3; k++) x.fillRect(890 + k * 16, 60 + i * 24, 5, 5); /* 右の文字だけの物件概要（1文字ずつ） */
  return window.__RE.findVisualCrop(c);
});
{ const m = String(vs).match(/;([0-9.]+),([0-9.]+),([0-9.]+),([0-9.]+)/);
  ok('縦線で区切られた物件概要（横罫線なし）を外す', m && Number(m[1]) === 0 && Math.abs(Number(m[3]) - 870 / 1200) < 0.02, String(vs));
  ok('間取り図の壁では切らない', m && Number(m[3]) > 845 / 1200, String(vs));
  ok('アピール文の帯は残し、物件名の見出しは外す', m && Number(m[2]) > 115 / 850 && Number(m[2]) < 152 / 850, String(vs)); }

/* スキャン資料で行頭の「●」が「@」と読まれた物件概要の細かい文字を、業者欄と取り違えない */
console.log('\n-- 「●」が「@」に化けた物件概要を業者欄にしない');
const atBullet = await p.evaluate(() => window.__RE.findBandTop([
  { text: '@所在地:西宮市甲子園浦風町-21曇交通:阪神本線甲子園駅徒歩4分', y: 711, h: 12, x: 46, w: 1080 },
  { text: '月顕18000円@ガス:都市ガス@給湧:ガス絵湯器@現況:空察@ペット-不可', y: 760, h: 12, x: 47, w: 1080 },
  { text: '理事会にて協議中[備考】雪防犯のため、買主様に鍵交換を推奨レしてください。', y: 774, h: 12, x: 46, w: 1080 },
  { text: '具・照明付き販売ではございません。@司法書士は売主指定になります。', y: 791, h: 12, x: 98, w: 1000 },
  { text: '(神大阪府宅地建物取引業協会正会員宅地建衛取引業免訳/国土交通大臣13箋2430旨', y: 834, h: 12, x: 110, w: 800 },
  { text: '愚星曽06-4800-4689', y: 880, h: 14, x: 426, w: 150 },
  { text: '定休日:火曜・水曜・他h-matsunami@fuji-jutaku.co.jp', y: 893, h: 12, x: 651, w: 300 },
], 952));
ok('物件概要の細かい文字（「@」入り）より下で切る', atBullet.isBand && atBullet.cutAt > 800 && atBullet.cutAt <= 834, `cutAt=${atBullet.cutAt}`);

/* 文字が読めなくても、見た目（紙の余白）から帯を探せること */
console.log('\n-- 文字が読めない帯を見た目で切る');
const px = await p.evaluate(() => {
  /* 下に色地の帯、その上に余白、さらに上に本文 という紙面を作る */
  const W = 400, H = 1000;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, W, H);
  /* 本文（0〜880px）に文字らしい黒い線を並べる */
  cx.fillStyle = '#222';
  for (let y = 40; y < 880; y += 26) cx.fillRect(20, y, W - 40, 10);
  /* 余白（880〜905px）は白のまま */
  /* 帯（905〜985px）は色地。文字は白抜きなので読み取れない想定 */
  cx.fillStyle = '#0b63b0'; cx.fillRect(10, 905, W - 20, 80);
  const cut = window.__RE.findBandByPixels(cx, W, H);

  /* 帯が無い紙面では切らないこと */
  const cv2 = document.createElement('canvas');
  cv2.width = W; cv2.height = H;
  const cx2 = cv2.getContext('2d', { willReadFrequently: true });
  cx2.fillStyle = '#fff'; cx2.fillRect(0, 0, W, H);
  cx2.fillStyle = '#222';
  for (let y = 40; y < 980; y += 26) cx2.fillRect(20, y, W - 40, 10);
  const cut2 = window.__RE.findBandByPixels(cx2, W, H);
  return { cut, cut2, H };
});
console.log(`   帯のある紙面 → 切り取り位置 ${px.cut}px（帯は905pxから・余白は880〜905px）`);
console.log(`   帯のない紙面 → ${px.cut2 === null ? '切らない' : px.cut2 + 'px'}`);
ok('帯の上の余白で切っている', px.cut !== null && px.cut > 880 && px.cut <= 905, `${px.cut}px`);
ok('本文は切っていない', px.cut === null || px.cut > 870, `${px.cut}px`);
ok('帯が無い紙面は切らない', px.cut2 === null, String(px.cut2));

/* スクリーンショットで指摘された読み取りの誤り */
console.log('\n-- 物件名：説明文やローマ数字の扱い');
const nm = await p.evaluate(() => {
  const R = window.__RE;
  return {
    sentence: R.mergeName(null, '回テラス前は通路や道路がなく.外からの、新築時売キ\n物件名\nジオ甲子園ロノーヴ', 'mansion'),
    roman: R.extract('物件種目 マンション\n物件名 カーサ楠III\n号室名 303', []).record.name,
    ocrGarbage: R.mergeName(null, '貰マンションコ拳ト\n価格 3,490万円', 'mansion'),
    textFirst: R.mergeName('西宮北口ビューハイツ', '物件名 ゴミ文字列ハイツ', 'mansion'),
    builtFallback: R.mergeName('兵庫県西宮市甲子園口5丁目6-5のマンション', '物件名 カーサ楠III', 'mansion'),
  };
});
Object.entries(nm).forEach(([k,v])=>console.log(`   ${k} → ${JSON.stringify(v)}`));
ok('説明文を物件名にせず、次の行の「物件名」を使う（ロ→口も直す）', nm.sentence === 'ジオ甲子園口ノーヴ', JSON.stringify(nm.sentence));
ok('ローマ数字入りの物件名を読める', nm.roman === 'カーサ楠III', JSON.stringify(nm.roman));
ok('文字認識の化けた行を物件名にしない', nm.ocrGarbage === null, JSON.stringify(nm.ocrGarbage));
ok('本文の物件名を文字認識より優先する', nm.textFirst === '西宮北口ビューハイツ', JSON.stringify(nm.textFirst));
ok('所在地から組み立てた名前より、文字認識のラベル付きの名前を使う', nm.builtFallback === 'カーサ楠III', JSON.stringify(nm.builtFallback));

console.log('\n-- 駅名と徒歩：交通欄を優先し、周辺施設の徒歩は使わない');
const wk = await p.evaluate(() => {
  const W = t => { const r = window.__RE.pickWalk(t); return r ? (r.station || '') + '/' + r.minutes : null; };
  return {
    cosmo: W('◎阪急武庫川駅（仮称）計画決定！\n駅予定地まで徒歩約5分！\n交通 JR神戸線 甲子園口 駅 徒歩8分\n瓦林小学校・瓦木中学校区'),
    amenity: W('交通 阪急神戸線「夙川」駅 徒歩4分\n周辺施設 スーパー徒歩3分 公園徒歩1分'),
    backtick: W('交通 JR東海道本線`西宮」駅徒歩3分'),
    mark: W('■阪神西宮駅徒歩4分 JR「西宮」駅徒歩10分'),
    amenOnly: W('周辺施設 ライフ甲子園店 約350m（徒歩5分）ファミリーマート徒歩5分'),
    noEki1: W('J R東海道本線甲子園口徒歩10分'),
    noEki2: W('国土交通大臣免許(9)第34110号\n交通\n東海道線「甲子園口」徒歩7分'),
    multi: W('交\n通 阪急夙川駅／JR さくら夙川駅／阪神香枦園駅 徒歩約7分\n各最寄駅 徒歩7分\n☆大型スーパー徒歩 3 分'),
  };
});
Object.entries(wk).forEach(([k,v])=>console.log(`   ${k} → ${v}`));
ok('交通欄の駅名と徒歩を使う（駅予定地の徒歩5分は使わない）', wk.cosmo === '甲子園口駅/8', wk.cosmo);
ok('周辺施設の徒歩分数より交通欄を優先する', wk.amenity === '夙川駅/4', wk.amenity);
ok('駅名に記号「`」が混じらない', wk.backtick === '西宮駅/3', wk.backtick);
ok('駅名に記号「■」が混じらない', wk.mark === '阪神西宮駅/4', wk.mark);
ok('周辺施設の徒歩しか無ければ空欄にする（誤った値を出さない）', wk.amenOnly === null, String(wk.amenOnly));
ok('「駅」の字が無い書き方でも駅名を取る（路線名の直後）', wk.noEki1 === '甲子園口駅/10', wk.noEki1);
ok('「国土交通大臣」を交通欄と取り違えない', wk.noEki2 === '甲子園口駅/7', wk.noEki2);
ok('複数駅の併記でも駅名を取り、スーパーの徒歩3分は使わない', /駅\/7$/.test(wk.multi||''), wk.multi);

console.log('\n-- 帯：備考欄の電話番号を帯の始まりと取り違えない');
const memo = await p.evaluate(({ PAGE_H }) => window.__RE.findBandTop([
  { y: 700, h: 14, x: 20, w: 400, text: '・採光面 南 日当たり良好' },
  { y: 740, h: 14, x: 600, w: 380, text: '備考 担当者 携帯090-7346-3079までご連絡を' },
  { y: 790, h: 14, x: 600, w: 380, text: '※諸条件ご相談ください。' },
  { y: 900, h: 20, x: 20, w: 300, text: '株式会社Presia プレシア不動産 甲子園口店' },
  { y: 902, h: 14, x: 500, w: 300, text: '宅建免許番号 兵庫県知事（1）第204713号' },
  { y: 940, h: 14, x: 20, w: 500, text: 'TEL：0798-56-7222 FAX：0798-56-7223' },
  { y: 950, h: 14, x: 800, w: 180, text: '取引態様：一般媒介 担当：仲川' },
], PAGE_H, 1000), { PAGE_H });
console.log(`   切り取り位置: ${memo.cutAt}px（備考の電話は740px・帯は900pxから）`);
ok('帯の上端（社名）から切る', memo.isBand && memo.cutAt <= 900 && memo.cutAt > 804, `${memo.cutAt}px`);

console.log('\n-- 帯：業者欄の横に物件情報の表が並ぶ配置は、業者欄だけを塗る');
const col = await p.evaluate(({ PAGE_H }) => window.__RE.findBandTop([
  { y: 860, h: 16, x: 20, w: 420, text: '商号 有限会社山祐商会' },
  { y: 862, h: 12, x: 280, w: 170, text: '宅建免許番号/大阪府知事(5)第49077号' },
  { y: 860, h: 14, x: 540, w: 420, text: '築年数 昭和63年4月 棟総戸数 9戸' },
  { y: 900, h: 14, x: 20, w: 420, text: '事務所所在地 大阪市中央区平野町2丁目3番12号' },
  { y: 900, h: 14, x: 540, w: 420, text: '現況 空室 入居 即日' },
  { y: 940, h: 14, x: 20, w: 420, text: '電話番号 06-6209-1917' },
  { y: 945, h: 14, x: 540, w: 420, text: '備考 トランクルーム有 1000円 TEL0798-36-3990' },
  { y: 960, h: 14, x: 20, w: 420, text: 'ファクシミリ 06-6209-1918' },
], PAGE_H, 1000), { PAGE_H });
console.log(`   帯: ${col.isBand}　切り取り: ${col.cutAt}px　塗る範囲: ${JSON.stringify(col.box)}`);
ok('横一直線には切らない（右の物件表を残す）', col.cutAt === PAGE_H, `${col.cutAt}px`);
ok('左の業者欄だけを塗る', col.box && col.box.x + col.box.w <= 540 && col.box.y <= 860 && col.box.y + col.box.h >= 960,
   JSON.stringify(col.box));

/* 夙川安井町パークハイムの図面で読み取れなかった書き方 */
console.log('\n-- 価格・専有面積・共有持分の書き方の違い');
const vals = await p.evaluate(() => {
  const E = t => window.__RE.extract(t, []).record;
  /* 表が「項目名の列 → 値の列」の順に記録されたPDFを、紙面順の文字で補う */
  const secs = ['中古マンション\n所在地\n構造\n専有面積\n共有持分\n兵庫県西宮市安井町\n鉄筋コンクリート造\n壁芯\n93.11 ㎡ ( 28.16 坪 )\n885800/26769000'];
  secs.alt = ['中古マンション\n所在地 兵庫県西宮市安井町\n構造 鉄筋コンクリート造\n専有面積 壁芯 93.11 ㎡ ( 28.16 坪 )\n共有持分 885800/26769000'];
  const all = window.__RE.extractAll(secs, [], { keepEmpty: true })[0].record;
  return {
    taxIn: E('中古マンション\n価格\n5,280 (税込)\n万円').priceMan,
    taxIn2: E('中古マンション\n価格 5,280（税込）万円').priceMan,
    parking: E('中古マンション\n駐車場 月額：17,000 円（税別） 保証金 2.5 万円').priceMan,
    tsubo: E('中古マンション\n専有面積 壁芯 93.11 ㎡ ( 28.16 坪 )').ownArea,
    column: [all.ownArea, all.share],
    balcony: E('中古マンション\nバルコニー 12.5㎡\n専用庭 30.2㎡').ownArea,
  };
});
Object.entries(vals).forEach(([k,v])=>console.log(`   ${k} → ${JSON.stringify(v)}`));
ok('「5,280 (税込) 万円」を読める', vals.taxIn === 5280, String(vals.taxIn));
ok('「5,280（税込）万円」を読める', vals.taxIn2 === 5280, String(vals.taxIn2));
ok('駐車場の保証金を価格にしない', vals.parking === null, String(vals.parking));
ok('「93.11㎡（28.16坪）」を専有面積として読める', vals.tsubo === 93.11, String(vals.tsubo));
ok('項目名と値が離れた表でも専有面積・共有持分を読める',
   vals.column[0] === 93.11 && vals.column[1] === '885800/26769000', JSON.stringify(vals.column));
ok('バルコニー・専用庭の面積を専有面積にしない', vals.balcony === null, String(vals.balcony));

console.log('\n-- 物件の値を含む行は塗らない');
const keep = await p.evaluate(() => ['93.11 ㎡', '5,280 万円', '885800/26769000', '徒歩1分', '3LDK',
  '株式会社コンフィアンス不動産 3LDK', 'TEL 06-6125-5801 5,280万円']
  .map(t => ({ t, got: window.__RE.isSensitiveText(t, []) })));
keep.slice(0,5).forEach(k => ok('塗らない：' + k.t, k.got === false, `判定=${k.got}`));
ok('社名が同じ行にあれば塗る：' + keep[5].t, keep[5].got === true, `判定=${keep[5].got}`);
ok('電話番号が同じ行にあれば塗る：' + keep[6].t, keep[6].got === true, `判定=${keep[6].got}`);

/* 実物の販売図面（9月分25ページ）で見つかったケース。
   紙面の余白を境目にして帯を切る判定を、余白の位置を与えて確かめる。 */
console.log('\n-- 余白を境目に帯を切る（実物の図面の配置）');
const gp = await p.evaluate(() => {
  const G = (lines, blanks, loose) => {
    const ink = y => blanks.some(([a, b]) => y >= a && y <= b) ? 0 : 0.2;
    const r = window.__RE.findBandByGaps(lines, 1000, ink, loose);
    return r ? r.cutAt : null;
  };
  /* スキャン資料：帯の「TEL」が文字認識で崩れ、社名と「宅建業者様専用」だけが読めた */
  const scanBand = [
    { y: 800, h: 12, x: 50, w: 300, text: '・西宮市役所まで約370m徒歩5分' },
    { y: 830, h: 14, x: 960, w: 200, text: '【宅建業者様専用】' },
    { y: 860, h: 14, x: 420, w: 400, text: 'T向じ1050-3]]2-8244詣屍' },
    { y: 900, h: 14, x: 110, w: 300, text: '*封住又不動産ステップ株式会社' },
  ];
  /* 余白より下が物件概要の欄（施工会社）だけのときは、ゆるめの判定でも切らない */
  const attrOnly = [
    { y: 800, h: 12, x: 50, w: 300, text: '・西宮市役所まで約370m徒歩5分' },
    { y: 860, h: 14, x: 50, w: 400, text: '施工会社：大鉄工業株式会社' },
  ];
  return {
    /* 三井住友トラスト：帯のすぐ上に周辺施設の行 */
    amenity: G([
      { y: 820, h: 12, x: 900, w: 300, text: 'コープ夙川まで520m(徒歩7分)' },
      { y: 860, h: 14, x: 900, w: 300, text: '三井住友トラスト不動産株式会社' },
      { y: 890, h: 14, x: 650, w: 200, text: 'TEL 0798-66-4866' },
    ], [[800, 806], [840, 846]]),
    /* 福屋不動産販売：帯の上に「現況：空」「引渡日：相談」 */
    shortVal: G([
      { y: 820, h: 12, x: 580, w: 100, text: '現況:空' },
      { y: 820, h: 12, x: 720, w: 100, text: '引渡日:相談' },
      { y: 870, h: 14, x: 460, w: 200, text: '取引態様【専任媒介】' },
      { y: 900, h: 14, x: 460, w: 200, text: 'FAX:0798-64-2981' },
    ], [[790, 796], [850, 856]]),
    /* 安田建物管理：帯の横に備考欄が並び、余白は備考の途中にしかない */
    besideMemo: G([
      { y: 820, h: 12, x: 600, w: 380, text: '○JACCS 保証委託料 賃料等の50%' },
      { y: 850, h: 12, x: 600, w: 380, text: '○鍵交換費用 22,000円(税込)' },
      { y: 860, h: 16, x: 20, w: 400, text: '安田建物管理㈱ TEL:0798-34-6963' },
    ], [[836, 842]]),
    scanStrict: G(scanBand, [[812, 820]]),
    scanLoose: G(scanBand, [[812, 820]], true),
    attrLoose: G(attrOnly, [[812, 820]], true),
  };
});
console.log(`   ${JSON.stringify(gp)}`);
ok('帯の上の周辺施設の行を残して切る', gp.amenity === 843, String(gp.amenity));
ok('帯の上の「現況：空」「引渡日：相談」を残して切る', gp.shortVal === 853, String(gp.shortVal));
ok('帯の横に備考欄がある配置では余白で切らない（備考の費用を残す）', gp.besideMemo === null, String(gp.besideMemo));
ok('従来の判定は目印（TEL等）が読めない帯を切らない（結果を変えない）', gp.scanStrict === null, String(gp.scanStrict));
ok('スキャン資料：TELが崩れても社名・宅建業者様専用で帯と判断して切る', gp.scanLoose === 816, String(gp.scanLoose));
ok('スキャン資料：余白の下が物件概要の会社欄だけなら切らない', gp.attrLoose === null, String(gp.attrLoose));

/* 実物の販売図面で物件名に入っていた、社名・キャッチコピー・種別名 */
console.log('\n-- 物件名：社名・キャッチコピーを名前にしない');
const nm2 = await p.evaluate(() => {
  const N = t => window.__RE.extract(t, []).record.name;
  return {
    brand: N('中古マンション\n三井のリハウス\n価格 5,480万円'),
    catch1: N('中古マンション\n周辺環境良好！阪急西宮ガーデンズにもアクセス◎'),
    catch2: N('中古マンション\n～テラスと専用庭のある1階部分の住戸です～'),
    catch3: N('中古マンション\n♦区分マンション買取強化中♦'),
    service: N('中古マンション\nハウスクリーニング'),
    generic: N('中古マンション\nマンション'),
    table: N('マンション 名称 価格 交通\n日商岩井上甲子園マンション 3,280 万円 JR東海道本線「甲子園口」駅 徒歩8分'),
    redacted: N('物件名 ［削除済み］プラウド夙川コートテラス'),
    kataRo: N('物件名 ジオ甲子園ロノーヴ'),
  };
});
Object.entries(nm2).forEach(([k,v])=>console.log(`   ${k} → ${JSON.stringify(v)}`));
ok('会社のブランド名（三井のリハウス）を名前にしない', nm2.brand === null, JSON.stringify(nm2.brand));
ok('キャッチコピー（！◎）を名前にしない', nm2.catch1 === null, JSON.stringify(nm2.catch1));
ok('キャッチコピー（～…です～）を名前にしない', nm2.catch2 === null, JSON.stringify(nm2.catch2));
ok('キャッチコピー（♦…強化中♦）を名前にしない', nm2.catch3 === null, JSON.stringify(nm2.catch3));
ok('サービス名（ハウスクリーニング）を名前にしない', nm2.service === null, JSON.stringify(nm2.service));
ok('種別そのもの（マンション）を名前にしない', nm2.generic === null, JSON.stringify(nm2.generic));
ok('見出し行の次の行の最初の欄を名前にする', nm2.table === '日商岩井上甲子園マンション', JSON.stringify(nm2.table));
ok('情報元を消した跡［削除済み］を名前に含めない', nm2.redacted === 'プラウド夙川コートテラス', JSON.stringify(nm2.redacted));
ok('「甲子園ロ」を「甲子園口」に直す', nm2.kataRo === 'ジオ甲子園口ノーヴ', JSON.stringify(nm2.kataRo));

/* 実物の販売図面で価格が読めなかった書き方 */
console.log('\n-- 価格：実物の図面の書き方');
const pr = await p.evaluate(() => {
  const R = window.__RE, P = t => R.pickPrice(t);
  /* 紙面上の文字（x, y は PDF 座標で下から上、h は字の高さ） */
  const it = (s, x, y, h, w) => ({ str: s, transform: [h, 0, 0, h, x, y], height: h, width: w });
  return {
    split: P('価格\n\n4\n480\n\n万\n\n交通'),
    ctrl: P('ダイアパレス甲子園 403 号室\n\n4\u001f290万円'),
    kanji: P('バルコニー\n9.60\nm\n\n3,880萬\n\n流通機会の極めて'),
    geoNear: R.geoPrice([it('3,780', 102, 503, 11, 54), it('万円', 193, 510, 9, 17), it('18,530円/月', 101, 252, 7, 71)]),
    geoBig: R.geoPrice([it('3,280', 434, 525, 36, 87), it('8,190円', 683, 267, 7, 24), it('管理費', 600, 267, 7, 20),
                        it('所在地', 50, 400, 7, 20), it('西宮市', 80, 400, 7, 20)]),
    geoSplit: R.geoPrice([it('5', 300, 600, 30, 16), it('480', 320, 600, 30, 50), it('万', 380, 600, 12, 12)]),
    geoFee: R.geoPrice([it('13,600', 300, 600, 30, 80), it('円', 385, 600, 12, 12), it('所在地', 50, 400, 7, 20)]),
    ocr: R.ocrLinePrice([{ text: '&リビングにエアコン付き 3.3 9 0 e', h: 60 }, { text: '西宮市熊野町8-13', h: 20 },
                         { text: '管理費 13,600 円/月', h: 20 }, { text: 'JR神戸線 甲子園口駅 徒歩8分', h: 20 }]),
    rental: R.RENTAL_RE.test('賃料 67,000 円 共益費 3,000円'),
  };
});
Object.entries(pr).forEach(([k,v])=>console.log(`   ${k} → ${JSON.stringify(v)}`));
ok('千の位が別の行に分かれた「4」「480」「万」を4,480万円と読む', pr.split === 4480, String(pr.split));
ok('カンマの位置の制御文字「4␟290万円」を読む', pr.ctrl === 4290, String(pr.ctrl));
ok('旧字の「3,880萬」を読む', pr.kanji === 3880, String(pr.kanji));
ok('紙面上で「万円」のすぐ右にある数字を結びつける', pr.geoNear === 3780, String(pr.geoNear));
ok('「万円」が画像でも、極端に大きな「3,280」を価格とする', pr.geoBig === 3280, String(pr.geoBig));
ok('別々の文字の「5」「480」を5,480として結びつける', pr.geoSplit === 5480, String(pr.geoSplit));
ok('大きくても「円」が付く数字（月額）は価格にしない', pr.geoFee === null, String(pr.geoFee));
ok('文字認識の「3.3 9 0」（大きな字）を3,390と読む', pr.ocr === 3390, String(pr.ocr));
ok('賃貸の資料を見分ける（大きな数字を価格と推測しない）', pr.rental === true, String(pr.rental));

console.log('\n-- スキャン資料（文字データの無いページ）の読み取り');
const sc = await p.evaluate(() => {
  const R = window.__RE;
  /* 実物の販売図面を文字認識した結果の形（見出し表「価格｜交通｜名称」の値が後ろに並ぶ） */
  const header = '価格\n交通\n名称\n階数\n東海道本線`西宮」駅徒歩10分\n阪急神戸線`西宮北口」駅徒歩13分\nサンクレイドル西宮北口\n4,780ヵ円\n阪神本線`西宮」駅徒歩19分\n3階\n所在';
  const ocrRes = (dense, sparse, price) => R.mergeOcrResult(
    { rawText: '', record: { priceMan: null, name: null, sourceFile: 'a.pdf' }, pageNo: 1, filled: 0 },
    { ocrText: R.normalizeOcr(dense), ocrSparse: R.normalizeOcr(sparse), ocrPrice: price }, []);
  const m1 = ocrRes('中古マンション 専有面積 65.21㎡', header, null).record;
  return {
    unit: R.normalizeOcr('4,780ヵ円 / 3,999ぅp / 5980万有'),
    headerName: m1.name, headerPrice: m1.priceMan, headerType: m1.type,
    dotName: R.pickNameOcr('物件名\n談阪神本線`甲子園」駅徒歩6分\n3,490万円\nネオ.ディ甲子園高潮\n所在'),
    decoName: R.pickNameOcr('ニジオ甲子園口ノーヴ=ニ\n華美でなく'),
    partName: R.pickNameOcr('リーンハイツ\n甲子園口グリーンハイツ\nマンション'),
    noEquip: R.pickNameOcr('名称\nテラス無\n専用庭無'),
    noShop: R.pickNameOcr('お客様のステップアップをお手伝い西宮マンションプラザ\nペット可(規約あり)\nライフ阪神鳴尾店'),
    vote1: R.voteOcrPrice([5980, 980, null]),
    vote2: R.voteOcrPrice([null, 590, 3590]),
    vote3: R.voteOcrPrice([4780, null, null]),
    txt1: R.pickPriceByText([14715, 3799], '管理費 14,715円/月\n価格 3,799 万円'),
    txt2: R.pickPriceByText([13390], 'コスモハイツ 3,390万円'),
    txt3: R.pickPriceByText([4480], '(斜体の価格は日本語の辞書では読めない)'),
    area: ocrRes('専有面積 51.30㎡ (15.5坪) 中古マンション 価格', '中古マンション 価用部分面積151.30㎡ (15.5坪)', null).record.ownArea,
    addr1: R.pickAddressOcr('@所在地ノ兵庫県西宮市上鳴尾町13-18'),
    addr2: R.pickAddressOcr('暁制西宮市荒戌町4-17'),
    addr3: R.pickAddressOcr('西宮市立鳴尾北小学校550m\n所在地西宮市荒戎町4-17'),
    guess: ocrRes('中古マンション 専有面積 75.01㎡', '中古マンション\n所在地 兵庫県西宮市上鳴尾町13-18\n3,880万円', null),
    lion: R.pickPriceByText([1165, 5480], '敷地面積:1,165㎡ (約352.41坪)'),
    walk1: R.pickWalkDict('@交通ノび阪神本線`鳴尾・武庫川女子大前」駅徒歩\n約4分豆所在地'),
    walk1n: R.pickWalkDict(R.normalizeOcr('@交通ノび阪神本線`鳴尾・武庫川女子大前」駅徒歩\n約4分豆所在地')),
    walk2: R.pickWalkDict('JR称戸w甲子園口w徒歩8分'),
    walk3: R.pickWalkDict('阪急神戸線`西宮北口」駅徒歩9分'),
    walk4: R.pickWalkDict('JR神戸ゃ甲子園口w徒歩8分'),
    walk5: R.pickWalkDict('JR神戸 線 甲子園口 駅 徒歩8分'),
    st4: R.matchStation('阪神香枦園駅'),
    st5: R.pickStationDict('@交通ノ/阪神本線`鳴尾・武庫川女子大前」駅徒歩\nG Estt 6.0帖謀約4分'),
    age3: R.extract(R.normalizeOcr('中古マンション\n築年月\n\n93戸\n(約8.1帖)\n昭和48年11月'), []).record.ageYears,
    badName: R.pickNameOcr('コスてハイツ日子索尾ッニーューマー中古マンション\nエとンンション貸マンション'),
    st1: R.matchStation('EふO夙川駅'), st2: R.matchStation('aaa護R護団駅'), st3: R.matchStation('武庫川女子大前駅'),
    garbled: ocrRes('中古マンション 専有面積 75.01㎡', '中古マンション\n交通 aaa護R護団駅徒歩1分\n3,880万円', null).record,
    age1: R.extract(R.normalizeOcr('中古マンション 笠年月昭和48年11月 専有面積80.2㎡'), []).record.ageYears,
    age2: R.extract(R.normalizeOcr('中古マンション 肇年月1 9 9 8 (平成1 0 )年3月'), []).record.ageYears,
    ymAge: ocrRes('コービ目託| w |でレーs |園國K+ 18アききA 2000年6月 中古マンション 専有面積 60.32㎡', '呼取タイプLDK十1納戸笑キ月2000年6月\n3,999万円', null).record,
    ymReform: ocrRes('◇リフォーム履歴あり\n◇2024年12月\nガス給湯器交換\n◇2021年7月\nシステムキッチン交換 中古マンション 専有面積 60.32㎡', 'ョmタイプLDK+1終戸全年月2000年6月\n、で侵クameーls画| 2024年12月約23.0帖\nレaみ2021年7月芦5\n3,999万円', null).record,
    ymTwo: ocrRes('中古マンション 専有面積 60.32㎡', '◇2000年6月 ◇1998年4月\n3,999万円', null).record.ageYears,
    cellArea: ocrRes('中古マンション\n繰財|80.2w|霜|7-1n\n※上記専有面積にはMB・物入2.56m含まれてい', '中古マンション 3,390万円', null).record.ownArea,
    blockEmpty: R.publishBlockReason({ record: { type: 'unknown', name: '', priceMan: null } }),
    blockPending: R.publishBlockReason({ ocrPending: true, record: { type: 'mansion', name: 'A', priceMan: 1000 } }),
    blockOk: R.publishBlockReason({ record: { type: 'mansion', name: 'サンクレイドル西宮北口', priceMan: 4780 } }),
  };
});
Object.entries(sc).forEach(([k,v])=>console.log(`   ${k} → ${JSON.stringify(v)}`));
ok('「万円」の化け（ヵ円・ぅp・万有）を直す', ['4,780万円', '3,999万円', '5980万円'].every(x => sc.unit.includes(x)), sc.unit);
ok('見出し表の後ろに並ぶ値から物件名を読む', sc.headerName === 'サンクレイドル西宮北口', String(sc.headerName));
ok('見出し表の価格を読む', sc.headerPrice === 4780, String(sc.headerPrice));
ok('スキャン資料の種別をマンションと判定する', sc.headerType === 'mansion', String(sc.headerType));
ok('中黒の化け「ネオ.ディ」を直して物件名にする', sc.dotName === 'ネオ・ディ甲子園高潮', String(sc.dotName));
ok('飾り記号と行頭のかけらを除いて物件名にする', sc.decoName === 'ジオ甲子園口ノーヴ', String(sc.decoName));
ok('欠けた名前より完全な名前を選ぶ', sc.partName === '甲子園口グリーンハイツ', String(sc.partName));
ok('設備欄の値（テラス無）を物件名にしない', sc.noEquip === null, String(sc.noEquip));
ok('仲介店舗名・設備・周辺施設を物件名にしない', sc.noShop === null, String(sc.noShop));
ok('先頭の桁が落ちた読み（980）より完全な読み（5,980）を採る', sc.vote1 === 5980, String(sc.vote1));
ok('桁落ちの候補があっても完全な候補を採る', sc.vote2 === 3590, String(sc.vote2));
ok('候補が1つならそれを採る', sc.vote3 === 4780, String(sc.vote3));
ok('月額費用（14,715円）より「万円」付きの価格（3,799万円）を採る', sc.txt1 === 3799, String(sc.txt1));
ok('頭に「1」が付いた読み違い（13,390）を紙面の「3,390万円」で直す', sc.txt2 === 3390, String(sc.txt2));
ok('紙面の文字で確かめられなくても数字の辞書の値を使う', sc.txt3 === 4480, String(sc.txt3));
ok('面積が食い違うときは坪数と合うほう（51.30㎡）を採る', sc.area === 51.3, String(sc.area));
ok('所在地から市区と町名を取り出す', sc.addr1 === '西宮市上鳴尾町', String(sc.addr1));
ok('前に読み違いの漢字が付いた所在地は使わない', sc.addr2 === null, String(sc.addr2));
ok('小学校名ではなく所在地を使う', sc.addr3 === '西宮市荒戎町', String(sc.addr3));
ok('物件名が読めないときは所在地から仮の名前をつけ、仮であることを記録する', sc.guess.record.name === '西宮市上鳴尾町のマンション' && sc.guess.nameGuessed === true, String(sc.guess.record.name));
ok('面積（1,165㎡）を価格にしない', sc.lion === 5480, String(sc.lion));
const nowY = new Date().getFullYear(), nowM = new Date().getMonth() + 1;
const ageOf = (y, m) => nowY - y - (nowM < m ? 1 : 0);
ok('「交通」欄の「…駅徒歩」「約4分」が2行に分かれても読む', sc.walk1n && sc.walk1n.station === '鳴尾・武庫川女子大前駅' && sc.walk1n.minutes === 4, JSON.stringify(sc.walk1n));
ok('表の枠で離れた「甲子園口 駅 徒歩8分」を読む', sc.walk2 && sc.walk2.station === '甲子園口駅' && sc.walk2.minutes === 8, JSON.stringify(sc.walk2));
ok('路線名（神戸線）を駅名と取り違えない', sc.walk3 && sc.walk3.station === '西宮北口駅', JSON.stringify(sc.walk3));
ok('路線名の読み違い（神戸ゃ）より「徒歩」に近い駅名を採る', sc.walk4 && sc.walk4.station === '甲子園口駅', JSON.stringify(sc.walk4));
ok('「JR神戸 線 甲子園口 駅 徒歩8分」を甲子園口駅にする', sc.walk5 && sc.walk5.station === '甲子園口駅', JSON.stringify(sc.walk5));
ok('分数が離れていても「交通」欄の駅名を読む', sc.st5 === '鳴尾・武庫川女子大前駅', String(sc.st5));
ok('「香枦園」の表記も香櫨園駅にそろえる', sc.st4 === '香櫨園駅', String(sc.st4));
ok('「築年月」の見出しと値が離れていても築年数を計算する', sc.age3 === ageOf(1973, 11), String(sc.age3));
ok('カタカナの間にひらがなが挟まる化けた名前は使わない', sc.badName === null, String(sc.badName));
ok('化けた駅名「EふO夙川駅」を「夙川駅」に直す', sc.st1 === '夙川駅', String(sc.st1));
ok('一覧に無い化けた駅名は駅名として使わない', sc.st2 === null, String(sc.st2));
ok('「武庫川女子大前」を正式な駅名に直す', sc.st3 === '鳴尾・武庫川女子大前駅', String(sc.st3));
ok('化けた駅名（aaa護R護団駅）はユーザー画面に載せない', sc.garbled.station == null, String(sc.garbled.station) + '/' + sc.garbled.walkMin);
ok('「築年月 昭和48年11月」から築年数を計算する（読み違いの「笠年月」も）', sc.age1 === ageOf(1973, 11), String(sc.age1));
ok('「築年月 1998（平成10）年3月」から築年数を計算する（数字が離れていても）', sc.age2 === ageOf(1998, 3), String(sc.age2));
{ const now = new Date(), exp = now.getFullYear() - 2000 - (now.getMonth() + 1 < 6 ? 1 : 0);
  ok('「築年月」の見出しが化けても、ただ1つの「2000年6月」から築年数を出す', sc.ymAge.ageYears === exp && sc.ymAge.builtLabel === '2000年6月', sc.ymAge.ageYears + ' ' + sc.ymAge.builtLabel); }
ok('リフォーム履歴の年月があっても、見出しの名残が付いた「2000年6月」を築年月にする', sc.ymReform.builtLabel === '2000年6月', String(sc.ymReform.builtLabel));
ok('見出しの無い年月が2つ以上あるときは築年数にしない', sc.ymTwo == null, String(sc.ymTwo));
ok('表の枠の中の「80.2㎡」（単位が化けて見出しも読めない）を専有面積にする', sc.cellArea === 80.2, String(sc.cellArea));
ok('種別・物件名・価格が空の物件は掲載させない', /種別/.test(sc.blockEmpty) && /物件名/.test(sc.blockEmpty) && /価格/.test(sc.blockEmpty), sc.blockEmpty);
ok("文字認識・資料画像の作成の途中は掲載させない", /途中/.test(sc.blockPending), sc.blockPending);
ok('必要な項目がそろえば掲載できる', sc.blockOk === '', JSON.stringify(sc.blockOk));

console.log(`\n=== ${pass} 成功 / ${fail} 失敗 ===`);
await b.close(); srv.close();
process.exit(fail?1:0);
