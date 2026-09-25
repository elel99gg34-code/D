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
      if (!nameOk(id)) return send(res, 400, { ok: false, why: '이름은 2~20 글자, 한글·영문·숫자·_.- 만' });
      if (pw.length < 6) return send(res, 400, { ok: false, why: '암호는 여섯 글자 넘게' });
      if (await soulGet(id)) return send(res, 409, { ok: false, why: '이미 있는 이름' });
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
      if (!s || !same(hash, s.hash)) return send(res, 403, { ok: false, why: '이름이나 암호가 다르다' });
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
      if (!s) return send(res, 401, { ok: false, why: '없는 이름' });
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
