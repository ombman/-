/**
 * REINS自動検索アプリ ライセンス認証サーバー（Google Apps Script）
 * ================================================================
 * Googleスプレッドシートに貼り付けて「ウェブアプリ」として公開します。
 * 手順は同じフォルダの SETUP-ja.md を参照してください。
 *
 * シート「Licenses」の列（1行目は見出し）:
 *   A: key        ライセンスキー（例 RA-7K3P-9QXM-2D8F）
 *   B: holder     利用者名（例 〇〇不動産）。アプリの画面に表示されます
 *   C: status     active ＝有効 ／ revoked ＝停止
 *   D: expires    有効期限（空欄＝無期限）
 *   E: idHash     紐づいたREINS IDの暗号化した値（最初の認証で自動記入）
 *   F: boundAt    紐づけた日時（自動記入）
 *   G: lastCheck  最後に認証した日時（自動記入）
 *   H: memo       メモ（自由記入）
 *
 * ・1つのキーは、最初に使ったREINS ID 1つにだけ紐づきます。
 *   別のREINS IDで使うと拒否します（貸し借り・コピー防止）。
 * ・REINS IDそのものは受け取りません（アプリ側で暗号化した値だけを受け取ります）。
 * ・利用者がREINS IDを変えたときは、E列とF列を消すと紐づけをやり直せます。
 */

var SHEET = 'Licenses';
var HEADERS = ['key', 'holder', 'status', 'expires', 'idHash', 'boundAt', 'lastCheck', 'memo'];

/* アプリからの問い合わせ: GET ?key=...&id=...（id は暗号化したREINS ID） */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);   // 同時に2台から来ても紐づけが二重にならないように
  try {
    return json_(checkLicense_(sheet_(), String(p.key || ''), String(p.id || ''), new Date()));
  } catch (err) {
    return json_({ ok: false, code: 'server_error', message: 'サーバーでエラーが発生しました: ' + err });
  } finally {
    lock.releaseLock();
  }
}

/* 認証の本体（テストしやすいよう、シートと日時を引数で受け取る） */
function checkLicense_(sh, key, idHash, now) {
  key = key.trim().toUpperCase();
  if (!key) return { ok: false, code: 'no_key', message: 'ライセンスキーが入力されていません。' };
  if (!/^[0-9a-f]{64}$/.test(idHash)) return { ok: false, code: 'bad_request', message: '認証の要求が正しくありません。' };

  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toUpperCase() !== key) continue;
    var r = rows[i], rowNo = i + 1;
    var holder = String(r[1] || '');
    if (String(r[2]).trim().toLowerCase() !== 'active') {
      return { ok: false, code: 'revoked', message: 'このライセンスキーは停止されています。' };
    }
    var exp = r[3] ? new Date(r[3]) : null;
    if (exp && !isNaN(exp) && now > endOfDay_(exp)) {
      return { ok: false, code: 'expired', message: 'ライセンスの有効期限（' + fmt_(exp) + '）が切れています。' };
    }
    var bound = String(r[4] || '');
    if (!bound) {
      sh.getRange(rowNo, 5, 1, 3).setValues([[idHash, now, now]]);
    } else if (bound !== idHash) {
      return { ok: false, code: 'other_id',
               message: 'このライセンスキーは別のREINS IDで使用中です。1つのキーは1つのREINS IDでのみ使えます。' };
    } else {
      sh.getRange(rowNo, 7).setValue(now);
    }
    return { ok: true, code: 'ok', holder: holder, expires: exp && !isNaN(exp) ? fmt_(exp) : '' };
  }
  return { ok: false, code: 'unknown_key', message: 'ライセンスキーが見つかりません。入力を確認してください。' };
}

/* ---------- 管理用メニュー（スプレッドシートの上部に表示） ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('ライセンス管理')
    .addItem('新しいキーを発行', 'issueKeyDialog')
    .addItem('シートを準備（初回のみ）', 'setupSheet')
    .addToUi();
}

function setupSheet() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
}

function issueKeyDialog() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('新しいキーを発行', '利用者名（例：〇〇不動産）を入力してください', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var key = issueKey_(sheet_(), res.getResponseText().trim());
  ui.alert('発行しました', 'ライセンスキー：\n' + key + '\n\nこのキーを利用者に伝えてください。', ui.ButtonSet.OK);
}

function issueKey_(sh, holder) {
  var key;
  var used = sh.getDataRange().getValues().map(function (r) { return String(r[0]); });
  do { key = newKey_(); } while (used.indexOf(key) !== -1);
  sh.appendRow([key, holder, 'active', '', '', '', '', '']);
  return key;
}

/* 紛らわしい文字（0/O, 1/I）を除いた RA-XXXX-XXXX-XXXX 形式 */
function newKey_() {
  var c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', parts = [];
  for (var p = 0; p < 3; p++) {
    var s = '';
    for (var i = 0; i < 4; i++) s += c.charAt(Math.floor(Math.random() * c.length));
    parts.push(s);
  }
  return 'RA-' + parts.join('-');
}

/* ---------- 小物 ---------- */
function sheet_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET);
  if (!sh) throw new Error('シート「' + SHEET + '」がありません。メニュー「ライセンス管理」→「シートを準備」を実行してください。');
  return sh;
}
function endOfDay_(d) { var x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function fmt_(d) { return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate(); }
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* テスト（Node.js）から読み込むため。Apps Script 上では無視されます */
if (typeof module !== 'undefined') {
  module.exports = { checkLicense_: checkLicense_, issueKey_: issueKey_, newKey_: newKey_ };
}
