/**
 * 1ページ構成用のページコード（aModule.jsw 版）
 * ※ Velo が最初から用意している backend/aModule.jsw に
 *    バックエンドのコードを貼った場合は、こちらを使ってください。
 * 配置先： Wix エディタ → トップページのコードパネル
 *
 * 必要な要素： HTML iframe（既定の ID は #html1）
 *   └ wix-embed/paste-into-wix.html の中身を貼り付けたもの
 *
 * ユーザー画面と管理画面は同じページ内で切り替わります。
 * 管理画面の操作はすべてパスワード認証を通る必要があるため、
 * このコードが公開ページにあっても、認証なしでデータは変更できません。
 */
import { listProperties, login, saveProperty, removeProperty } from 'backend/aModule.jsw';

const CH = 'reLp';
const box = () => $w('#html1');

$w.onReady(() => {
  box().onMessage(async (event) => {
    const msg = event.data;
    if (!msg || msg.channel !== CH) return;

    const reply = (body) => box().postMessage({ channel: CH, rid: msg.rid, ...body });
    const p = msg.payload || {};

    try {
      switch (msg.action) {
        case 'list':
          return reply({ ok: true, items: await listProperties() });

        case 'login': {
          // パスワードはサーバ側（シークレットマネージャー）で検証される
          const { token } = await login(p.password);
          return reply({ ok: true, token });
        }

        case 'save':
          // token が無効なら backend 側で例外になる
          return reply({ ok: true, item: await saveProperty(p.token, p.record) });

        case 'remove':
          await removeProperty(p.token, p.id);
          return reply({ ok: true });

        default:
          return reply({ ok: false, error: '不明な操作です' });
      }
    } catch (e) {
      reply({ ok: false, error: e.message || String(e) });
    }
  });
});
