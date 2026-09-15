/**
 * ① 管理画面（管理者用ページ）のページコード
 * 配置先： Wix エディタ → 管理用ページ（例：/admin）のコードパネル
 *
 * 必要な要素： HTML iframe（既定の ID は #html1）
 *   └ wix-embed/index.html を「?mode=admin」で表示する
 *
 * ※ Wix ページ設定で「パスワード保護」または「会員限定」にしておくと二重の保護になります。
 */
import { listProperties, login, saveProperty, removeProperty } from 'backend/properties.web';

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
        case 'login': {
          const { token } = await login(p.password);
          return reply({ ok: true, token });
        }
        case 'list':
          return reply({ ok: true, items: await listProperties() });
        case 'save':
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

  box().postMessage({ channel: CH, action: 'setMode', payload: 'admin' });
});
