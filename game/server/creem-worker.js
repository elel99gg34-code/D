/* ══════════════════════════════════════════════════════════
   값 치른 것을 확인해 주는 자리 — Cloudflare Worker
   ──────────────────────────────────────────────────────────
   왜 여기인가
     게임은 한 장짜리 HTML 이라 서버가 없다. 그런데 Creem 이
     보내 준 서명을 맞춰 보려면 API 열쇠가 있어야 하고, 그 열쇠를
     HTML 에 적으면 누구나 가져간다. 그래서 주소 하나짜리 서버를
     따로 둔다. 늘 켜 둘 기계가 필요 없고, 공짜 몫으로 넉넉하며,
     열쇠는 여기 안에만 있다.

   무엇을 하는가
     POST /verify  게임이 결제하고 돌아오면 여기에 묻는다.
                   서명이 맞고 처음 보는 주문일 때만 참이라 한다.
                   같은 주문으로 두 번 묻는 것은 KV 가 막는다.
     GET  /health  살아 있는지 본다.

   무엇이 필요한가
     비밀   CREEM_API_KEY      Creem 대시보드의 API 열쇠
     묶음   ORDERS (KV)        이미 내어 준 주문을 적어 둔다
     설정   ALLOW_ORIGIN       게임이 놓인 주소 (쉼표로 여럿)
            PROD_SKIN, PROD_VIP  Creem 물건 id
   ══════════════════════════════════════════════════════════ */

const OK = { 'content-type': 'application/json; charset=utf-8' };

function cors(env, req) {
  const list = String(env.ALLOW_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.headers.get('origin') || '';
  const allow = list.length === 0 ? '*' : (list.includes(origin) ? origin : list[0]);
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST,GET,OPTIONS',
    'access-control-max-age': '86400'
  };
}
const reply = (env, req, body, status) =>
  new Response(JSON.stringify(body), { status: status || 200, headers: { ...OK, ...cors(env, req) } });

/* Creem 이 붙여 보내는 서명 — 값들을 정해진 차례로 이어 붙이고
   API 열쇠를 끝에 더해 SHA-256 을 낸 것이다. */
async function creemSign(params, apiKey) {
  const order = ['request_id', 'checkout_id', 'order_id', 'customer_id', 'subscription_id', 'product_id'];
  const parts = [];
  for (const k of order) if (params[k]) parts.push(`${k}=${params[k]}`);
  parts.push(`salt=${apiKey}`);
  const buf = new TextEncoder().encode(parts.join('|'));
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
/* 시간이 같은지 견주기 — 글자를 하나씩 비교하다 도중에 멈추지 않는다 */
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env, req) });
    if (url.pathname === '/health') return reply(env, req, { ok: true, at: Date.now() });
    if (url.pathname !== '/verify') return reply(env, req, { ok: false, why: '없는 자리' }, 404);
    if (req.method !== 'POST') return reply(env, req, { ok: false, why: 'POST 로 묻는다' }, 405);

    if (!env.CREEM_API_KEY) return reply(env, req, { ok: false, why: '열쇠가 없다' }, 500);

    let q;
    try { q = await req.json(); } catch (e) { return reply(env, req, { ok: false, why: '읽을 수 없다' }, 400); }

    const order = String(q.order_id || '');
    const sig = String(q.signature || '');
    if (!order || !sig) return reply(env, req, { ok: false, why: '주문이나 서명이 없다' }, 400);

    /* ① 서명이 맞는가 */
    const mine = await creemSign({
      request_id: q.request_id, checkout_id: q.checkout_id, order_id: q.order_id,
      customer_id: q.customer_id, subscription_id: q.subscription_id, product_id: q.product_id
    }, env.CREEM_API_KEY);
    if (!same(mine, sig.toLowerCase())) return reply(env, req, { ok: false, why: '서명이 다르다' }, 403);

    /* ② 처음 보는 주문인가 — 같은 주문으로 두 번은 안 된다 */
    if (env.ORDERS) {
      const seen = await env.ORDERS.get('o:' + order);
      if (seen) return reply(env, req, { ok: false, why: '이미 내어 준 주문' }, 409);
    }

    /* ③ 무엇을 얼마나 — 물건 id 를 먼저 믿고, 없으면 request_id 를 본다 */
    const pid = String(q.product_id || '');
    let item = pid && pid === env.PROD_VIP ? 'vip'
             : pid && pid === env.PROD_SKIN ? 'skin' : '';
    let qty = 1;
    const parts = String(q.request_id || '').split(':');
    if (!item && (parts[0] === 'vip' || parts[0] === 'skin')) item = parts[0];
    if (parts[1]) qty = Math.max(1, Math.min(11, parseInt(parts[1], 10) || 1));
    if (item === 'vip') qty = 1;
    if (!item) return reply(env, req, { ok: false, why: '무슨 물건인지 모르겠다' }, 400);

    if (env.ORDERS) {
      await env.ORDERS.put('o:' + order, JSON.stringify({ item, qty, at: Date.now() }),
        { expirationTtl: 60 * 60 * 24 * 365 * 2 });
    }
    return reply(env, req, { ok: true, item, qty, order });
  }
};
