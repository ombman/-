/* バックエンド（backend/properties.web.js・properties.jsw）のログインを、Wixの部品の代わりを入れて確かめる。
   サイトをコピーするとシークレットマネージャーの中身はコピーされない（Wixの仕様）。
   そのときに登録のしかたを案内すること、adminPassword だけでログイン・保存できることを確かめる。 */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const SRC = '/home/user/-/velo/backend', TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'relp-be-'));
const STUB = [
  [/^import \{ Permissions, webMethod \} from 'wix-web-module';$/m, "const Permissions={Anyone:1}; const webMethod=(p,f)=>f;"],
  [/^import wixData from 'wix-data';$/m, "const wixData={query:()=>({descending(){return this},limit(){return this},find:async()=>({items:[]})}),insert:async(c,r)=>r,remove:async()=>true};"],
  [/^import \{ elevate \} from 'wix-auth';$/m, "const elevate=f=>f;"],
  [/^import \{ getSecret \} from 'wix-secrets-backend';$/m, "const getSecret=async n=>{ if(!(n in globalThis.SECRETS)) throw new Error('Secret not found'); return globalThis.SECRETS[n]; };"],
];
const MODS = ['properties.web.js', 'properties.jsw'].map(f => {
  let s = fs.readFileSync(path.join(SRC, f), 'utf8');
  STUB.forEach(([re, rep]) => { s = s.replace(re, rep); });
  const out = path.join(TMP, f.replace(/\.(web\.js|jsw)$/, '') + (f.endsWith('jsw') ? '-jsw' : '-web') + '.mjs');
  fs.writeFileSync(out, s);
  return pathToFileURL(out).href;
});
let pass=0,fail=0; const ok=(n,c,g)=>{c?(pass++,console.log('✔',n)):(fail++,console.log('✖',n,g))};
for (const mod of MODS) {
  const M = await import(mod);
  console.log('==', mod);
  globalThis.SECRETS = {};
  let e = await M.login('abc').catch(x=>x);
  ok('コピー直後（シークレット無し）は登録方法を案内する', e instanceof Error && /adminPassword/.test(e.message) && /シークレットマネージャー/.test(e.message), e.message);
  globalThis.SECRETS = { adminPassword: 'pw-test-1' };
  e = await M.login('wrong').catch(x=>x);
  ok('パスワード違いは「パスワードが違います」', e instanceof Error && e.message==='パスワードが違います', e.message);
  const r = await M.login('pw-test-1');
  ok('adminPassword だけでログインできる', r && typeof r.token==='string', JSON.stringify(r));
  const saved = await M.saveProperty(r.token, { type:'mansion', name:'テスト', priceMan: 1000 }).catch(x=>x);
  ok('そのトークンで保存できる', !(saved instanceof Error), saved && saved.message);
  globalThis.SECRETS = { adminPassword: 'pw-test-2' };
  const bad = await M.saveProperty(r.token, { name:'x' }).catch(x=>x);
  ok('パスワードを変えると古いトークンは無効', bad instanceof Error, String(bad));
  globalThis.SECRETS = { adminPassword: 'pw-test-1', adminTokenSalt: 'salt-xyz' };
  const r2 = await M.login('pw-test-1');
  const s2 = await M.saveProperty(r2.token, { type:'house', name:'テスト2', priceMan: 2000 }).catch(x=>x);
  ok('adminTokenSalt がある従来の設定でもログイン・保存できる', !(s2 instanceof Error), s2 && s2.message);
  const land = await M.saveProperty(r2.token, { type: 'land', name: '土地テスト', priceMan: 3000, landArea: 120.5, floorArea: 99,
    extra: { address: '西宮市甲子園町1-1', zoning: '第一種住居地域', notes: 'お問合せ 06-1234-5678', developer: '株式会社サンプル', evil: 'x' } });
  ok('土地は土地のまま保存し、土地面積を残す（延床面積は持たない）', land.type === 'land' && land.landArea === 120.5 && land.floorArea === null, JSON.stringify(land).slice(0, 120));
  ok('マイソクの項目を保存する', land.extra && land.extra.address === '西宮市甲子園町1-1' && land.extra.zoning === '第一種住居地域', JSON.stringify(land.extra));
  ok('電話番号が混じる項目と、決まっていない項目は保存しない', land.extra && !('notes' in land.extra) && !('evil' in land.extra), JSON.stringify(land.extra));
  ok('分譲会社は物件の属性なので社名を残す', land.extra && land.extra.developer === '株式会社サンプル', JSON.stringify(land.extra));
  const forged = await M.saveProperty(String(Date.now()+99999)+'.deadbeef', {}).catch(x=>x);
  ok('偽のトークンは拒否', forged instanceof Error, String(forged));
}
console.log(`=== ${pass} 成功 / ${fail} 失敗 ===`); process.exit(fail?1:0);
