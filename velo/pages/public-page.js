/**
 * ① ユーザー画面（公開ページ）のページコード
 * 配置先： Wix エディタ → 一般公開ページ（例：/, /properties）のコードパネル
 *
 * 必要な要素： HTML iframe（既定の ID は #html1）
 *   └ wix-embed/index.html を「?mode=public」で表示する
 */
import { listProperties } from 'backend/properties.web';

const CH = 'reLp';
const box = () => $w('#html1');

$w.onReady(() => {
  box().onMessage(async (event) => {
    const msg = event.data;
    if (!msg || msg.channel !== CH) return;
    const reply = (body) => box().postMessage({ channel: CH, rid: msg.rid, ...body });

    if (msg.action === 'list') {
      try {
        reply({ ok: true, items: await listProperties() });
      } catch (e) {
        reply({ ok: false, error: e.message });
      }
      return;
    }
    // 公開ページでは書き込みを一切受け付けない
    reply({ ok: false, error: 'この画面では変更できません' });
  });

  // 埋め込み側にユーザー画面であることを伝える
  box().postMessage({ channel: CH, action: 'setMode', payload: 'public' });
});
