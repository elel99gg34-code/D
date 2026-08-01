/* ══════════════════════════════════════════════════════════
   백귀야행 — 겨루기 서버 (比武)
   ──────────────────────────────────────────────────────────
   · 회원가입 / 로그인 (아이디 + 비밀번호, 파일 한 장에 저장)
   · 대기방 — 접속한 사람 목록
   · 1대1 겨루기 — 도전 · 수락 · 수(手) 중계
   · 게임 파일(index.html)도 이 서버가 그냥 내어 준다

   돌리는 법
   ──────────
     cd server
     npm install
     node server.js                 (기본 8080 포트)
     PORT=3000 node server.js       (다른 포트)

   그러면 브라우저에서  http://localhost:8080  으로 들어간다.
   같은 공유기 안의 친구는  http://<내 아이피>:8080  으로 들어오면 된다.
   바깥에서 들어오게 하려면 Render · Railway · Fly.io 같은 데 올리거나
   ngrok 같은 걸로 굴을 뚫으면 된다.

   저장되는 것
   ──────────
     users.json  — 아이디 · 소금 · 해시 · 전적. 비밀번호 원문은 남기지 않는다.
   ══════════════════════════════════════════════════════════ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 8080);
const ROOT = path.join(__dirname, '..');            /* index.html 이 있는 자리 */
const DB_FILE = path.join(__dirname, 'users.json');

/* ── 사람들 ─────────────────────────────────────────────── */
let DB = { users: {} };
try { DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) {}
DB.users = DB.users || {};
let saveTimer = null;
function saveDB() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(DB_FILE, JSON.stringify(DB, null, 2), e => { if (e) console.error('저장 실패', e); });
  }, 300);
}
const hash = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');
const newSalt = () => crypto.randomBytes(16).toString('hex');
const newToken = () => crypto.randomBytes(24).toString('hex');

function idOk(id) { return /^[A-Za-z0-9가-힣_]{2,16}$/.test(String(id || '')); }
function pwOk(pw) { return String(pw || '').length >= 4; }

function register(id, pw) {
  if (!idOk(id)) return { ok: false, msg: '아이디는 2~16자 · 한글/영문/숫자/밑줄' };
  if (!pwOk(pw)) return { ok: false, msg: '비밀번호는 네 자 이상' };
  const key = String(id).toLowerCase();
  if (DB.users[key]) return { ok: false, msg: '이미 있는 아이디다' };
  const salt = newSalt();
  DB.users[key] = { id: String(id), salt, hash: hash(pw, salt), at: Date.now(), win: 0, lose: 0, best: 0 };
  saveDB();
  return { ok: true, user: pub(DB.users[key]) };
}
function login(id, pw) {
  const u = DB.users[String(id || '').toLowerCase()];
  if (!u) return { ok: false, msg: '없는 아이디다' };
  if (u.hash !== hash(pw, u.salt)) return { ok: false, msg: '비밀번호가 다르다' };
  return { ok: true, user: pub(u) };
}
const pub = u => ({ id: u.id, win: u.win || 0, lose: u.lose || 0, best: u.best || 0 });
function record(id, won) {
  const u = DB.users[String(id || '').toLowerCase()];
  if (!u) return;
  if (won) u.win = (u.win || 0) + 1; else u.lose = (u.lose || 0) + 1;
  saveDB();
}

/* ── 게임 파일 내어 주기 ─────────────────────────────────── */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('안 된다'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('없는 길이다'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
});

/* ── 겨루기 ─────────────────────────────────────────────── */
const wss = new WebSocketServer({ server });
const live = new Map();          /* token → { ws, id, room, ready } */
const rooms = new Map();         /* roomId → { a, b, turn, seed, over } */
let roomSeq = 1;

const send = (ws, t, d) => { try { ws.send(JSON.stringify(Object.assign({ t }, d || {}))); } catch (e) {} };
function lobbyList() {
  return [...live.values()].filter(c => !c.room).map(c => ({ id: c.id, ...pub(DB.users[c.id.toLowerCase()] || { id: c.id }) }));
}
function pushLobby() {
  const list = lobbyList();
  for (const c of live.values()) if (!c.room) send(c.ws, 'lobby', { list });
}
function findByName(name) {
  for (const c of live.values()) if (c.id.toLowerCase() === String(name || '').toLowerCase()) return c;
  return null;
}
function leaveRoom(c, why) {
  if (!c || !c.room) return;
  const r = rooms.get(c.room);
  if (r) {
    const other = r.a === c ? r.b : r.a;
    if (other) {
      other.room = null;
      send(other.ws, 'duelEnd', { win: true, why: why || '상대가 물러났다' });
      record(other.id, true);
    }
    record(c.id, false);
    rooms.delete(c.room);
  }
  c.room = null;
  pushLobby();
}

wss.on('connection', ws => {
  let me = null;
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }

    /* ── 문 앞 ── */
    if (m.t === 'register' || m.t === 'login') {
      const r = m.t === 'register' ? register(m.id, m.pw) : login(m.id, m.pw);
      if (!r.ok) { send(ws, 'authFail', { msg: r.msg }); return; }
      /* 같은 사람이 두 군데서 들어오면 앞의 것을 내보낸다 */
      const old = findByName(r.user.id);
      if (old) { send(old.ws, 'kicked', {}); try { old.ws.close(); } catch (e) {} }
      const token = newToken();
      me = { ws, id: r.user.id, room: null, token };
      live.set(token, me);
      send(ws, 'authOk', { user: r.user, token });
      pushLobby();
      return;
    }
    if (!me) { send(ws, 'authFail', { msg: '먼저 들어와야 한다' }); return; }

    /* ── 대기방 ── */
    if (m.t === 'lobby') { send(ws, 'lobby', { list: lobbyList() }); return; }

    if (m.t === 'challenge') {
      const foe = findByName(m.id);
      if (!foe || foe === me) { send(ws, 'info', { msg: '그 사람은 지금 없다' }); return; }
      if (foe.room) { send(ws, 'info', { msg: '그 사람은 겨루는 중이다' }); return; }
      send(foe.ws, 'challenged', { from: me.id });
      send(ws, 'info', { msg: `${foe.id}에게 청했다` });
      return;
    }
    if (m.t === 'accept') {
      const foe = findByName(m.id);
      if (!foe || foe.room || me.room) { send(ws, 'info', { msg: '이미 늦었다' }); return; }
      const id = 'r' + (roomSeq++);
      const seed = (Math.random() * 0xffffffff) >>> 0;
      const r = { a: foe, b: me, turn: foe.id, seed, over: false };
      rooms.set(id, r);
      foe.room = id; me.room = id;
      send(foe.ws, 'duelStart', { foe: me.id, seed, first: true });
      send(me.ws,  'duelStart', { foe: foe.id, seed, first: false });
      pushLobby();
      return;
    }
    if (m.t === 'decline') {
      const foe = findByName(m.id);
      if (foe) send(foe.ws, 'info', { msg: `${me.id}이(가) 물렸다` });
      return;
    }

    /* ── 겨루는 중 ── */
    if (m.t === 'move' || m.t === 'say') {
      const r = rooms.get(me.room);
      if (!r) return;
      const other = r.a === me ? r.b : r.a;
      if (other) send(other.ws, m.t === 'say' ? 'saidBy' : 'moveBy', { from: me.id, d: m.d });
      return;
    }
    if (m.t === 'duelOver') {
      const r = rooms.get(me.room);
      if (!r || r.over) return;
      r.over = true;
      const other = r.a === me ? r.b : r.a;
      /* 진 쪽이 알려 온다 */
      record(me.id, false);
      if (other) { record(other.id, true); other.room = null; send(other.ws, 'duelEnd', { win: true, why: '이겼다' }); }
      send(me.ws, 'duelEnd', { win: false, why: '졌다' });
      me.room = null;
      rooms.delete(r === rooms.get(me.room) ? me.room : [...rooms.keys()].find(k => rooms.get(k) === r));
      pushLobby();
      return;
    }
    if (m.t === 'leave') { leaveRoom(me, '상대가 물러났다'); return; }
  });

  ws.on('close', () => {
    if (!me) return;
    leaveRoom(me, '상대의 줄이 끊겼다');
    live.delete(me.token);
    pushLobby();
  });
});

server.listen(PORT, () => {
  console.log(`\n  백귀야행 겨루기 서버`);
  console.log(`  ─────────────────────────────`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  사람 ${Object.keys(DB.users).length}명이 등록되어 있다\n`);
});
