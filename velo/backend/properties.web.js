/**
 * Wix Velo バックエンド Web モジュール
 * 配置先： バックエンド／backend/properties.web.js
 *
 * ・物件データ（Properties コレクション）の読み書きを担当します。
 * ・管理パスワードはサイトのシークレットマネージャーで保管し、ここで検証します。
 *   （HTML 埋め込み側にパスワードを置かないための構成です）
 *
 * 事前準備：
 *   1) CMS で「Properties」コレクションを作成（フィールドは docs/SETUP-ja.md 参照）
 *   2) シークレットマネージャーに以下を登録
 *        adminPassword   … 管理画面のログインパスワード（必須）
 *        adminTokenSalt  … 任意の長いランダム文字列（トークン署名用・省略可）
 *
 * ※ サイトをコピー（複製）すると、シークレットマネージャーの中身はコピーされません
 *    （Wixの仕様）。コピー先のサイトでは adminPassword を登録し直してください。
 *    adminTokenSalt が無いときは adminPassword から署名用の鍵を作るので、
 *    コピー先で登録が必要なのは adminPassword の1つだけです。
 */
import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { elevate } from 'wix-auth';
import { getSecret } from 'wix-secrets-backend';
import { createHmac } from 'crypto';

const COLLECTION = 'Properties';
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8時間

const elevatedInsert = elevate(wixData.insert);
const elevatedRemove = elevate(wixData.remove);
const elevatedQuery = elevate(wixData.query(COLLECTION).find);

/* ---------- トークン ---------- */
/* シークレットを読む。登録されていなければ null（コピーしたサイトでは空になる） */
async function secretOrNull(name) {
  try {
    const v = await getSecret(name);
    return v ? String(v) : null;
  } catch (e) {
    return null;
  }
}
const NO_PASSWORD = 'このサイトには管理パスワードが登録されていません。' +
  'サイトをコピーした場合、パスワード（シークレット）はWixの仕様でコピーされません。' +
  'Wixのダッシュボード →「開発ツール」→「シークレットマネージャー」で、' +
  '名前「adminPassword」、値に管理パスワードを登録してから、もう一度ログインしてください。';
async function salt() {
  const s = await secretOrNull('adminTokenSalt');
  if (s) return s;
  /* adminTokenSalt が無いとき（コピーしたサイトなど）は、管理パスワードから署名用の鍵を作る */
  const pw = await secretOrNull('adminPassword');
  if (!pw) throw new Error(NO_PASSWORD);
  return createHmac('sha256', 'reLp-token-key').update(pw).digest('hex');
}
function sign(payload, key) {
  return createHmac('sha256', key).update(payload).digest('hex');
}
async function issueToken() {
  const exp = String(Date.now() + TOKEN_TTL_MS);
  return `${exp}.${sign(exp, await salt())}`;
}
async function assertToken(token) {
  if (typeof token !== 'string' || token.indexOf('.') < 0) throw new Error('認証が必要です');
  const [exp, sig] = token.split('.');
  if (sign(exp, await salt()) !== sig) throw new Error('認証が無効です');
  if (Number(exp) < Date.now()) throw new Error('セッションの有効期限が切れました。再度ログインしてください');
}

/* ---------- 公開（誰でも読める） ---------- */
export const listProperties = webMethod(Permissions.Anyone, async () => {
  const res = await wixData.query(COLLECTION)
    .descending('_createdDate')
    .limit(100)
    .find();
  return res.items.map(toClient);
});

/* ---------- 管理 ---------- */
export const login = webMethod(Permissions.Anyone, async (password) => {
  const expected = await secretOrNull('adminPassword');
  if (!expected) throw new Error(NO_PASSWORD);
  if (!password || password !== expected) throw new Error('パスワードが違います');
  return { token: await issueToken() };
});

export const saveProperty = webMethod(Permissions.Anyone, async (token, record) => {
  await assertToken(token);
  const item = sanitize(record);
  let saved;
  try {
    saved = await elevatedInsert(COLLECTION, item);
  } catch (e) {
    /* Wixの内部エラーは画面に「Unable to handle the request」としか出ないため、
       原因が分かるように中身を添えて返す（サイトのモニタリングログにも残す） */
    console.error('saveProperty failed', e);
    throw new Error(saveErrorMessage(e, item));
  }
  return toClient(saved);
});

export const removeProperty = webMethod(Permissions.Anyone, async (token, id) => {
  await assertToken(token);
  await elevatedRemove(COLLECTION, id);
  return true;
});

/* 保存に失敗した理由を、管理画面に出せる日本語にする */
function saveErrorMessage(e, item) {
  const raw = String((e && (e.message || e.code)) || e || '');
  const size = JSON.stringify(item).length;
  if (/WDE0025|does not exist|存在しません/i.test(raw)) {
    return 'CMSに「Properties」コレクションがありません。CMSで「Properties」という名前のコレクションを作成してください。（' + raw.slice(0, 120) + '）';
  }
  if (/WDE0027|permission|権限/i.test(raw)) {
    return 'CMSの「Properties」コレクションに保存する権限がありません。コレクションの権限を確認してください。（' + raw.slice(0, 120) + '）';
  }
  if (/WDE0009|too large|size/i.test(raw) || size > 500000) {
    return '1件のデータが大きすぎて保存できませんでした（約' + Math.round(size / 1024) + 'KB）。（' + raw.slice(0, 120) + '）';
  }
  return '保存に失敗しました：' + raw.slice(0, 200);
}

/* ---------- 変換 ---------- */
const numOrNull = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
const strOrNull = (v) => (v === null || v === undefined || v === '' ? null : String(v).slice(0, 200));

/**
 * ④ 情報元の削除は HTML 側で実施済みですが、保存時にもサーバ側で最終確認します。
 *    （電話番号・メール・URL・法人格を含む値は保存しません）
 */
const LEAK = /(?:[0-9]{2,4}-[0-9]{2,4}-[0-9]{3,4})|@|https?:\/\/|株式会社|有限会社|㈱|㈲/;
function safeText(v) {
  const s = strOrNull(v);
  if (s && LEAK.test(s)) return null;
  return s;
}

/* 削除済み資料の本文。長文なので切り捨てず、
   万一の取りこぼしがあってもここで伏せ字にしてから保存する。 */
function safeDocument(v) {
  if (v === null || v === undefined || v === '') return null;
  return String(v)
    .replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, '［削除済み］')
    .replace(/(?:https?:\/\/|www\.)[^\s]+/g, '［削除済み］')
    .replace(/[0-9]{2,4}-[0-9]{2,4}-[0-9]{3,4}/g, '［削除済み］')
    .replace(/(?:株式会社|有限会社|㈱|㈲|合同会社)\s*[^\s、。，,\n]{0,20}/g, '［削除済み］')
    .slice(0, 20000);
}

/* 掲載してよい項目だけを通す。サーバ側でも同じ基準で再確認する。 */
const UNSAFE_VALUE = /［削除済み］|株式会社|有限会社|㈱|㈲|合同会社|[0-9]{2,4}-[0-9]{2,4}-[0-9]{3,4}|@|https?:\/\/|TEL|FAX|電話|免許|協会|担当|取引士|営業所|支店|本社/i;
function safeDetails(v) {
  let list;
  try { list = typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { return null; }
  if (!Array.isArray(list)) return null;
  const clean = list
    .filter((d) => d && typeof d.label === 'string' && typeof d.value === 'string')
    .filter((d) => d.label.length <= 20 && d.value.length <= 40)
    .filter((d) => !UNSAFE_VALUE.test(d.label) && !UNSAFE_VALUE.test(d.value))
    .slice(0, 20)
    .map((d) => ({ label: d.label, value: d.value }));
  return clean.length ? JSON.stringify(clean) : null;
}

/* 掲載用の資料画像。JPEGのデータURLだけを受け付け、それ以外は保存しない。 */
function safeSheetImage(v) {
  if (typeof v !== 'string') return null;
  if (!/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(v)) return null;
  if (v.length > 900000) return null;   /* 約660KBを超える画像は受け付けない */
  return v;
}

/* マイソク（Canvaのデザイン）に載せる項目。決まった項目だけを通し、連絡先が混じる値は保存しない。
   分譲会社・管理会社は物件の属性なので社名を残す（掲載元の業者の社名・連絡先ではない） */
const EXTRA_KEYS = ['address', 'line', 'layout', 'structure', 'floors', 'floorOn', 'roomNo', 'floorAreas',
  'landCategory', 'coverage', 'far', 'zoning', 'parking', 'status', 'rights', 'handover',
  'mgmtFee', 'repairFee', 'developer', 'manager', 'roadType', 'roadAccess', 'terrain',
  'privateRoad', 'buildCondition', 'notes', 'points', 'expiry', 'crop'];
const CONTACT = /[0-9]{2,4}[-ー－][0-9]{2,4}[-ー－][0-9]{3,4}|@|https?:\/\/|www\.|TEL|FAX|［削除済み］/i;
function safeExtra(v) {
  let x = v;
  if (typeof x === 'string') { try { x = JSON.parse(x); } catch (e) { return null; } }
  if (!x || typeof x !== 'object') return null;
  const out = {};
  EXTRA_KEYS.forEach((k) => {
    if (x[k] === null || x[k] === undefined || x[k] === '') return;
    const s = String(x[k]).slice(0, k === 'points' ? 300 : 60);
    if (CONTACT.test(s)) return;
    if (k !== 'developer' && k !== 'manager' && LEAK.test(s)) return;
    out[k] = s;
  });
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

function sanitize(r) {
  const type = r && (r.type === 'mansion' || r.type === 'land') ? r.type : 'house';
  return {
    title: safeText(r.name) || '物件情報',
    propertyType: type,
    priceMan: numOrNull(r.priceMan),
    walkMin: numOrNull(r.walkMin),
    station: safeText(r.station),
    ageYears: numOrNull(r.ageYears),
    builtLabel: safeText(r.builtLabel),
    // ※1 種別ごとの項目
    floorArea: type === 'house' ? numOrNull(r.floorArea) : null,
    landArea: type !== 'mansion' ? numOrNull(r.landArea) : null,
    extraJson: safeExtra(r.extra),
    ownArea: type === 'mansion' ? numOrNull(r.ownArea) : null,
    ownShare: type === 'mansion' ? safeText(r.share) : null,
    sourceFile: safeText(r.sourceFile),
    sourceText: safeDocument(r.sourceText),
    detailsJson: safeDetails(r.details),
    sheetImage: safeSheetImage(r.sheetImage)
  };
}

function toClient(item) {
  return {
    _id: item._id,
    name: item.title,
    type: item.propertyType,
    priceMan: item.priceMan ?? null,
    walkMin: item.walkMin ?? null,
    station: item.station ?? null,
    ageYears: item.ageYears ?? null,
    builtLabel: item.builtLabel ?? null,
    floorArea: item.floorArea ?? null,
    landArea: item.landArea ?? null,
    extra: (() => { try { return item.extraJson ? JSON.parse(item.extraJson) : null; } catch (e) { return null; } })(),
    ownArea: item.ownArea ?? null,
    share: item.ownShare ?? null,
    sourceFile: item.sourceFile ?? null,
    sourceText: item.sourceText ?? null,
    detailsJson: item.detailsJson ?? null,
    sheetImage: item.sheetImage ?? null,
    createdAt: item._createdDate
  };
}
