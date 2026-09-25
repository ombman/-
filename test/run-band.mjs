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
].map(([t, want]) => ({ t, want, got: window.__RE.isSensitiveText(t, [], true) })));
ocrCases.forEach(c => ok((c.want ? '消す：' : '残す：') + c.t.slice(0,26),
                         c.got === c.want, `判定=${c.got}`));

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

console.log(`\n=== ${pass} 成功 / ${fail} 失敗 ===`);
await b.close(); srv.close();
process.exit(fail?1:0);
