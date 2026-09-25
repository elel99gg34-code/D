/* ══════════════════════════════════════════════════════════
   한 하늘 — 모두가 같은 소식을 보는 자리
   ──────────────────────────────────────────────────────────
   하는 일은 둘뿐이다.

     GET  /live   지금 걸려 있는 것을 알려 준다 (누구나)
     POST /cast   그것을 고쳐 쓴다 (열쇠를 아는 이만)

   암호를 게임 안에 적으면 누구나 뜯어 간다. 그래서 맞춰 보는
   일은 여기서만 한다. 게임은 열쇠를 보내기만 하고, 맞는지 아는
   것은 이쪽이다.

   적어 두는 곳
     Key Value(레디스)가 있으면 거기에, 없으면 이 기계의 기억에.
     기억뿐이면 서버가 다시 설 때 소식이 지워진다 — 그때는
     관리자가 다시 걸면 된다.

   필요한 것
     비밀  CAST_CODE   퍼뜨릴 수 있는 열쇠
     설정  REDIS_URL   적어 둘 곳 (없어도 돈다)
   ══════════════════════════════════════════════════════════ */
import http from 'http';

const PORT = process.env.PORT || 10000;
const CODE = process.env.CAST_CODE || '';
const KEY = 'baekgwi:live';

/* 소식 한 장 — 이것이 전부다 */
let live = { notice: '', noticeAt: 0, event: '', eventAt: 0, version: 0, apk: '', at: 0 };

/* ── 적어 두는 곳 ───────────────────────────────────────── */
let redis = null;
async function store() {
  if (redis !== null) return redis;
  if (!process.env.REDIS_URL) { redis = false; return false; }
  try {
    const { createClient } = await import('redis');
    const c = createClient({ url: process.env.REDIS_URL });
    c.on('error', e => console.error('적어 두는 곳:', e.message));
    await c.connect();
    redis = c;
    const s = await c.get(KEY);
    if (s) { live = Object.assign(live, JSON.parse(s)); console.log('지난 소식을 되살렸다'); }
  } catch (e) {
    console.error('적어 두는 곳을 못 열었다 —  기억으로만 간다:', e.message);
    redis = false;
  }
  return redis;
}
async function keep() {
  const c = await store();
  if (c) { try { await c.set(KEY, JSON.stringify(live)); } catch (e) { console.error('적기', e.message); } }
}

/* ── 주고받기 ───────────────────────────────────────────── */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-max-age': '86400'
};
const send = (res, code, body) => {
  res.writeHead(code, Object.assign({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  }, CORS));
  res.end(JSON.stringify(body));
};
/* 글자를 하나씩 끝까지 견준다 — 도중에 멈추면 길이가 새어 나간다 */
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const str = (v, n) => String(v == null ? '' : v).slice(0, n);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (url.pathname === '/health') return send(res, 200, { ok: true, at: Date.now() });

  if (url.pathname === '/live' && req.method === 'GET') {
    await store();
    return send(res, 200, live);
  }

  if (url.pathname === '/cast' && req.method === 'POST') {
    if (!CODE) return send(res, 500, { ok: false, why: '서버에 열쇠가 없다' });
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 8000) return send(res, 413, { ok: false, why: '너무 길다' });
    }
    let q;
    try { q = JSON.parse(body); } catch (e) { return send(res, 400, { ok: false, why: '읽을 수 없다' }); }
    if (!same(String(q.code || ''), CODE)) return send(res, 403, { ok: false, why: '열쇠가 다르다' });

    await store();
    /* 보내 온 것만 고친다 — 안 보낸 것은 그대로 둔다 */
    if ('notice'  in q) { live.notice  = str(q.notice, 300); live.noticeAt = +q.noticeAt || Date.now(); }
    if ('event'   in q) { live.event   = str(q.event, 24);   live.eventAt  = +q.eventAt  || Date.now(); }
    if ('version' in q) live.version = Math.max(0, Math.min(9999, parseInt(q.version, 10) || 0));
    if ('apk'     in q) live.apk = str(q.apk, 300);
    live.at = Date.now();
    await keep();
    console.log('퍼뜨렸다:', JSON.stringify(live));
    return send(res, 200, { ok: true, live });
  }

  send(res, 404, { ok: false, why: '없는 자리' });
});

server.listen(PORT, () => console.log('한 하늘이 섰다 · 문 ' + PORT));
