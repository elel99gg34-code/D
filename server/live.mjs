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
  if (live.rain && live.rain.until && now > live.rain.until) { live.rain = null; changed = true; }
  if (live.gift && live.gift.until && now > live.gift.until) { live.gift = null; changed = true; }
  if (live.music && live.music.until && now > live.music.until) { live.music = null; changed = true; }
  /* 숨은 부적 — 때가 지나고 한 분 뒤 걷는다 */
  if (live.hunt && now > live.hunt.until + 60000) { live.hunt = null; changed = true; }
  /* 투표 — 때가 되면 마감하고, 열 분 뒤 걷는다(결과를 볼 틈) */
  if (live.poll && !live.poll.done && now > live.poll.until) { pollFinish(now); changed = true; }
  if (live.poll && live.poll.done && now - live.poll.until > 10 * 60 * 1000) { live.poll = null; changed = true; }
  const b = live.boss;
  if (b && !b.done && !b.fled) {
    /* 끝나는 때(until)가 생기기 전에 세운 적은 until 이 없어 영원히 서 있었다.
       세운 때(at)부터 BOSS_MS 가 지나면 무엇이든 거둔다 — 더 길게 적혀 있어도 줄인다 */
    const born = +b.born || +b.at || 0;
    const end = Math.min(+b.until || Infinity, born ? born + BOSS_MS + (+b.ext || 0) : Infinity);
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
  boss: null,          /* { id, n, g, hp, max, reward, done, at, hits } */
  sched: []            /* 예약 { id, at, label, patch, done } */
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


/* ══════════════════════════════════════════════════════════
   뒷받침(백업) — 무료 서버가 지워져도 장부는 살아남게
   ──────────────────────────────────────────────────────────
   Key Value(무료)는 디스크에 적지 않는다 — 다시 서면 비어 버린다.
   Postgres(무료)는 한 달 뒤 사라진다. 그래서 장부 전체를 잠가(AES-256-GCM)
   /backup 으로 내어 주고, GitHub 이 주기적으로 받아 릴리스 「backup」에 걸어 둔다.
   서버가 빈 채로 서면(계정이 하나도 없으면) BACKUP_FROM 에서 받아 되살린다.
     BACKUP_PASS   잠그는 열쇠 — 이것 없이는 아무도 풀 수 없다(잃으면 되살릴 수 없다)
     BACKUP_FROM   되살릴 때 받아 올 곳 (릴리스의 latest.bin)
   ══════════════════════════════════════════════════════════ */
function bkKey() { return crypto.scryptSync(process.env.BACKUP_PASS, 'baekgwi-backup-v1', 32); }
function bkSeal(obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', bkKey(), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([Buffer.from('BGB1'), iv, c.getAuthTag(), ct]).toString('base64');
}
function bkOpen(b64) {
  const buf = Buffer.from(String(b64).trim(), 'base64');
  if (buf.slice(0, 4).toString() !== 'BGB1') throw new Error('뒷받침 모양이 아니다');
  const iv = buf.slice(4, 16), tag = buf.slice(16, 32), ct = buf.slice(32);
  const d = crypto.createDecipheriv('aes-256-gcm', bkKey(), iv); d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
}
/* 적어 둔 것을 모두 모은다 — 계정(u:) · 들어와 있는 표(t:) · 결제(pay:) · 소식 */
async function bkCollect() {
  const out = { v: 1, at: Date.now(), live, kv: {}, pg: null };
  const c = await store();
  if (c) {
    for (const pat of ['u:*', 't:*', 'pay:*', 'g:*', 'mp:*', 'mptop']) {
      for await (const k of c.scanIterator({ MATCH: pat, COUNT: 500 })) {
        const keys = Array.isArray(k) ? k : [k];
        for (const kk of keys) { const v = await c.get(kk); if (v != null) out.kv[kk] = v; }
      }
    }
  } else for (const [k, v] of mem) if (/^(u|t|pay|g|mp):|^mptop$/.test(k)) out.kv[k] = v;
  const p = await db();
  if (p) out.pg = { souls: (await p.query('select * from souls')).rows, tokens: (await p.query('select * from tokens')).rows };
  return out;
}
async function bkCount() {
  const c = await store();
  if (c) { for await (const k of c.scanIterator({ MATCH: 'u:*', COUNT: 100 })) return (Array.isArray(k) ? k.length : 1); return 0; }
  let n = 0; for (const k of mem.keys()) if (k.startsWith('u:')) n++;
  const p = await db();
  if (p) n += +(await p.query('select count(*) n from souls')).rows[0].n;
  return n;
}
/* 빈 채로 섰으면 되살린다 — 계정이 하나라도 있으면 건드리지 않는다 */
async function bkRestore() {
  if (!process.env.BACKUP_PASS || !process.env.BACKUP_FROM) return;
  try {
    if (await bkCount() > 0) return;
    const r = await fetch(process.env.BACKUP_FROM, { redirect: 'follow' });
    if (!r.ok) { console.log('되살릴 뒷받침이 없다 (' + r.status + ')'); return; }
    const d = bkOpen(await r.text());
    const c = await store();
    let n = 0;
    for (const [k, v] of Object.entries(d.kv || {})) { if (c) await c.set(k, v); else mem.set(k, v); n++; }
    const p = await db();
    if (p && d.pg) {
      for (const x of d.pg.souls || []) await p.query(`insert into souls(id,salt,hash,made,save,saved) values($1,$2,$3,$4,$5,$6)
        on conflict(id) do nothing`, [x.id, x.salt, x.hash, x.made, x.save, x.saved]);
      for (const x of d.pg.tokens || []) await p.query(`insert into tokens(tok,id,made) values($1,$2,$3) on conflict(tok) do nothing`, [x.tok, x.id, x.made]);
    }
    /* 예약·보스 같은 소식도 — 지금 소식이 비어 있을 때만 */
    if (d.live && !live.at) { live = Object.assign(live, d.live); await keep(); }
    console.log(`뒷받침에서 되살렸다 — ${n}개 · ${new Date(d.at).toISOString()} 의 것`);
  } catch (e) { console.error('되살리지 못했다:', e.message); }
}
setTimeout(() => { bkRestore(); }, 1500);
/* 서버는 그대로인데 Key Value 만 다시 서 비는 일도 있다 — 열 분마다 살핀다 */
setInterval(() => { bkRestore(); }, 10 * 60 * 1000);

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

/* ── 퍼뜨린다 — 관리자가 누른 것도, 예약한 것이 때가 된 것도 이 길로 ── */
const CAST_KEYS = ['notice', 'noticeAt', 'event', 'eventAt', 'version', 'apk', 'gift', 'boss', 'music', 'bossExtend', 'hunt', 'poll', 'pollClose'];
const BOSS_EXT_MAX = 30 * 60 * 1000;      /* 모두의 적은 모두 합쳐 서른 분까지 늘린다 */
const num = (v, hi) => Math.max(0, Math.min(hi, parseInt(v, 10) || 0));
function pickCast(q) { const o = {}; for (const k of CAST_KEYS) if (k in q) o[k] = q[k]; return o; }
async function applyCast(q) {
  /* 보내 온 것만 고친다 — 안 보낸 것은 그대로 둔다.
     관리자의 말에는 이름을 달지 않는다(게임이 「백야」로 보인다) — 게스트의 말만 noticeBy 가 붙는다 */
  if ('notice'  in q) { live.notice  = str(q.notice, 300); live.noticeAt = +q.noticeAt || Date.now(); live.noticeBy = ''; }
  /* 일은 두 자리 — 슈팅 스타·혼돈·풍년은 한 자리를 나눠 쓰고(한 번에 하나),
     카드 대전은 제 자리가 따로 있어 그 셋 가운데 하나와 함께 걸릴 수 있다.
     빈 이름('')은 둘 다 끈다. */
  if ('event' in q) {
    const e = str(q.event, 24);
    if (e === 'rain') live.rain = { at: Date.now(), until: Date.now() + EV_MS };
    else if (e === 'rainoff') live.rain = null;
    else {
      live.event = e; live.eventAt = Date.now(); live.eventUntil = e ? Date.now() + EV_MS : 0;
      if (!e) live.rain = null;
    }
  }
  if ('version' in q) live.version = Math.max(0, Math.min(9999, parseInt(q.version, 10) || 0));
  if ('apk'     in q) live.apk = str(q.apk, 300);
  /* 선물 — 카드 이름과 재화(골드·다이아·정진). 무엇이 있는 이름인지는 게임이 안다. */
  if ('gift' in q) {
    if (!q.gift) live.gift = null;
    else {
      const cards = Array.isArray(q.gift.cards)
        ? q.gift.cards.slice(0, 8).map(c => str(c, 40)).filter(Boolean) : [];
      const gold = num(q.gift.gold, 1000000), dia = num(q.gift.dia, 100000), jp = num(q.gift.jp, 100000);
      live.gift = cards.length || gold || dia || jp
        ? { id: Date.now(), cards, gold, dia, jp, say: str(q.gift.say, 120), at: Date.now(),
            until: Date.now() + EV_MS }
        : null;
    }
  }
  /* 노래 — 모든 앱에서 같은 곡이 나온다. 정한 분이 지나면 저절로 멎는다 */
  if ('music' in q) {
    if (!q.music || !q.music.k) live.music = null;
    else { const min = Math.max(1, Math.min(120, parseInt(q.music.min, 10) || 10));
           live.music = { k: str(q.music.k, 12), at: Date.now(), until: Date.now() + min * 60000 }; }
  }
  /* 숨은 부적 찾기 — 모든 앱의 지도 어딘가에 희미한 부적이 숨는다. 먼저 찾은 max 명만 받는다 */
  if ('hunt' in q) {
    if (!q.hunt) live.hunt = null;
    else {
      const h = q.hunt, now = Date.now();
      const max = Math.max(1, Math.min(100, parseInt(h.max, 10) || 10)), min = Math.max(1, Math.min(30, parseInt(h.min, 10) || 3));
      const cards = Array.isArray(h.cards) ? h.cards.slice(0, 4).map(c => str(c, 40)).filter(Boolean) : [];
      live.hunt = { id: now, at: now, until: now + min * 60000, max, found: 0, who: [],
                    pay: { gold: num(h.gold, 1000000), dia: num(h.dia, 100000), jp: num(h.jp, 100000), cards } };
    }
  }
  /* 투표 · 퀴즈 — 객관식. 투표만 해도 받거나(vote), 맞혀야 받는다(quiz). 정답은 마감 전까지 숨긴다 */
  if ('poll' in q) {
    if (!q.poll) { live.poll = null; pollSec = null; await pollSave(); }
    else {
      const pq = q.poll, now = Date.now();
      const opts = (Array.isArray(pq.opts) ? pq.opts : []).map(o => str(o, 60).trim()).filter(Boolean).slice(0, 5);
      if (opts.length >= 2 && str(pq.q, 200).trim()) {
        const mode = pq.mode === 'quiz' ? 'quiz' : 'vote';
        const min = Math.max(1, Math.min(30, parseInt(pq.min, 10) || 3));
        live.poll = { id: now, q: str(pq.q, 200).trim(), opts, mode, at: now, until: now + min * 60000, done: false, n: 0,
                      counts: null, answer: null, pay: { gold: num(pq.gold, 1000000), dia: num(pq.dia, 100000), jp: num(pq.jp, 100000) } };
        pollSec = { id: now, answer: mode === 'quiz' ? Math.max(0, Math.min(opts.length - 1, parseInt(pq.answer, 10) || 0)) : null, votes: {}, claimed: {} };
        await pollSave();
      }
    }
  }
  if (q.pollClose && live.poll && !live.poll.done) pollFinish(Date.now());
  /* 모두의 적의 때를 늘린다 — 서 있는 동안만 */
  if ('bossExtend' in q && live.boss && !live.boss.done && !live.boss.fled) {
    const b = live.boss, add = Math.max(1, Math.min(30, parseInt(q.bossExtend, 10) || 0)) * 60000;
    const room = Math.max(0, BOSS_EXT_MAX - (+b.ext || 0)), n = Math.min(add, room);
    if (n > 0) { b.ext = (+b.ext || 0) + n; b.until = (+b.until || Date.now()) + n; console.log('모두의 적 연장', n / 60000, '분'); }
  }
  /* 모두가 치는 적 — 새로 세우거나 거둔다 */
  if ('boss' in q) {
    if (!q.boss) live.boss = null;
    else {
      const max = Math.max(100, Math.min(100000000, parseInt(q.boss.max, 10) || 100000));
      /* 거두면 줄 몫 — 관리자가 그때마다 정한다. 게임이 아는 부적만 쓰인다 */
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
}

/* 투표의 속 — 누가 무엇을 골랐는지·정답. 소식(/live)에는 싣지 않는다 */
const POLL_KEY = 'baekgwi:poll';
let pollSec = undefined;
async function pollLoad() { if (pollSec === undefined) pollSec = (await get(POLL_KEY)) || null; return pollSec; }
async function pollSave() { await put(POLL_KEY, pollSec || null).catch(() => {}); }
/* 마감 — 몇 명이 무엇을 골랐는지와(퀴즈면) 정답을 연다 */
function pollFinish(now) {
  const p = live.poll; if (!p || p.done) return;
  const counts = p.opts.map(() => 0);
  if (pollSec && pollSec.id === p.id) for (const k in pollSec.votes) { const c = pollSec.votes[k]; if (counts[c] != null) counts[c]++; }
  p.done = true; p.until = Math.min(p.until, now); p.counts = counts;
  if (p.mode === 'quiz' && pollSec && pollSec.id === p.id) p.answer = pollSec.answer;
  console.log('투표 마감:', p.q, JSON.stringify(counts));
}

/* ── 예약 ─────────────────────────────────────────────────
   정한 때가 되면 퍼뜨린다. 서버가 잠들어 있었으면(무료 서버는 아무도 없으면
   잔다) 누군가 들어와 깨울 때 한다 — 다만 때를 15분 넘겼으면 건너뛴다
   (그때 없던 이들에게 뒤늦게 이벤트가 쏟아지지 않게). */
const SCHED_LATE = 15 * 60 * 1000, SCHED_MAX_AHEAD = 60 * 24 * 3600 * 1000;
let _schedBusy = false;
async function runSchedule(now) {
  if (_schedBusy || !live.sched || !live.sched.length) return false;
  _schedBusy = true;
  let changed = false;
  try {
    for (const x of live.sched) {
      if (x.done || now < x.at) continue;
      const steps = x.steps || [{ after: 0, patch: x.patch || {} }];
      /* 한 장면도 못 했는데 15분을 넘겼다 — 통째로 건너뛴다 */
      if (!steps.some(t => t.done) && now - x.at > SCHED_LATE) {
        x.done = x.missed = true; changed = true; console.log('예약을 놓쳤다:', x.label); continue;
      }
      for (const t of steps) {
        if (t.done || now < x.at + t.after * 1000) continue;
        t.done = true; changed = true;
        /* 때가 된 말은 지금 시각으로 — 폰이 새 말로 알아보게 */
        const patch = Object.assign({}, t.patch);
        if ('notice' in patch) patch.noticeAt = now;
        await applyCast(patch);
        console.log('예약 장면:', x.label, '·', t.label || Object.keys(patch).join(','));
      }
      if (steps.every(t => t.done)) { x.done = true; changed = true; }
    }
    /* 끝난 예약은 하루 뒤 걷는다 */
    live.sched = live.sched.filter(x => !x.done || now - x.at < 24 * 3600 * 1000);
    if (changed) { live.at = now; await keep(); }
  } finally { _schedBusy = false; }
  return changed;
}
setInterval(() => { store().then(() => runSchedule(Date.now())).catch(() => {}); }, 2000);

/* ══════════════════════════════════════════════════════════
   게스트 — 관리자가 허락한 손님
   ──────────────────────────────────────────────────────────
   게스트 코드를 적은 사람이 이름을 달아 청하고, 관리자가 허락하면
   게스트가 된다. 게스트는
     · 말을 퍼뜨린다 — 앱 윗면에 제 이름으로 뜬다 (30초에 한 번)
     · 혼돈만 퍼뜨린다 — 다른 일이 걸려 있지 않을 때, 10분에 한 번
     · 부적을 뿌린다 — 관리자가 따로 허락했고, 이벤트가 걸려 있을 때만,
       이벤트 하나에 한 번 (3장까지)
   게스트의 열쇠(sec)는 그 기계가 만들어 쥐고, 서버는 지문만 둔다.
   ══════════════════════════════════════════════════════════ */
const GUEST_KEY = 'g:list';
const GUEST_SAY_MS = 30 * 1000, GUEST_CHAOS_MS = 10 * 60 * 1000;
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
async function guestsGet() { return (await get(GUEST_KEY)) || {}; }
/* 초대 — 관리자가 아이디를 골라 먼저 청한다. 받은 사람이 수락하면 곧바로 게스트다 (이레 동안 유효) */
const INV_KEY = 'g:inv', INV_MS = 7 * 24 * 3600 * 1000;
async function invGet() { const v = (await get(INV_KEY)) || {}; const now = Date.now();
  for (const k in v) if (now - (+v[k].at || 0) > INV_MS) delete v[k]; return v; }
async function guestsPut(g) { await put(GUEST_KEY, g); }
/* 관리자에게 보이는 모양 — 열쇠의 지문은 빼고 */
const guestView = g => Object.values(g).sort((a, b) => (a.state === 'ask' ? 0 : 1) - (b.state === 'ask' ? 0 : 1) || b.at - a.at)
  .map(x => ({ id: x.id, name: x.name, state: x.state, gift: !!x.gift, at: x.at, says: x.says || 0 }));
/* 백야·관리자를 사칭하는 이름은 받지 않는다 */
const guestNameOk = n => nameOk(n) && !/백야|관리자|운영|개발자|admin|gm/i.test(n);
function evActive(now) { return !!(live.event && (!live.eventUntil || now <= live.eventUntil)); }
function rainActive(now) { return !!(live.rain && now <= (+live.rain.until || 0)); }
/* 게스트가 뿌리는 선물은 이벤트 하나에 한 번 — 어느 이벤트인지 */
const evMark = now => evActive(now) ? live.eventAt : rainActive(now) ? 'r' + live.rain.at : 0;

/* ══════════════════════════════════════════════════════════
   지금 켜 둔 사람 — 소식을 물으러 올 때마다 누구(w)·어디(s)를 적는다
   ──────────────────────────────────────────────────────────
   앱은 열두 셈마다(보스가 서 있으면 다섯 셈마다) 소식을 묻는다. 배경에
   내려간 창은 브라우저가 박자를 늦추므로 90초 안에 한 번이라도 물은
   사람을 「지금 있다」로 센다. 기억에만 둔다 — 다시 서면 새로 센다.
   ══════════════════════════════════════════════════════════ */
const bootAt = Date.now();                /* 이 서버가 선 때 — 셈은 여기서부터다 */
const SEEN_MS = 90 * 1000;
const seen = new Map();                   /* who → { at, s, ip } */
let seenPeak = 0, seenPeakAt = 0, seenDay = '', seenToday = new Set();
const kstDay = t => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
function seenMark(who, scene, now) {
  if (!/^[\w-]{4,64}$/.test(who || '')) return;
  if (seen.size > 20000) for (const [k, v] of seen) if (now - v.at > SEEN_MS) seen.delete(k);
  seen.set(who, { at: now, s: /^[a-z]{2,12}$/.test(scene || '') ? scene : '?' });
  const d = kstDay(now);
  if (d !== seenDay) { seenDay = d; seenToday = new Set(); }
  if (seenToday.size < 100000) seenToday.add(who);
  const n = seenCount(now).n;
  if (n > seenPeak) { seenPeak = n; seenPeakAt = now; }
}
function seenCount(now) {
  const by = {}; let n = 0;
  for (const v of seen.values()) if (now - v.at <= SEEN_MS) { n++; by[v.s] = (by[v.s] || 0) + 1; }
  return { n, by };
}

/* ══════════════════════════════════════════════════════════
   채팅 — 로그인한 사람끼리 한 마당에서
   ──────────────────────────────────────────────────────────
   이름은 서버가 표(token)로 알아본 아이디 — 남의 이름으로 말할 수 없다.
   관리자 열쇠를 함께 보내면 「백야」로, 허락받은 게스트면 게스트 이름으로.
   최근 150마디만 둔다. 한 사람은 2.5초에 한 마디, 120자까지.
   관리자는 한 마디를 지우거나, 한 사람의 입을 잠시 막거나, 통째로 비운다.
   ══════════════════════════════════════════════════════════ */
const CHAT_KEY = 'baekgwi:chat', CHAT_KEEP = 150, CHAT_GAP = 2500, CHAT_LEN = 120;
let chat = null;                          /* { log:[{id,n,t,at,k,u}], mute:{u:until} } */
const chatLast = new Map();
async function chatLoad() {
  if (chat) return chat;
  chat = (await get(CHAT_KEY)) || { log: [], mute: {} };
  if (!Array.isArray(chat.log)) chat.log = [];
  if (!chat.mute || typeof chat.mute !== 'object') chat.mute = {};
  return chat;
}
const chatSave = () => put(CHAT_KEY, chat).catch(() => {});
/* 거친 말은 가린다 — 가볍게만 */
const CHAT_BAD = /(씨\s*발|시\s*발|ㅅ\s*ㅂ|ㅆ\s*ㅂ|병\s*신|ㅂ\s*ㅅ|좆|존\s*나|개\s*새|지\s*랄|fuck|shit|bitch)/gi;
const chatClean = s => String(s || '').replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, ' ')
  .replace(/\s+/g, ' ').trim().slice(0, CHAT_LEN).replace(CHAT_BAD, m => '*'.repeat(m.replace(/\s/g, '').length));
const chatView = x => ({ id: x.id, n: x.n, t: x.t, at: x.at, k: x.k || '' });
const chatLastId = () => (chat && chat.log.length ? chat.log[chat.log.length - 1].id : 0);
/* 채팅은 셋 분만 남는다 — 한 마디는 말한 지 셋 분이 지나면 사라진다 */
const CHAT_LIFE = 3 * 60 * 1000;
function chatPrune(now) { if (chat && chat.log.length && now - chat.log[0].at > CHAT_LIFE) chat.log = chat.log.filter(x => now - x.at <= CHAT_LIFE); }

/* ══════════════════════════════════════════════════════════
   멀티플레이 — 1대1 · 2대2
   ──────────────────────────────────────────────────────────
   싸움은 저마다의 앱이 진짜 부적 엔진으로 한다. 제 차례가 끝나면
   그 결과(모두의 체력·방어도·상태)를 여기 적고, 여기서 다음 사람에게
   차례를 넘긴다. 서버는 판(누구 차례인지·누가 이겼는지)과 점수·토큰을 쥔다.
     랜덤 매치   점수가 비슷한 사람끼리 (기다릴수록 폭이 넓어진다)
     방 코드     친구끼리 1대1 · 2대2 (점수에는 들지 않는다)
     파티        2대2 방에서 둘이 한 편이 되어 랜덤 매치에 나선다
     초대        아이디로 부르면 그 사람 앱에 창이 뜬다
   점수(RP) → 랭크: 브론즈 · 실버 · 에메랄드 · 마스터 · 인피니티 랭커
   멀티 토큰은 서버에만 있다 — 교환소에서 골드·다이아·정진·특수 부적으로 바꾼다.
   ══════════════════════════════════════════════════════════ */
const MP_TURN_MS = 60 * 1000;               /* 한 차례 — 넘기면 저절로 넘어간다 */
const MP_GONE_MS = 90 * 1000;               /* 이만큼 묻지 않으면 나간 것으로 본다 */
const MP_HP = { '1v1': 90, '2v2': 70 };
const MP_TIERS = [
  { k: 'bronze', n: '브론즈', min: 0 }, { k: 'silver', n: '실버', min: 300 }, { k: 'emerald', n: '에메랄드', min: 700 },
  { k: 'master', n: '마스터', min: 1200 }, { k: 'infinity', n: '인피니티 랭커', min: 1800 }
];
const mpTier = rp => { let t = MP_TIERS[0]; for (const x of MP_TIERS) if (rp >= x.min) t = x; return t.k; };
/* 교환소 — 토큰 값. 받는 것은 게임이 준다(서버는 토큰만 깎는다) */
const MP_SHOP = { gold: 10, dia: 20, jp: 15, bigbox: 60, card_duel: 120, card_twin: 120, card_crown: 160, card_mirror: 160 };
const MP_BOT_DAY = 10;                      /* 그림자와의 연습 — 하루 열 번까지만 토큰 */
const mpBlank = () => ({ rp: 0, w: 0, l: 0, fw: 0, fl: 0, tok: 0, streak: 0, best: 0, day: '', botN: 0 });
async function mpProf(id) { return Object.assign(mpBlank(), (await get('mp:' + id)) || {}); }
async function mpPut(id, p) { await put('mp:' + id, p); }
/* 순위표 — 점수가 바뀔 때마다 고쳐 둔다 (백 명까지) */
async function mpTopSet(id, p) {
  const top = (await get('mptop')) || [];
  const i = top.findIndex(x => x.id === id);
  const row = { id, rp: p.rp, w: p.w, l: p.l, tier: mpTier(p.rp) };
  if (i >= 0) top[i] = row; else top.push(row);
  top.sort((a, b) => b.rp - a.rp);
  await put('mptop', top.slice(0, 100));
}
const mpQueue = [];                         /* { acct, name, mode, rp, deck, ver, at, party:[{acct,name,rp,deck}] } */
const mpMatches = new Map(), mpOf = new Map();   /* 판 · 누가 어느 판에 */
const mpRooms = new Map(), mpRoomOf = new Map(); /* 방 · 누가 어느 방에 */
const mpInv = new Map();                    /* 초대 — 받는 이 → [{ from, code, mode, at }] */
const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const mpCode = () => { let c = ''; for (let i = 0; i < 6; i++) c += CODE_CH[crypto.randomInt(CODE_CH.length)]; return mpRooms.has(c) ? mpCode() : c; };
const mpDeck = d => Array.isArray(d) ? d.slice(0, 25).map(x => str(x, 40)).filter(x => /^[a-z0-9_]{1,40}$/i.test(x)) : [];
const MP_S_OK = /^[a-zA-Z]{2,12}$/;
function mpS(s) { const o = {}; if (s && typeof s === 'object') for (const k in s) { if (!MP_S_OK.test(k)) continue;
  const v = parseInt(s[k], 10); if (v && v >= -99 && v <= 999) o[k] = v; } return o; }
const mpUnitView = u => ({ hp: u.hp, maxHp: u.maxHp, block: u.block, s: u.s });
function mpQueueRemove(acct) { for (let i = mpQueue.length - 1; i >= 0; i--)
  if (mpQueue[i].acct === acct || (mpQueue[i].party || []).some(x => x.acct === acct)) mpQueue.splice(i, 1); }
/* 판을 연다 — teams: [[사람, 사람?], [사람, 사람?]] */
function mpStart(mode, teams, ranked) {
  const now = Date.now(), id = crypto.randomBytes(6).toString('hex');
  const hp = MP_HP[mode] || 90;
  const first = crypto.randomInt(2);
  const A = teams[first], B = teams[1 - first];
  const order = [];
  for (let i = 0; i < Math.max(A.length, B.length); i++) { if (A[i]) order.push(A[i].acct); if (B[i]) order.push(B[i].acct); }
  const players = [], units = {};
  teams.forEach((t, ti) => t.forEach(p => {
    players.push({ acct: p.acct, name: p.name, team: ti ? 'B' : 'A', rp: p.rp || 0, tier: mpTier(p.rp || 0), deck: p.deck });
    units[p.acct] = { hp, maxHp: hp, block: 0, s: {} };
  }));
  const m = { id, mode, ranked: !!ranked, players, units, order, turn: { i: 0, no: 1, acct: order[0], deadline: now + MP_TURN_MS + 4000 },
              seq: 0, ev: [], over: false, win: null, res: null, seen: {}, to: {}, at: now };
  for (const p of players) { mpOf.set(p.acct, id); m.seen[p.acct] = now; mpQueueRemove(p.acct); }
  mpMatches.set(id, m);
  mpEv(m, { kind: 'start', acct: order[0] });
  console.log('판을 열었다:', mode, ranked ? '랭크' : '친선', players.map(p => p.acct + '(' + p.team + ')').join(' '));
  return m;
}
function mpEv(m, e) { m.seq++; e.seq = m.seq; e.t = Date.now(); m.ev.push(e); if (m.ev.length > 200) m.ev.splice(0, m.ev.length - 200); }
const mpTeamOf = (m, acct) => (m.players.find(p => p.acct === acct) || {}).team;
const mpAlive = (m, team) => m.players.some(p => p.team === team && m.units[p.acct].hp > 0);
/* 차례를 넘긴다 — 쓰러진 사람은 건너뛴다 */
function mpNext(m, now) {
  if (mpCheckOver(m)) return;
  for (let k = 1; k <= m.order.length; k++) {
    const i = (m.turn.i + k) % m.order.length, a = m.order[i];
    if (m.units[a].hp > 0) { m.turn = { i, no: m.turn.no + 1, acct: a, deadline: now + MP_TURN_MS }; mpEv(m, { kind: 'turn', acct: a }); return; }
  }
}
function mpCheckOver(m) {
  if (m.over) return true;
  const a = mpAlive(m, 'A'), b = mpAlive(m, 'B');
  if (a && b) return false;
  m.over = true; m.win = a ? 'A' : b ? 'B' : null;
  mpEv(m, { kind: 'over', win: m.win });
  mpSettle(m).catch(e => console.error('판 셈', e.message));
  return true;
}
/* 끝난 판의 셈 — 점수·토큰·전적 */
async function mpSettle(m) {
  const res = {};
  const avg = t => { const ps = m.players.filter(p => p.team === t); return ps.reduce((a, p) => a + p.rp, 0) / Math.max(1, ps.length); };
  for (const p of m.players) {
    const prof = await mpProf(p.acct);
    const won = m.win === p.team, before = prof.rp, tierBefore = mpTier(before);
    let dRp = 0, tok = 0;
    if (m.ranked) {
      const opp = avg(p.team === 'A' ? 'B' : 'A');
      if (won) { dRp = Math.max(12, Math.min(40, 25 + Math.round((opp - before) / 40))) + Math.min(10, prof.streak * 2); prof.streak++; prof.w++; }
      else { dRp = -Math.max(8, Math.min(30, 18 + Math.round((before - opp) / 40))); if (tierBefore === 'bronze') dRp = Math.round(dRp * .5); prof.streak = 0; prof.l++; }
      tok = won ? (m.mode === '2v2' ? 16 : 20) : (m.mode === '2v2' ? 5 : 6);
      prof.rp = Math.max(0, before + dRp); prof.best = Math.max(prof.best || 0, prof.rp);
    } else { if (won) prof.fw++; else prof.fl++; }
    prof.tok += tok;
    await mpPut(p.acct, prof);
    if (m.ranked) await mpTopSet(p.acct, prof);
    res[p.acct] = { won, dRp, rp: prof.rp, tok, tokAll: prof.tok, tier: mpTier(prof.rp), tierBefore };
  }
  m.res = res;
  mpEv(m, { kind: 'settled' });
  console.log('판 셈:', m.id, JSON.stringify(res));
}
/* 한 박자마다 — 마감을 넘긴 차례, 떠난 사람, 오래된 판 */
function mpTick(now) {
  for (const [id, m] of mpMatches) {
    if (m.over) { if (now - m.turn.deadline > 10 * 60 * 1000) { mpMatches.delete(id); for (const p of m.players) if (mpOf.get(p.acct) === id) mpOf.delete(p.acct); } continue; }
    for (const p of m.players) if (m.units[p.acct].hp > 0 && now - (m.seen[p.acct] || 0) > MP_GONE_MS) {
      m.units[p.acct].hp = 0; mpEv(m, { kind: 'gone', acct: p.acct });
      if (m.turn.acct === p.acct) mpNext(m, now); else mpCheckOver(m);
    }
    if (!m.over && now > m.turn.deadline) {
      const a = m.turn.acct; m.to[a] = (m.to[a] || 0) + 1;
      mpEv(m, { kind: 'timeout', acct: a });
      if (m.to[a] >= 3) { m.units[a].hp = 0; mpEv(m, { kind: 'gone', acct: a }); }
      mpNext(m, now);
    }
  }
  for (const [code, r] of mpRooms) if (now - r.at > 60 * 60 * 1000) { mpRooms.delete(code); for (const x of r.members) mpRoomOf.delete(x.acct); }
  for (const [to, list] of mpInv) { const l = list.filter(x => now - x.at < 5 * 60 * 1000); if (l.length) mpInv.set(to, l); else mpInv.delete(to); }
}
setInterval(() => { try { mpTick(Date.now()); } catch (e) { console.error('멀티 박자', e.message); } }, 1000);
/* 짝 짓기 — 기다린 만큼 점수 폭을 넓힌다 (1초에 10점, 150점부터) */
function mpMatchmake(now) {
  const win = e => 150 + 10 * Math.floor((now - e.at) / 1000);
  const q1 = mpQueue.filter(e => e.mode === '1v1');
  for (let i = 0; i < q1.length; i++) for (let j = i + 1; j < q1.length; j++) {
    const a = q1[i], b = q1[j];
    if (!mpQueue.includes(a) || !mpQueue.includes(b) || a.ver !== b.ver) continue;
    if (Math.abs(a.rp - b.rp) <= Math.max(win(a), win(b))) { mpStart('1v1', [[a], [b]], true); break; }
  }
  /* 2대2 — 파티는 한 편으로, 혼자 온 이는 둘씩 묶는다 */
  const q2 = mpQueue.filter(e => e.mode === '2v2');
  const vers = [...new Set(q2.map(e => e.ver))];
  for (const v of vers) {
    const qs = q2.filter(e => e.ver === v && mpQueue.includes(e));
    const teams = [];
    for (const e of qs.filter(e => e.party)) teams.push({ ps: e.party, rp: e.party.reduce((a, p) => a + p.rp, 0) / 2, at: e.at });
    const solos = qs.filter(e => !e.party);
    for (let i = 0; i + 1 < solos.length; i += 2) teams.push({ ps: [solos[i], solos[i + 1]], rp: (solos[i].rp + solos[i + 1].rp) / 2, at: Math.min(solos[i].at, solos[i + 1].at) });
    teams.sort((x, y) => x.at - y.at);
    const used = new Set();
    for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) {
      if (used.has(i) || used.has(j)) continue;
      if (Math.abs(teams[i].rp - teams[j].rp) <= Math.max(win(teams[i]), win(teams[j]))) {
        used.add(i); used.add(j);
        mpStart('2v2', [teams[i].ps.map(p => ({ acct: p.acct, name: p.name, rp: p.rp, deck: p.deck })), teams[j].ps.map(p => ({ acct: p.acct, name: p.name, rp: p.rp, deck: p.deck }))], true);
      }
    }
  }
}
/* 판을 그 사람에게 보여 줄 모양 — since 뒤의 일만 */
function mpView(m, acct, since) {
  return { id: m.id, mode: m.mode, ranked: m.ranked, me: acct, order: m.order,
    players: m.players.map(p => ({ acct: p.acct, name: p.name, team: p.team, rp: p.rp, tier: p.tier, deck: p.acct === acct ? undefined : p.deck.length })),
    units: Object.fromEntries(Object.entries(m.units).map(([k, u]) => [k, mpUnitView(u)])),
    turn: { acct: m.turn.acct, no: m.turn.no, left: Math.max(0, m.turn.deadline - Date.now()) },
    seq: m.seq, ev: m.ev.filter(e => e.seq > (since || 0)), over: m.over, win: m.win, res: m.res ? m.res[acct] || null : null };
}
function mpRoomView(r) { return r && { code: r.code, mode: r.mode, owner: r.owner, members: r.members.map(x => ({ acct: x.acct, name: x.name, team: x.team, rp: x.rp, tier: mpTier(x.rp) })), queued: !!r.queued }; }

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
    seenMark(url.searchParams.get('w'), url.searchParams.get('s'), now);
    await chatLoad(); chatPrune(now); await pollLoad();
    await runSchedule(now);
    if (expire(now)) await keep();
    /* 예약은 때와 이름만 — 무엇을 할지(할 말·보상)는 관리자만 본다 */
    const sched = (live.sched || []).map(x => ({ id: x.id, at: x.at, label: x.label, done: !!x.done, missed: !!x.missed,
      steps: (x.steps || []).map(t => ({ after: t.after, label: t.label, done: !!t.done })) }));
    /* 숨은 부적을 누가 찾았는지는 싣지 않는다 — 몇 명인지만 */
    const hunt = live.hunt ? Object.assign({}, live.hunt, { who: undefined }) : null;
    return send(res, 200, Object.assign({}, live, { sched, now, chatAt: chatLastId(), hunt }));
  }

  /* ── 채팅 — 읽기 ── */
  if (url.pathname === '/chat' && req.method === 'GET') {
    await store(); await chatLoad(); chatPrune(Date.now());
    const after = +url.searchParams.get('after') || 0;
    const list = chat.log.filter(x => x.id > after).slice(-60).map(chatView);
    /* 셋 분이 지나 사라진 것 — 앱도 걷어 내게 가장 오래된 살아 있는 id 를 알려 준다 */
    /* 관리자가 지운 것 — 이미 받아 간 앱에서도 걷어 내게 */
    return send(res, 200, { ok: true, list, last: chatLastId(), gone: (chat.gone || []).slice(-50), now: Date.now(),
                            first: chat.log.length ? chat.log[0].id : chatLastId() + 1, life: CHAT_LIFE });
  }

  /* ── 숨은 부적 찾기 · 투표 — 로그인한 사람만 (한 아이디에 한 번) ── */
  if ((url.pathname === '/hunt' || url.pathname.startsWith('/poll/')) && req.method === 'POST') {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 2000) return send(res, 413, { ok: false }); }
    let q; try { q = JSON.parse(body); } catch (e) { return send(res, 400, { ok: false, why: '읽을 수 없다' }); }
    await store(); await pollLoad();
    const now = Date.now();
    if (expire(now)) await keep();
    /* 관리자 — 지금까지 몇 명이 무엇을 골랐는지 */
    if (url.pathname === '/poll/admin') {
      if (!CODE || !same(String(q.code || ''), CODE)) return send(res, 403, { ok: false, why: '열쇠가 다르다' });
      const p = live.poll;
      if (!p) return send(res, 200, { ok: true, poll: null });
      const counts = p.opts.map(() => 0);
      if (pollSec && pollSec.id === p.id) for (const k in pollSec.votes) { const c = pollSec.votes[k]; if (counts[c] != null) counts[c]++; }
      return send(res, 200, { ok: true, poll: p, counts, answer: pollSec && pollSec.id === p.id ? pollSec.answer : null });
    }
    if (tooMany(ip)) return send(res, 429, { ok: false, why: '너무 자주 두드린다' });
    const acct = await tokWho(q.token);
    if (!acct) return send(res, 401, { ok: false, why: '로그인해야 한다' });

    if (url.pathname === '/hunt') {
      const h = live.hunt;
      if (!h || String(h.id) !== String(q.id) || now > h.until) return send(res, 409, { ok: false, why: '숨은 부적 찾기가 끝났다' });
      if (h.who.includes(acct)) return send(res, 409, { ok: false, why: '이미 찾았다' });
      if (h.found >= h.max) return send(res, 409, { ok: false, why: `이미 ${h.max}명이 다 찾았다` });
      h.who.push(acct); h.found++; live.at = now;
      await keep();
      console.log('숨은 부적을 찾았다:', acct, h.found + '/' + h.max);
      return send(res, 200, { ok: true, rank: h.found, max: h.max, pay: h.pay });
    }
    const p = live.poll;
    if (!p || String(p.id) !== String(q.id) || !pollSec || pollSec.id !== p.id) return send(res, 409, { ok: false, why: '그 투표는 끝났다' });
    if (url.pathname === '/poll/vote') {
      if (p.done || now > p.until) return send(res, 409, { ok: false, why: '이미 마감했다' });
      const c = parseInt(q.choice, 10);
      if (!(c >= 0 && c < p.opts.length)) return send(res, 400, { ok: false, why: '그런 보기가 없다' });
      if (acct in pollSec.votes) return send(res, 409, { ok: false, why: '이미 골랐다' });
      pollSec.votes[acct] = c; p.n++; live.at = now;
      await pollSave(); await keep();
      /* 투표면 고른 것만으로 받는다 — 한 아이디에 한 번 */
      return send(res, 200, { ok: true, mode: p.mode, pay: p.mode === 'vote' ? p.pay : null });
    }
    if (url.pathname === '/poll/claim') {
      if (p.mode !== 'quiz' || !p.done) return send(res, 409, { ok: false, why: '아직 정답이 나오지 않았다' });
      if (!(acct in pollSec.votes)) return send(res, 403, { ok: false, why: '고르지 않았다' });
      if (pollSec.votes[acct] !== pollSec.answer) return send(res, 403, { ok: false, why: '틀렸다' });
      if (pollSec.claimed[acct]) return send(res, 409, { ok: false, why: '이미 받았다' });
      pollSec.claimed[acct] = now; await pollSave();
      return send(res, 200, { ok: true, pay: p.pay });
    }
    return send(res, 404, { ok: false, why: '없는 자리' });
  }

  /* ── 지금 켜 둔 사람 — 관리자만 ── */
  if (url.pathname === '/presence' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 2000) return send(res, 413, { ok: false }); }
    let q; try { q = JSON.parse(body); } catch (e) { return send(res, 400, { ok: false, why: '읽을 수 없다' }); }
    if (!CODE || !same(String(q.code || ''), CODE)) return send(res, 403, { ok: false, why: '열쇠가 다르다' });
    const now = Date.now(), c = seenCount(now);
    if (kstDay(now) !== seenDay) { seenDay = kstDay(now); seenToday = new Set(); }
    return send(res, 200, { ok: true, n: c.n, by: c.by, peak: seenPeak, peakAt: seenPeakAt,
                            today: seenToday.size, since: bootAt, now });
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
    /* 예약 — 지금 하지 않고 정한 때에 한다 */
    if (q.schedule && typeof q.schedule === 'object') {
      const at = +q.schedule.at || 0, now = Date.now();
      if (at < now - 60000 || at > now + SCHED_MAX_AHEAD) return send(res, 400, { ok: false, why: '예약 때가 이상하다 (지금부터 60일 안)' });
      live.sched = (live.sched || []).filter(x => !x.done);
      if (live.sched.length >= 50) return send(res, 400, { ok: false, why: '예약은 50개까지' });
      /* 한 예약은 여러 장면의 차례 — 장면마다 「시작하고 몇 초 뒤」 */
      const raw = Array.isArray(q.schedule.steps) ? q.schedule.steps : [{ after: 0, patch: q.schedule.patch || {} }];
      const steps = raw.slice(0, 12).map(x => ({ after: Math.max(0, Math.min(3600, parseInt(x && x.after, 10) || 0)),
                                                label: str(x && x.label, 40), patch: pickCast((x && x.patch) || {}) }))
                       .filter(x => Object.keys(x.patch).length);
      if (!steps.length) return send(res, 400, { ok: false, why: '예약할 장면이 없다' });
      live.sched.push({ id: now + Math.floor(Math.random() * 1000), at, label: str(q.schedule.label, 60) || '예약한 일', steps });
      live.sched.sort((x, y) => x.at - y.at);
    }
    if ('unschedule' in q) live.sched = (live.sched || []).filter(x => String(x.id) !== String(q.unschedule));
    await pollLoad();
    await applyCast(pickCast(q));
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



  /* ── 채팅 — 말하기 · 관리자의 손질 ── */
  if ((url.pathname === '/chat/send' || url.pathname === '/chat/mod') && req.method === 'POST') {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 3000) return send(res, 413, { ok: false, why: '너무 길다' }); }
    let q; try { q = JSON.parse(body); } catch (e) { return send(res, 400, { ok: false, why: '읽을 수 없다' }); }
    await store(); await chatLoad();
    const now = Date.now();
    chatPrune(now);
    const isDev = !!(CODE && q.code && same(String(q.code), CODE));

    if (url.pathname === '/chat/mod') {
      if (!isDev) return send(res, 403, { ok: false, why: '열쇠가 다르다' });
      if (q.clear) { chat.gone = (chat.gone || []).concat(chat.log.map(x => x.id)).slice(-300); chat.log = []; }
      if (q.del) { chat.log = chat.log.filter(x => x.id !== +q.del); chat.gone = (chat.gone || []).concat(+q.del).slice(-300); }
      if (q.mute) {
        const x = chat.log.find(v => v.id === +q.mute);
        if (!x || !x.u) return send(res, 404, { ok: false, why: '그런 말이 없다' });
        const min = Math.max(1, Math.min(1440, parseInt(q.min, 10) || 10));
        chat.mute[x.u] = now + min * 60000;
        /* 그 사람이 한 말은 걷는다 */
        const ids = chat.log.filter(v => v.u === x.u).map(v => v.id);
        chat.log = chat.log.filter(v => v.u !== x.u); chat.gone = (chat.gone || []).concat(ids).slice(-300);
      }
      await chatSave();
      console.log('채팅 손질', JSON.stringify({ clear: !!q.clear, del: q.del, mute: q.mute }));
      return send(res, 200, { ok: true, last: chatLastId(), gone: (chat.gone || []).slice(-50) });
    }

    /* 말하기 — 로그인한 사람만. 이름은 서버가 표로 알아본다 */
    const id = await tokWho(q.token);
    if (!id) return send(res, 401, { ok: false, why: '로그인해야 말할 수 있다' });
    if (chat.mute[id] && chat.mute[id] > now) return send(res, 403, { ok: false, why: `관리자가 입을 막았다 — ${Math.ceil((chat.mute[id] - now) / 60000)}분 뒤에` });
    if (now - (chatLast.get(id) || 0) < CHAT_GAP || tooMany(ip)) return send(res, 429, { ok: false, why: '너무 빠르다 — 잠시 뒤에' });
    const t = chatClean(q.text);
    if (!t) return send(res, 400, { ok: false, why: '할 말이 비었다' });
    let n = id, k = '';
    if (isDev) { n = '백야'; k = 'dev'; }
    else if (/^[0-9a-f]{32}$/.test(String(q.gsec || ''))) {
      const me = (await guestsGet())[sha(q.gsec)];
      if (me && me.state === 'ok') { n = me.name; k = 'guest'; }
    }
    chatLast.set(id, now);
    if (chatLast.size > 20000) chatLast.clear();
    const x = { id: Math.max(now, chatLastId() + 1), n, t, at: now, k, u: id };   /* id 는 늘 커진다 */
    chat.log.push(x);
    if (chat.log.length > CHAT_KEEP) chat.log = chat.log.slice(-CHAT_KEEP);
    await chatSave();
    return send(res, 200, { ok: true, msg: chatView(x) });
  }

  /* ── 멀티플레이 ── */
  if (url.pathname === '/mp/top' && req.method === 'GET') {
    await store();
    return send(res, 200, { ok: true, top: ((await get('mptop')) || []).slice(0, 50), tiers: MP_TIERS });
  }
  if (url.pathname.startsWith('/mp/') && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 12000) return send(res, 413, { ok: false, why: '너무 길다' }); }
    let q; try { q = JSON.parse(body); } catch (e) { return send(res, 400, { ok: false, why: '읽을 수 없다' }); }
    await store();
    const acct = await tokWho(q.token);
    if (!acct) return send(res, 401, { ok: false, why: '로그인해야 한다' });
    const now = Date.now(), act = url.pathname.slice(4);
    const prof = await mpProf(acct);
    const me = { acct, name: acct, rp: prof.rp, deck: mpDeck(q.deck), ver: parseInt(q.ver, 10) || 0 };
    const profView = () => Object.assign({}, prof, { tier: mpTier(prof.rp), id: acct });

    if (act === 'me') return send(res, 200, { ok: true, prof: profView(), tiers: MP_TIERS, shop: MP_SHOP });
    /* 묻기 — 줄·방·판·초대를 한꺼번에. 짝 짓기도 여기서 돈다 */
    if (act === 'poll') {
      mpMatchmake(now); mpTick(now);
      const mid = mpOf.get(acct), m = mid && mpMatches.get(mid);
      if (m) m.seen[acct] = now;
      const qe = mpQueue.find(e => e.acct === acct || (e.party || []).some(x => x.acct === acct));
      const room = mpRooms.get(mpRoomOf.get(acct));
      return send(res, 200, { ok: true, prof: profView(),
        queue: qe ? { mode: qe.mode, wait: now - qe.at, n: mpQueue.filter(e => e.mode === qe.mode).length, party: !!qe.party } : null,
        room: mpRoomView(room), match: m ? mpView(m, acct, +q.since || 0) : null, inv: mpInv.get(acct) || [] });
    }
    if (act === 'queue') {
      if (mpOf.get(acct) && !mpMatches.get(mpOf.get(acct)).over) return send(res, 409, { ok: false, why: '이미 판에 있다' });
      if (!['1v1', '2v2'].includes(q.mode)) return send(res, 400, { ok: false, why: '모드가 이상하다' });
      if (me.deck.length < 12) return send(res, 400, { ok: false, why: '덱이 열두 장보다 적다' });
      mpQueueRemove(acct); mpOf.delete(acct);
      mpQueue.push(Object.assign(me, { mode: q.mode, at: now }));
      mpMatchmake(now);
      return send(res, 200, { ok: true });
    }
    if (act === 'cancel') { mpQueueRemove(acct); return send(res, 200, { ok: true }); }
    if (act === 'room') {
      const cur = mpRooms.get(mpRoomOf.get(acct));
      if (q.act === 'create') {
        if (cur) { cur.members = cur.members.filter(x => x.acct !== acct); mpRoomOf.delete(acct); if (!cur.members.length || cur.owner === acct) { for (const x of cur.members) mpRoomOf.delete(x.acct); mpRooms.delete(cur.code); } }
        const code = mpCode(), mode = q.mode === '2v2' ? '2v2' : '1v1';
        const r = { code, mode, owner: acct, members: [Object.assign({}, me, { team: 'A' })], at: now };
        mpRooms.set(code, r); mpRoomOf.set(acct, code);
        return send(res, 200, { ok: true, room: mpRoomView(r) });
      }
      if (q.act === 'join') {
        const r = mpRooms.get(str(q.code, 6).toUpperCase());
        if (!r) return send(res, 404, { ok: false, why: '그런 방이 없다 — 코드를 다시 보시오' });
        if (r.members.some(x => x.acct === acct)) return send(res, 200, { ok: true, room: mpRoomView(r) });
        const cap = r.mode === '2v2' ? 4 : 2;
        if (r.members.length >= cap || r.queued) return send(res, 409, { ok: false, why: '방이 가득 찼다' });
        if (cur && cur !== r) { cur.members = cur.members.filter(x => x.acct !== acct); if (!cur.members.length) mpRooms.delete(cur.code); }
        const nA = r.members.filter(x => x.team === 'A').length, nB = r.members.filter(x => x.team === 'B').length;
        const team = r.mode === '1v1' ? (nA ? 'B' : 'A') : (nA <= nB && nA < 2 ? 'A' : 'B');
        r.members.push(Object.assign({}, me, { team })); mpRoomOf.set(acct, r.code); r.at = now;
        return send(res, 200, { ok: true, room: mpRoomView(r) });
      }
      if (!cur) return send(res, 404, { ok: false, why: '방에 있지 않다' });
      const mine = cur.members.find(x => x.acct === acct);
      if (q.deck) mine.deck = me.deck;
      if (q.act === 'deck') return send(res, 200, { ok: true, room: mpRoomView(cur) });
      if (q.act === 'leave') {
        cur.members = cur.members.filter(x => x.acct !== acct); mpRoomOf.delete(acct);
        if (cur.owner === acct || !cur.members.length) { for (const x of cur.members) mpRoomOf.delete(x.acct); mpRooms.delete(cur.code); if (cur.queued) mpQueueRemove(acct); }
        return send(res, 200, { ok: true });
      }
      if (q.act === 'team') {
        const t = q.team === 'B' ? 'B' : 'A';
        if (cur.members.filter(x => x.team === t && x !== mine).length >= (cur.mode === '2v2' ? 2 : 1)) return send(res, 409, { ok: false, why: '그 편은 가득 찼다' });
        mine.team = t; return send(res, 200, { ok: true, room: mpRoomView(cur) });
      }
      if (q.act === 'start') {
        if (cur.owner !== acct) return send(res, 403, { ok: false, why: '방장만 시작한다' });
        const A = cur.members.filter(x => x.team === 'A'), B = cur.members.filter(x => x.team === 'B');
        const need = cur.mode === '2v2' ? 2 : 1;
        if (A.length !== need || B.length !== need) return send(res, 409, { ok: false, why: cur.mode === '2v2' ? '두 편에 둘씩 있어야 한다' : '둘이 있어야 한다' });
        if (cur.members.some(x => x.deck.length < 12)) return send(res, 409, { ok: false, why: '덱이 열두 장보다 적은 사람이 있다' });
        if (new Set(cur.members.map(x => x.ver)).size > 1) return send(res, 409, { ok: false, why: '판 번호가 다른 사람이 있다 — 모두 새 판으로 받으시오' });
        const m = mpStart(cur.mode, [A, B], false);
        for (const x of cur.members) mpRoomOf.delete(x.acct); mpRooms.delete(cur.code);
        return send(res, 200, { ok: true, match: m.id });
      }
      /* 파티 — 둘이 한 편으로 랭크 2대2 에 나선다 */
      if (q.act === 'queue') {
        if (cur.owner !== acct || cur.mode !== '2v2') return send(res, 403, { ok: false, why: '2대2 방의 방장만' });
        if (cur.members.length !== 2) return send(res, 409, { ok: false, why: '둘이서만 파티로 나설 수 있다' });
        if (cur.members.some(x => x.deck.length < 12)) return send(res, 409, { ok: false, why: '덱이 열두 장보다 적은 사람이 있다' });
        for (const x of cur.members) mpQueueRemove(x.acct);
        mpQueue.push({ acct, mode: '2v2', rp: cur.members.reduce((a, x) => a + x.rp, 0) / 2, ver: me.ver, at: now,
                       party: cur.members.map(x => ({ acct: x.acct, name: x.name, rp: x.rp, deck: x.deck })) });
        for (const x of cur.members) mpRoomOf.delete(x.acct); mpRooms.delete(cur.code);
        mpMatchmake(now);
        return send(res, 200, { ok: true });
      }
      return send(res, 400, { ok: false, why: '모르는 일' });
    }
    if (act === 'invite') {
      const to = str(q.to, 20).trim(), code = mpRoomOf.get(acct);
      if (!code) return send(res, 409, { ok: false, why: '먼저 방을 만드시오' });
      if (!(await soulGet(to))) return send(res, 404, { ok: false, why: '그런 아이디가 없다' });
      const l = (mpInv.get(to) || []).filter(x => x.from !== acct);
      l.push({ from: acct, code, mode: mpRooms.get(code).mode, at: now }); mpInv.set(to, l.slice(-5));
      return send(res, 200, { ok: true });
    }
    if (act === 'inbox') {
      const l = mpInv.get(acct) || [];
      if (q.drop) mpInv.set(acct, l.filter(x => x.code !== q.drop));
      return send(res, 200, { ok: true, inv: l });
    }
    /* 판 안의 일 */
    const mid = mpOf.get(acct), m = mid && mpMatches.get(mid);
    if (act === 'play' || act === 'end' || act === 'leave') {
      if (!m || m.id !== q.id) return send(res, 404, { ok: false, why: '그 판이 없다' });
      m.seen[acct] = now;
      if (act === 'leave') {
        /* 진행 중이면 항복 — 판에는 남겨 두어 결과를 보게 한다. 끝난 판이면 그제야 떠난다 */
        if (!m.over) { m.units[acct].hp = 0; mpEv(m, { kind: 'gone', acct });
          if (m.turn.acct === acct) mpNext(m, now); else mpCheckOver(m); }
        else mpOf.delete(acct);
        return send(res, 200, { ok: true });
      }
      if (m.over) return send(res, 409, { ok: false, why: '끝난 판이다' });
      if (m.turn.acct !== acct) return send(res, 409, { ok: false, why: '그대 차례가 아니다' });
      if (act === 'play') {
        mpEv(m, { kind: 'play', acct, card: str(q.card, 40), up: !!q.up, target: str(q.target, 20) });
        return send(res, 200, { ok: true, seq: m.seq });
      }
      /* 차례를 마친다 — 결과를 적는다. 상대의 체력은 늘릴 수 없고, 한 편의 것은 제 것만 고친다 */
      const myTeam = mpTeamOf(m, acct);
      const units = q.units && typeof q.units === 'object' ? q.units : {};
      for (const [k, u] of Object.entries(units)) {
        const cur = m.units[k]; if (!cur || !u || typeof u !== 'object') continue;
        const foe = mpTeamOf(m, k) !== myTeam;
        if (!foe && k !== acct) continue;
        let hp = Math.max(0, Math.min(cur.maxHp, parseInt(u.hp, 10) || 0));
        if (foe && hp > cur.hp) hp = cur.hp;
        cur.hp = hp; cur.block = Math.max(0, Math.min(999, parseInt(u.block, 10) || 0)); cur.s = mpS(u.s);
      }
      m.to[acct] = 0;
      mpEv(m, { kind: 'end', acct, units: Object.fromEntries(Object.entries(m.units).map(([k, u]) => [k, mpUnitView(u)])) });
      mpNext(m, now);
      return send(res, 200, { ok: true, seq: m.seq });
    }
    /* 그림자와의 연습 — 사람이 없을 때. 하루 열 번까지 토큰 조금 */
    if (act === 'bot') {
      const day = new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
      if (prof.day !== day) { prof.day = day; prof.botN = 0; }
      let tok = 0;
      if (prof.botN < MP_BOT_DAY) { prof.botN++; tok = q.win ? 6 : 2; prof.tok += tok; }
      await mpPut(acct, prof);
      return send(res, 200, { ok: true, tok, left: MP_BOT_DAY - prof.botN, prof: profView() });
    }
    /* 교환소 */
    if (act === 'shop') {
      const price = MP_SHOP[q.item];
      if (!price) return send(res, 400, { ok: false, why: '없는 물건' });
      if (prof.tok < price) return send(res, 409, { ok: false, why: `토큰이 ${price - prof.tok}개 모자란다` });
      prof.tok -= price; await mpPut(acct, prof);
      console.log('교환소:', acct, q.item);
      return send(res, 200, { ok: true, item: q.item, prof: profView() });
    }
    return send(res, 404, { ok: false, why: '없는 자리' });
  }

  /* ── 게스트 ── */
  if (url.pathname.startsWith('/guest/') && req.method === 'POST') {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 4000) return send(res, 413, { ok: false, why: '너무 길다' }); }
    let q; try { q = JSON.parse(body); } catch (e) { return send(res, 400, { ok: false, why: '읽을 수 없다' }); }
    await store();
    const now = Date.now();

    /* 관리자 — 청한 이를 보고, 허락하고, 거두고, 부적 뿌리기를 맡긴다 */
    if (url.pathname === '/guest/admin') {
      if (!CODE) return send(res, 500, { ok: false, why: '서버에 열쇠가 없다' });
      if (!same(String(q.code || ''), CODE)) return send(res, 403, { ok: false, why: '열쇠가 다르다' });
      const g = await guestsGet();
      const inv = await invGet();
      if (q.act === 'invite' || q.act === 'uninvite') {
        const user = str(q.user, 20).trim();
        if (q.act === 'uninvite') delete inv[user];
        else {
          if (!nameOk(user) || !(await soulGet(user))) return send(res, 404, { ok: false, why: '그런 아이디가 없다' });
          if (Object.values(g).some(v => v.acct === user && v.state === 'ok')) return send(res, 409, { ok: false, why: '이미 게스트다' });
          inv[user] = { at: Date.now() };
          console.log('게스트로 초대:', user);
        }
        await put(INV_KEY, inv);
        return send(res, 200, { ok: true, guests: guestView(g), invites: Object.keys(inv) });
      }
      const x = q.id ? Object.values(g).find(v => v.id === String(q.id)) : null;
      if (q.act && q.act !== 'list') {
        if (!x) return send(res, 404, { ok: false, why: '그런 게스트가 없다' });
        if (q.act === 'ok') x.state = 'ok';
        else if (q.act === 'no') { x.state = 'no'; x.gift = false; }
        else if (q.act === 'gift') x.gift = true;
        else if (q.act === 'nogift') x.gift = false;
        else if (q.act === 'drop') { for (const k in g) if (g[k] === x) delete g[k]; }
        else return send(res, 400, { ok: false, why: '모르는 일' });
        await guestsPut(g);
        console.log('게스트', q.act, x.name);
      }
      return send(res, 200, { ok: true, guests: guestView(g), invites: Object.keys(inv) });
    }

    /* 초대 받은 이 — 로그인 표로 알아본다 */
    if (url.pathname === '/guest/inbox' || url.pathname === '/guest/accept' || url.pathname === '/guest/decline') {
      const id = await tokWho(q.token);
      if (!id) return send(res, 401, { ok: false, why: '로그인해야 한다' });
      const inv = await invGet();
      if (url.pathname === '/guest/inbox') return send(res, 200, { ok: true, invite: !!inv[id] });
      if (!inv[id]) return send(res, 404, { ok: false, why: '받은 초대가 없다' });
      delete inv[id]; await put(INV_KEY, inv);
      if (url.pathname === '/guest/decline') { console.log('초대를 거절:', id); return send(res, 200, { ok: true }); }
      const sec = String(q.sec || '');
      if (!/^[0-9a-f]{32}$/.test(sec)) return send(res, 400, { ok: false, why: '게스트 열쇠가 이상하다' });
      const g = await guestsGet();
      const want = str(q.name, 20).trim();
      let name = guestNameOk(want) ? want : guestNameOk(id) ? id : '게스트' + crypto.randomBytes(2).toString('hex');
      if (Object.values(g).some(v => v.name === name && v !== g[sha(sec)])) name = name.slice(0, 16) + crypto.randomBytes(1).toString('hex');
      const had = g[sha(sec)];
      g[sha(sec)] = Object.assign(had || { id: crypto.randomBytes(5).toString('hex'), gift: false }, { name, state: 'ok', at: now, acct: id });
      await guestsPut(g);
      console.log('초대를 받아 게스트가 되었다:', id, '→', name);
      return send(res, 200, { ok: true, state: 'ok', name, gift: !!g[sha(sec)].gift });
    }

    /* 여기서부터는 게스트 자신 — 제 기계가 만든 열쇠로 알아본다 */
    const sec = String(q.sec || '');
    if (!/^[0-9a-f]{32}$/.test(sec)) return send(res, 400, { ok: false, why: '게스트 열쇠가 이상하다' });
    const h = sha(sec);
    const g = await guestsGet();
    let me = g[h] || null;

    /* 청한다 — 이름을 달아서 */
    if (url.pathname === '/guest/ask') {
      if (tooMany(ip)) return send(res, 429, { ok: false, why: '너무 자주 두드린다' });
      const name = str(q.name, 20).trim();
      if (!guestNameOk(name)) return send(res, 400, { ok: false, why: '이름은 2~20 글자, 한글·영문·숫자·_.- 만 (백야·관리자 따위는 못 쓴다)' });
      if (Object.values(g).some(v => v !== me && v.name === name)) return send(res, 409, { ok: false, why: '이미 있는 게스트 이름이다' });
      if (me && me.state === 'ok') { me.name = name; await guestsPut(g); return send(res, 200, { ok: true, state: me.state, name, gift: !!me.gift }); }
      if (me && me.state === 'no' && now - me.at < 10 * 60 * 1000) return send(res, 429, { ok: false, why: '거절된 지 얼마 안 되었다 — 10분 뒤에 다시 청하시오' });
      if (!me) {
        const all = Object.values(g);
        if (all.length >= 300) return send(res, 503, { ok: false, why: '게스트 자리가 가득 찼다' });
        if (all.filter(v => v.state === 'ask').length >= 50) return send(res, 503, { ok: false, why: '청한 이가 너무 많다 — 잠시 뒤에' });
        me = g[h] = { id: crypto.randomBytes(5).toString('hex'), name, state: 'ask', gift: false, at: now };
      } else { me.name = name; me.state = 'ask'; me.at = now; }
      await guestsPut(g);
      console.log('게스트가 청했다:', name);
      return send(res, 200, { ok: true, state: me.state, name, gift: false });
    }
    /* 제 처지를 묻는다 */
    if (url.pathname === '/guest/me') {
      if (!me) return send(res, 200, { ok: true, state: '', name: '', gift: false });
      return send(res, 200, { ok: true, state: me.state, name: me.name, gift: !!me.gift,
        sayIn: Math.max(0, (me.lastSay || 0) + GUEST_SAY_MS - now), chaosIn: Math.max(0, (me.lastChaos || 0) + GUEST_CHAOS_MS - now),
        giftUsed: !!(evMark(now) && me.lastGiftEv === evMark(now)) });
    }
    /* 퍼뜨린다 */
    if (url.pathname === '/guest/cast') {
      if (!me || me.state !== 'ok') return send(res, 403, { ok: false, why: '관리자의 허락이 아직 없다' });
      if (expire(now)) await keep();
      if ('notice' in q) {
        if (now - (me.lastSay || 0) < GUEST_SAY_MS) return send(res, 429, { ok: false, why: '말은 30초에 한 번' });
        const t = str(q.notice, 200).trim();
        if (!t) return send(res, 400, { ok: false, why: '할 말이 비었다' });
        live.notice = t; live.noticeAt = now; live.noticeBy = me.name;
        me.lastSay = now; me.says = (me.says || 0) + 1;
      } else if (q.chaos) {
        if (evActive(now)) return send(res, 409, { ok: false, why: '이미 다른 일이 걸려 있다 — 끝난 뒤에' });
        if (now - (me.lastChaos || 0) < GUEST_CHAOS_MS) return send(res, 429, { ok: false, why: '혼돈은 10분에 한 번' });
        await applyCast({ event: 'chaos' });
        live.notice = '혼돈을 뿌렸습니다!'; live.noticeAt = now; live.noticeBy = me.name;
        me.lastChaos = now;
      } else if (q.gift && typeof q.gift === 'object') {
        if (!me.gift) return send(res, 403, { ok: false, why: '부적 뿌리기는 관리자가 따로 허락해야 한다' });
        if (!evMark(now)) return send(res, 409, { ok: false, why: '이벤트가 걸려 있을 때만 뿌릴 수 있다' });
        if (me.lastGiftEv === evMark(now)) return send(res, 429, { ok: false, why: '이 이벤트에는 이미 뿌렸다' });
        if (live.gift && (!live.gift.until || now <= live.gift.until)) return send(res, 409, { ok: false, why: '지금 다른 선물이 걸려 있다' });
        const cards = Array.isArray(q.gift.cards) ? q.gift.cards.slice(0, 3).map(c => str(c, 40)).filter(Boolean) : [];
        if (!cards.length) return send(res, 400, { ok: false, why: '뿌릴 부적이 없다' });
        live.gift = { id: now, cards, say: str(q.gift.say, 120), by: me.name, at: now,
                      until: Math.min(now + EV_MS, evActive(now) ? live.eventUntil || now + EV_MS : live.rain.until) };
        me.lastGiftEv = evMark(now);
      } else return send(res, 400, { ok: false, why: '무엇을 할지 없다' });
      live.at = now;
      await keep(); await guestsPut(g);
      console.log('게스트가 퍼뜨렸다:', me.name, Object.keys(q).filter(k => k !== 'sec').join(','));
      return send(res, 200, { ok: true });          /* 예약 따위는 게스트에게 보이지 않는다 — 게임이 /live 로 다시 듣는다 */
    }
    return send(res, 404, { ok: false, why: '없는 자리' });
  }

  /* ── 뒷받침 — 잠긴 채로만 내어 준다 ── */
  if (url.pathname === '/backup' && req.method === 'GET') {
    if (!process.env.BACKUP_PASS) return send(res, 503, { ok: false, why: '뒷받침 열쇠가 없다' });
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
    if (tooMany(ip)) return send(res, 429, { ok: false });
    try {
      await store();
      const sealed = bkSeal(await bkCollect());
      res.writeHead(200, Object.assign({ 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }, CORS));
      return res.end(sealed);
    } catch (e) { console.error('뒷받침', e.message); return send(res, 500, { ok: false }); }
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
