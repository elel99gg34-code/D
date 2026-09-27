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
/* 한 번에 넣을 수 있는 몫 — 혼자 두드려 끝내지 못하게 막는다 */
const HIT_CAP = 5000;
/* 모든 일은 셋 분 산다 — 그 시각에 와 있던 사람만 받는다(로블록스처럼).
   때는 서버가 잰다. 폰 시계가 틀려도 모두가 같은 셋 분을 겪는다. */
const EV_MS = +process.env.EV_MS || 3 * 60 * 1000;   /* 시험할 때만 줄인다 */
/* 하늘을 가르는 것은 다섯 분 — 이벤트 때만 서 있다가 사라진다 */
const BOSS_MS = +process.env.BOSS_MS || 5 * 60 * 1000;
/* 끝난(거둔·달아난) 적은 이만큼 뒤에 소식에서 아예 걷는다 — 보상을 받으러 올 틈만 남긴다 */
const BOSS_KEEP = 30 * 60 * 1000;
/* 때가 지난 것을 거둔다 — 읽을 때마다 한 번씩 */
function expire(now) {
  let changed = false;
  if (live.event && live.eventUntil && now > live.eventUntil) { live.event = ''; changed = true; }
  if (live.gift && live.gift.until && now > live.gift.until) { live.gift = null; changed = true; }
  const b = live.boss;
  if (b && !b.done && !b.fled) {
    /* 끝나는 때(until)가 생기기 전에 세운 적은 until 이 없어 영원히 서 있었다.
       세운 때(at)부터 BOSS_MS 가 지나면 무엇이든 거둔다 — 더 길게 적혀 있어도 줄인다 */
    const born = +b.born || +b.at || 0;
    const end = Math.min(+b.until || Infinity, born ? born + BOSS_MS : Infinity);
    if (!born && !b.until) { b.fled = true; b.end = now; changed = true; }
    else if (now > end) { b.fled = true; b.end = now; changed = true;
      console.log('달아났다:', b.n, '· 남은', b.hp); }
    else if (b.until !== end) { b.until = end; changed = true; }
  }
  /* 끝난 지 오래된 적은 소식에서 걷는다 */
  if (b && (b.done || b.fled) && now - (+b.end || +b.at || 0) > BOSS_KEEP) { live.boss = null; changed = true; }
  return changed;
}

/* 소식 한 장 — 이것이 전부다
     gift  이벤트에 온 이에게 뿌리는 것. id 가 바뀌면 새 선물이다.
     boss  모두가 함께 치는 적. hp 가 0 이 되면 끝난 것이고,
           친 사람들(who)만 보상을 받는다. */
let live = {
  notice: '', noticeAt: 0, event: '', eventAt: 0, version: 0, apk: '', at: 0,
  gift: null,          /* { id, cards:[], say, at } */
  boss: null           /* { id, n, g, hp, max, reward, done, at, hits } */
};
const WHO_KEY = 'baekgwi:boss:who';   /* 친 사람들 — 보스마다 따로 */

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

/* ══════════════════════════════════════════════════════════
   장부 — 이름을 걸어 두고, 걸어 둔 것을 찾아 준다
   ──────────────────────────────────────────────────────────
   어디에 적는가
     DATABASE_URL 이 있으면 Postgres 에 (오래 간다)
     없으면 Key Value 에 (서버가 다시 서도 남는다)
     그것도 없으면 이 기계의 기억에 (다시 서면 지워진다)

   두 벌을 두는 까닭
     게임은 제 기계에도 늘 저장한다. 장부는 그것을 옮겨 주는
     다리일 뿐이다. 그러니 장부가 비어도 아무도 제 판을 잃지
     않는다 — 다른 기계로 못 옮길 뿐이다.

   암호는 그대로 적지 않는다
     사람마다 다른 소금을 치고 scrypt 로 갈아 둔다. 장부를
     통째로 가져가도 암호는 되살릴 수 없다.
   ══════════════════════════════════════════════════════════ */
import crypto from 'crypto';

let pg = null;
async function db() {
  if (pg !== null) return pg;
  if (!process.env.DATABASE_URL) { pg = false; return false; }
  try {
    const { default: pgmod } = await import('pg');
    const p = new pgmod.Pool({ connectionString: process.env.DATABASE_URL,
                               ssl: { rejectUnauthorized: false }, max: 3 });
    await p.query(`create table if not exists souls(
      id text primary key, salt text not null, hash text not null,
      made bigint not null, save text, saved bigint default 0)`);
    await p.query(`create table if not exists tokens(
      tok text primary key, id text not null, made bigint not null)`);
    pg = p;
    console.log('장부를 Postgres 에 둔다');
  } catch (e) {
    console.error('Postgres 를 못 열었다 — 다른 곳에 적는다:', e.message);
    pg = false;
  }
  return pg;
}

/* 세 곳 가운데 있는 곳에 적는다 */
const mem = new Map();
async function put(k, v) {
  const c = await store();
  if (c) { await c.set(k, JSON.stringify(v)); return; }
  mem.set(k, JSON.stringify(v));
}
async function get(k) {
  const c = await store();
  const s = c ? await c.get(k) : mem.get(k);
  try { return s ? JSON.parse(s) : null; } catch (e) { return null; }
}

const scrypt = (pw, salt) => new Promise((ok, no) =>
  crypto.scrypt(pw, salt, 32, (e, b) => e ? no(e) : ok(b.toString('hex'))));

/* 이름은 짧고 눈에 보이는 글자만 — 헷갈리는 이름을 막는다 */
function nameOk(s) { return typeof s === 'string' && /^[a-zA-Z0-9가-힣_.-]{2,20}$/.test(s); }

async function soulGet(id) {
  const p = await db();
  if (p) { const r = await p.query('select * from souls where id=$1', [id]);
           return r.rows[0] || null; }
  return await get('u:' + id);
}
async function soulPut(s) {
  const p = await db();
  if (p) { await p.query(
    `insert into souls(id,salt,hash,made,save,saved) values($1,$2,$3,$4,$5,$6)
     on conflict(id) do update set salt=$2,hash=$3,save=$5,saved=$6`,
    [s.id, s.salt, s.hash, s.made, s.save || null, s.saved || 0]); return; }
  await put('u:' + s.id, s);
}
async function tokMake(id) {
  const tok = crypto.randomBytes(24).toString('hex');
  const p = await db();
  if (p) await p.query('insert into tokens(tok,id,made) values($1,$2,$3)', [tok, id, Date.now()]);
  else await put('t:' + tok, { id, made: Date.now() });
  return tok;
}
async function tokWho(tok) {
  if (typeof tok !== 'string' || !/^[0-9a-f]{48}$/.test(tok)) return null;
  const p = await db();
  if (p) { const r = await p.query('select id from tokens where tok=$1', [tok]);
           return r.rows[0] ? r.rows[0].id : null; }
  const t = await get('t:' + tok);
  return t ? t.id : null;
}

/* 같은 곳에서 너무 자주 두드리면 잠시 물린다 */
const knocks = new Map();
function tooMany(ip) {
  const now = Date.now(), w = knocks.get(ip) || [];
  const recent = w.filter(t => now - t < 60000);
  recent.push(now);
  knocks.set(ip, recent);
  if (knocks.size > 5000) knocks.clear();
  return recent.length > 20;
}


/* ══════════════════════════════════════════════════════════
   값 치른 것을 확인한다 — 게임이 스스로 믿지 않게
   ──────────────────────────────────────────────────────────
   예전에는 결제창에서 돌아온 주소(order_id·request_id)만 보고
   게임이 VIP·스킨을 내주었다. 주소는 누구나 손으로 적을 수 있다.
   이제 서버가 결제 회사에 직접 물어 「정말 치렀는가」를 보고,
   한 번 쓴 결제는 적어 두어 두 번 받지 못하게 한다.

   설정 (Render 의 Environment 에서)
     CREEM_API_KEY     Creem 대시보드의 API 키 (웹판 결제)
     CREEM_TEST=1      시험 결제를 확인할 때
     GOOGLE_PLAY_SA    Play 결제 — 구글 서비스 계정 JSON 한 덩어리
   설정이 없으면 확인하지 않고 「준비 중」이라고만 답한다(내주지 않는다).
   ══════════════════════════════════════════════════════════ */
const PAY_PRODUCTS = {                                  /* 결제 회사의 상품 → 게임 속 물건 */
  prod_1yYgNhC1QxUEf5YmAeqdPR: 'vip', prod_6KWjViSKaLkvPLOYjkhirx: 'skin',
  vip_package: 'vip', skin_box: 'skin'
};
const PLAY_PKG = process.env.PLAY_PACKAGE || 'kr.baekgwi.game';
/* 한 결제는 한 사람에게 한 번 — 누가 받았는지 적어 둔다 */
async function payClaim(ref, who) {
  const k = 'pay:' + ref, had = await get(k);
  if (had && had.who && who && had.who !== who) return false;
  if (!had) await put(k, { who: who || '', at: Date.now() });
  return true;
}
async function creemCheck(checkoutId) {
  const key = process.env.CREEM_API_KEY;
  if (!key) return { ok: false, code: 503, why: '결제 확인이 아직 준비되지 않았다' };
  const base = process.env.CREEM_BASE || (process.env.CREEM_TEST === '1' ? 'https://test-api.creem.io' : 'https://api.creem.io');
  const r = await fetch(base + '/v1/checkouts?checkout_id=' + encodeURIComponent(checkoutId),
                        { headers: { 'x-api-key': key } });
  if (!r.ok) return { ok: false, code: 402, why: '그런 결제를 찾지 못했다 (' + r.status + ')' };
  const c = await r.json();
  const pid = c.product && typeof c.product === 'object' ? c.product.id : c.product;
  const item = PAY_PRODUCTS[pid];
  const paid = c.status === 'completed' || (c.order && (c.order.status === 'paid' || c.order.status === 'completed'));
  if (!paid) return { ok: false, code: 402, why: '아직 값이 치러지지 않았다' };
  if (!item) return { ok: false, code: 402, why: '모르는 물건이다' };
  return { ok: true, item, qty: Math.max(1, Math.min(11, parseInt(c.units, 10) || 1)) };
}
/* 구글 — 서비스 계정으로 잠깐 쓰는 출입증을 받는다 */
let _gTok = null;
async function googleToken() {
  if (_gTok && _gTok.exp > Date.now() + 60000) return _gTok.tok;
  const sa = JSON.parse(process.env.GOOGLE_PLAY_SA);
  const now = Math.floor(Date.now() / 1000);
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const body = b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
                     aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = crypto.createSign('RSA-SHA256').update(head + '.' + body).sign(sa.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + head + '.' + body + '.' + sig });
  const j = await r.json();
  if (!j.access_token) throw new Error('구글 출입증을 못 받았다');
  _gTok = { tok: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return _gTok.tok;
}
async function playCheck(productId, token) {
  if (!process.env.GOOGLE_PLAY_SA) return { ok: false, code: 503, why: 'Play 결제 확인이 아직 준비되지 않았다' };
  const t = await googleToken();
  const u = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PLAY_PKG}` +
            `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;
  const r = await fetch(u, { headers: { authorization: 'Bearer ' + t } });
  if (!r.ok) return { ok: false, code: 402, why: '구글이 그런 결제를 모른다 (' + r.status + ')' };
  const p = await r.json();
  if (p.purchaseState !== 0) return { ok: false, code: 402, why: '값이 치러지지 않았다' };
  const item = PAY_PRODUCTS[productId];
  if (!item) return { ok: false, code: 402, why: '모르는 물건이다' };
  return { ok: true, item, qty: 1 };
}

/* 모두의 적을 치는 손은 따로 센다.
   폰은 통신사 하나 아래 수많은 사람이 IP 하나를 나눠 쓴다(학교·집
   와이파이도 그렇다). 장부처럼 IP 로 분에 스무 번만 받으면 함께 치는
   사람들이 서로를 막는다. 한 사람(who)은 한 셈 반에 한 번, 한 IP 는
   분에 육백 번까지 받는다. 한 번에 넣는 몫은 HIT_CAP 이 막는다. */
const hitWho = new Map(), hitIp = new Map();
function hitTooFast(who, ip) {
  const now = Date.now();
  if (hitWho.size > 50000) hitWho.clear();
  if (hitIp.size > 5000) hitIp.clear();
  if (who) {
    if (now - (hitWho.get(who) || 0) < 1500) return true;
    hitWho.set(who, now);
  }
  const w = (hitIp.get(ip) || []).filter(t => now - t < 60000);
  w.push(now);
  hitIp.set(ip, w);
  return w.length > 600;
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
    const now = Date.now();
    if (expire(now)) await keep();
    return send(res, 200, Object.assign({}, live, { now }));
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
    if ('event'   in q) { live.event   = str(q.event, 24);   live.eventAt  = Date.now();
                          live.eventUntil = live.event ? Date.now() + EV_MS : 0; }
    if ('version' in q) live.version = Math.max(0, Math.min(9999, parseInt(q.version, 10) || 0));
    if ('apk'     in q) live.apk = str(q.apk, 300);
    /* 선물 — 카드 이름만 받는다. 무엇이 있는 이름인지는 게임이 안다. */
    if ('gift' in q) {
      if (!q.gift) live.gift = null;
      else {
        const cards = Array.isArray(q.gift.cards)
          ? q.gift.cards.slice(0, 8).map(c => str(c, 40)).filter(Boolean) : [];
        live.gift = cards.length
          ? { id: Date.now(), cards, say: str(q.gift.say, 120), at: Date.now(),
              until: Date.now() + EV_MS }
          : null;
      }
    }
    /* 모두가 치는 적 — 새로 세우거나 거둔다 */
    if ('boss' in q) {
      if (!q.boss) live.boss = null;
      else {
        const max = Math.max(100, Math.min(100000000, parseInt(q.boss.max, 10) || 100000));
        /* 거두면 줄 몫 — 관리자가 그때마다 정한다. 게임이 아는 부적만 쓰인다 */
        const num = (v, hi) => Math.max(0, Math.min(hi, parseInt(v, 10) || 0));
        const pq = q.boss.pay && typeof q.boss.pay === 'object' ? q.boss.pay : null;
        const pay = pq ? {
          jp: num(pq.jp, 100000), gold: num(pq.gold, 1000000), dia: num(pq.dia, 100000),
          cards: Array.isArray(pq.cards) ? pq.cards.slice(0, 8).map(c => str(c, 40)).filter(Boolean) : []
        } : null;
        live.boss = {
          id: Date.now(),
          n: str(q.boss.n, 40) || '이름 없는 것',
          g: str(q.boss.g, 4) || '鬼',
          hp: max, max,
          reward: str(q.boss.reward, 120),
          pay,
          done: false, fled: false, at: Date.now(), born: Date.now(), until: Date.now() + BOSS_MS, hits: 0
        };
        const c0 = await store();
        if (c0) { try { await c0.del(WHO_KEY); } catch (e) {} } else mem.delete(WHO_KEY);
      }
    }
    live.at = Date.now();
    await keep();
    console.log('퍼뜨렸다:', JSON.stringify(live));
    return send(res, 200, { ok: true, live });
  }

  /* ── 모두가 함께 치는 적 ──────────────────────────────────
     누가 얼마나 쳤는지를 서버가 센다. 한 번에 넣을 수 있는 몫을
     막아 두어, 혼자 두드려 끝내지 못하게 한다. */
  if (url.pathname === '/hit' && req.method === 'POST') {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
               req.socket.remoteAddress || '?';
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 2000) return send(res, 413, { ok: false, why: '너무 길다' });
    }
    let q;
    try { q = JSON.parse(body); } catch (e) { return send(res, 400, { ok: false, why: '읽을 수 없다' }); }
    await store();
    const b = live.boss;
    if (!b) return send(res, 409, { ok: false, why: '칠 것이 없다' });
    if (expire(Date.now())) await keep();
    if (String(q.id || '') !== String(b.id))
      return send(res, 409, { ok: false, why: '다른 적을 치고 있었다' });

    /* 한 번에 넣는 몫은 막아 둔다.
       이미 거둔 적이면 더 넣지는 못하되 묻는 것은 받는다 —
       「내가 쳤었나」를 알아야 보상을 받으러 올 수 있다. */
    const n = (b.done || b.fled) ? 0 : Math.max(0, Math.min(HIT_CAP, parseInt(q.n, 10) || 0));
    const who = str(q.who, 64);
    /* 묻기만 하는 것(n=0)은 막지 않는다 — 보상을 받으러 오는 길이다 */
    if (n > 0 && hitTooFast(who, ip)) return send(res, 429, { ok: false, why: '너무 자주 친다' });
    if (n > 0) {
      b.hp = Math.max(0, b.hp - n);
      b.hits++;
      if (who) {
        const c = await store();
        if (c) { try { await c.sAdd(WHO_KEY, who); } catch (e) {} }
        else { const s = mem.get(WHO_KEY); const set = s ? new Set(JSON.parse(s)) : new Set();
               if (set.size < 20000) { set.add(who); mem.set(WHO_KEY, JSON.stringify([...set])); } }
      }
      if (b.hp <= 0 && !b.done) { b.done = true; b.end = Date.now();
        console.log('모두가 잡았다:', b.n, '· 친 횟수', b.hits); }
      live.at = Date.now();
      await keep();
    }
    let mine = false;
    if (who) {
      const c = await store();
      if (c) { try { mine = await c.sIsMember(WHO_KEY, who); } catch (e) {} }
      else { const s = mem.get(WHO_KEY); mine = s ? JSON.parse(s).includes(who) : false; }
    }
    return send(res, 200, { ok: true, hp: b.hp, max: b.max, done: b.done, fled: !!b.fled,
                            until: b.until, now: Date.now(), hits: b.hits, mine });
  }


  /* ── 값 치른 것 확인 ───────────────────────────────────── */
  if ((url.pathname === '/pay/creem' || url.pathname === '/pay/play') && req.method === 'POST') {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
    if (tooMany(ip)) return send(res, 429, { ok: false, why: '너무 자주 묻는다' });
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 20000) return send(res, 413, { ok: false }); }
    let q; try { q = JSON.parse(body); } catch (e) { return send(res, 400, { ok: false, why: '읽을 수 없다' }); }
    try {
      if (url.pathname === '/pay/creem') {
        const id = str(q.checkout_id, 80);
        if (!id) return send(res, 400, { ok: false, why: '결제 번호가 없다' });
        const c = await creemCheck(id);
        if (!c.ok) return send(res, c.code, c);
        if (!(await payClaim('creem:' + id, str(q.who, 64)))) return send(res, 409, { ok: false, why: '이미 다른 이가 받은 결제다' });
        return send(res, 200, { ok: true, item: c.item, qty: c.qty, ref: id });
      }
      /* Play — cordova-plugin-purchase 의 validator 약속대로 답한다 */
      const tr = q.transaction || {};
      const token = str(tr.purchaseToken, 400), pid = str(q.id || tr.productId, 80);
      if (!token || !pid) return send(res, 200, { ok: false, code: 6778001, message: '확인할 것이 없다' });
      const c = await playCheck(pid, token);
      if (!c.ok) return send(res, 200, { ok: false, code: 6778003, message: c.why });
      if (!(await payClaim('play:' + token, str(q.who || (q.additionalData && q.additionalData.applicationUsername), 64))))
        return send(res, 200, { ok: false, code: 6778003, message: '이미 다른 이가 받은 결제다' });
      return send(res, 200, { ok: true, data: { id: pid, latest_receipt: true, transaction: tr } });
    } catch (e) {
      console.error('결제 확인 오류', e.message);
      return send(res, 502, { ok: false, why: '결제 회사에 닿지 못했다' });
    }
  }

  /* ── 장부 ──────────────────────────────────────────────── */
  if (url.pathname.startsWith('/auth/') || url.pathname === '/pull') {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
               req.socket.remoteAddress || '?';
    if (tooMany(ip)) return send(res, 429, { ok: false, why: '너무 자주 두드린다 — 잠시 뒤에' });

    /* 걸어 둔 것을 찾아 온다 */
    if (url.pathname === '/pull' && req.method === 'GET') {
      const id = await tokWho(url.searchParams.get('t'));
      if (!id) return send(res, 401, { ok: false, why: '들어와 있지 않다' });
      const s = await soulGet(id);
      return send(res, 200, { ok: true, id,
        save: s && s.save ? JSON.parse(s.save) : null, at: (s && +s.saved) || 0 });
    }

    if (req.method !== 'POST') return send(res, 405, { ok: false, why: 'POST 로 묻는다' });
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 400000) return send(res, 413, { ok: false, why: '너무 길다' });
    }
    let q;
    try { q = JSON.parse(body); } catch (e) { return send(res, 400, { ok: false, why: '읽을 수 없다' }); }

    /* 이름을 새로 건다 */
    if (url.pathname === '/auth/signup') {
      const id = str(q.id, 20).trim(), pw = String(q.pw || '');
      if (!nameOk(id)) return send(res, 400, { ok: false, why: '아이디는 2~20 글자, 한글·영문·숫자·_.- 만' });
      if (pw.length < 6) return send(res, 400, { ok: false, why: '비밀번호는 6자 이상' });
      if (await soulGet(id)) return send(res, 409, { ok: false, why: '이미 있는 아이디' });
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = await scrypt(pw, salt);
      await soulPut({ id, salt, hash, made: Date.now(), save: null, saved: 0 });
      const tok = await tokMake(id);
      console.log('이름을 걸었다:', id);
      return send(res, 200, { ok: true, id, token: tok, save: null, at: 0 });
    }

    /* 걸어 둔 이름으로 들어온다 */
    if (url.pathname === '/auth/login') {
      const id = str(q.id, 20).trim(), pw = String(q.pw || '');
      const s = await soulGet(id);
      /* 이름이 없을 때도 한 번 갈아 본다 — 빠르기로 있는 이름을 알아내지 못하게 */
      const salt = (s && s.salt) || '0000';
      const hash = await scrypt(pw, salt);
      if (!s || !same(hash, s.hash)) return send(res, 403, { ok: false, why: '아이디나 비밀번호가 다르다' });
      const tok = await tokMake(id);
      return send(res, 200, { ok: true, id, token: tok,
        save: s.save ? JSON.parse(s.save) : null, at: +s.saved || 0 });
    }

    /* 걸어 둔다 */
    if (url.pathname === '/auth/push') {
      const id = await tokWho(q.token);
      if (!id) return send(res, 401, { ok: false, why: '들어와 있지 않다' });
      if (!q.save || typeof q.save !== 'object')
        return send(res, 400, { ok: false, why: '걸 것이 없다' });
      const s = await soulGet(id);
      if (!s) return send(res, 401, { ok: false, why: '없는 아이디' });
      const at = Date.now();
      s.save = JSON.stringify(q.save); s.saved = at;
      await soulPut(s);
      return send(res, 200, { ok: true, at });
    }
    return send(res, 404, { ok: false, why: '없는 자리' });
  }

  send(res, 404, { ok: false, why: '없는 자리' });
});

server.listen(PORT, () => console.log('한 하늘이 섰다 · 문 ' + PORT));
