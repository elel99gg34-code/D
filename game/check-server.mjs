/* ══════════════════════════════════════════════════════════
   서버 검사 (판 69) — 서버를 띄우고 실제로 두드려 본다
   ──────────────────────────────────────────────────────────
     ① 퍼징 — 모든 자리에 이상한 본문(null · 배열 · 글 · 깨진 JSON · 엉뚱한 값)을 보낸다. 서버가 죽으면 안 된다
     ② 가입 제한 · 같은 아이디 동시 가입
     ③ 비밀번호를 바꾸면 다른 기기의 표가 풀리고 새 표를 받는다
     ④ 계정 지우기 — 신청 · 무르기 · 이레가 지나면 정리(시험에서는 짧게)
     ⑤ 오류 알림 — 묶어 세기 · 기기 한도 · 관리자만 본다
     ⑥ 점검 · 링크 금지 · 보이지 않는 글자 · /health · 배포 재시작(SIGTERM) 때 적고 내려간다
   node game/check-server.mjs
   ══════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRV = path.join(ROOT, 'server/live.mjs');
const KEY = 'check-key-' + Math.random().toString(36).slice(2, 10);
const bad = [], good = [];
const ok = (c, m) => { (c ? good : bad).push(m); console.log((c ? '  ○ ' : '  ✗ ') + m); };
let port = 11000 + Math.floor(Math.random() * 4000);
const up = async (env = {}) => {
  const p = port++;
  const s = spawn(process.execPath, [SRV], { env: Object.assign({}, process.env, { PORT: String(p), CAST_CODE: KEY, REDIS_URL: '', DATABASE_URL: '' }, env), stdio: ['ignore', 'pipe', 'pipe'] });
  s.out = ''; s.stdout.on('data', d => s.out += d); s.stderr.on('data', d => s.out += d);
  s.dead = false; s.on('exit', c => { s.dead = true; s.code = c; });
  s.U = 'http://127.0.0.1:' + p;
  for (let i = 0; i < 40; i++) { try { const r = await fetch(s.U + '/health'); if (r.ok) break; } catch (e) {} await new Promise(r => setTimeout(r, 100)); }
  return s;
};
const ask = async (s, p, b, raw) => { const r = await fetch(s.U + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw != null ? raw : JSON.stringify(b) }); const j = await r.json().catch(() => ({})); j._s = r.status; return j; };

console.log('■ 서버 검사');
/* ① 퍼징 */
{
  const src = fs.readFileSync(SRV, 'utf8');
  const eps = [...new Set([...src.matchAll(/url\.pathname === '([^']+)'/g)].map(m => m[1]).concat([...src.matchAll(/'(\/(?:guild|meet|mp)\/[a-z/]+)'/g)].map(m => m[1])))];
  const bodies = ['', 'null', '[]', '"x"', '{', '{}', '123', JSON.stringify({ token: 5, who: {}, t: [], q: null, code: [], id: {}, name: [], act: {}, mode: 9, deck: 'x', hm: 'x', pf: 'x', save: 'x', mats: 'x', at: 'x', dmg: 'x', n: {}, k: [], gold: -5, dia: 'NaN', floor: 1e309 })];
  let s = await up(), crashes = [];
  for (const ep of eps) for (const m of ['POST', 'GET']) for (const body of (m === 'GET' ? [null] : bodies)) {
    /* 장부 자리는 한 곳에서 분에 스물까지만 받는다 — 자리마다 새 서버로 두드려야 본문까지 닿는다 */
    if (/^\/(auth|pull)/.test(ep) && m === 'POST' && body === bodies[0]) { s.kill(); s = await up(); }
    try { await fetch(s.U + ep + (m === 'GET' ? '?u=1&w=1&s=1&t=x' : ''), { method: m, headers: { 'content-type': 'application/json' }, body: body == null ? undefined : body, signal: AbortSignal.timeout(5000) }); } catch (e) {}
    if (s.dead) { crashes.push(`${m} ${ep} ${String(body).slice(0, 12)} — ${(s.out.match(/(\w*Error[^\n]*)/) || [''])[0].slice(0, 100)}`); s = await up(); }
  }
  ok(!crashes.length, `퍼징 — ${eps.length}자리 × 이상한 본문 ${bodies.length + 1}가지에 서버가 서 있다` + (crashes.length ? ' · 죽은 곳: ' + crashes.slice(0, 5).join(' / ') : ''));
  s.kill(); s = await up();
  const nb = await fetch(s.U + '/auth/me', { method: 'POST', body: 'null' }); ok(nb.status === 400, '본문이 null 이면 400 으로 돌려보낸다');
  s.kill();
}
/* ② ~ ⑥ */
{
  const s = await up({ DEL_WAIT_MS: '1500', DEL_SWEEP_MS: '700' });
  const sfx = Date.now() % 100000;
  const h = await (await fetch(s.U + '/health')).json(); ok(h.ok && h.up >= 0 && h.mem > 0 && h.ver, '/health — 가동 시간 · 기억 · 판');
  /* 가입 제한 */
  const codes = []; for (let i = 0; i < 8; i++) codes.push((await ask(s, '/auth/signup', { id: 'ck' + sfx + i, pw: 'Abcd1234!x', nick: '검' + (sfx % 1000) + i, dev: 'dev-ck-' + i })).ok ? 200 : 429);
  ok(codes.slice(0, 6).every(c => c === 200) && codes[6] === 429, '가입 제한 — 한 곳에서 시간당 여섯 ' + codes.join(','));
  const s2 = await up(); const dup = await Promise.all([0, 1].map(() => ask(s2, '/auth/signup', { id: 'dup' + sfx, pw: 'Abcd1234!x', nick: '겹' + (sfx % 1000) })));
  ok(dup.filter(x => x.ok).length === 1, '같은 아이디를 동시에 둘 — 하나만 만든다'); s2.kill();
  const s3 = await up({ DEL_WAIT_MS: '1500', DEL_SWEEP_MS: '700' });
  const A = { id: 'cka' + sfx, pw: 'Abcd1234!x', nick: '갑' + (sfx % 1000) }, B = { id: 'ckb' + sfx, pw: 'Abcd1234!x', nick: '을' + (sfx % 1000) };
  const a1 = await ask(s3, '/auth/signup', A), a2 = await ask(s3, '/auth/login', { id: A.id, pw: A.pw });
  await ask(s3, '/auth/signup', B);
  /* 비밀번호 */
  const pn = await ask(s3, '/auth/pwnew', { token: a1.token, pw: 'Zyxw9876!q' });
  ok(pn.ok && /^[0-9a-f]{48}$/.test(pn.token) && (await ask(s3, '/auth/me', { token: a2.token }))._s === 401 && (await ask(s3, '/auth/me', { token: pn.token })).ok, '비밀번호를 바꾸면 다른 기기의 표가 풀리고 새 표를 준다');
  /* 지우기 신청 · 무르기 */
  const d0 = await ask(s3, '/auth/delete', { token: pn.token, pw: 'nope' }), d1 = await ask(s3, '/auth/delete', { token: pn.token, pw: 'Zyxw9876!q' });
  const me = await ask(s3, '/auth/me', { token: pn.token }), un = await ask(s3, '/auth/undelete', { token: pn.token }), me2 = await ask(s3, '/auth/me', { token: pn.token });
  ok(d0._s === 403 && d1.ok && me.delUntil === d1.until && un.ok && !me2.delUntil, '계정 지우기 — 비밀번호 확인 · 신청 · 무르기');
  await ask(s3, '/hm/set', { token: pn.token, hm: { roof: 'tile', msg: '집' } });
  await ask(s3, '/auth/delete', { token: pn.token, pw: 'Zyxw9876!q' });
  await new Promise(r => setTimeout(r, 3000));
  const gone = await ask(s3, '/auth/login', { id: A.id, pw: 'Zyxw9876!q' }), hm = await ask(s3, '/hm/get', { who: A.id }), re = await ask(s3, '/auth/signup', { id: 'ckz' + sfx, pw: 'Abcd1234!x', nick: A.nick });
  ok(gone._s === 403 && hm._s === 404 && re.ok, '지우기 만기 — 계정 · 암자가 지워지고 닉네임이 풀린다');
  /* 오류 알림 */
  for (let i = 0; i < 3; i++) await ask(s3, '/log/err', { dev: 'dev-e1', msg: 'TypeError: x', stack: 'at a\nat b', where: 'battle' });
  await ask(s3, '/log/err', { dev: 'dev-e2', msg: 'TypeError: x', stack: 'at a\nat b' });
  const ae = await ask(s3, '/admin/errs', { code: KEY }), an = await ask(s3, '/admin/errs', { code: 'x' });
  let rl = 0; for (let i = 0; i < 33; i++) if ((await ask(s3, '/log/err', { dev: 'dev-e3', msg: 'm' + i }))._s === 429) rl++;
  ok(ae.ok && ae.list.length === 1 && ae.list[0].n === 4 && ae.list[0].devs === 2 && an._s === 403 && rl === 3, '오류 알림 — 묶어 세기 · 기기 한도 · 관리자만');
  /* 점검 · 링크 · 보이지 않는 글자 */
  await ask(s3, '/cast', { code: KEY, maint: { min: 5, msg: '손보는 중' } }); const lv = await (await fetch(s3.U + '/live')).json();
  await ask(s3, '/cast', { code: KEY, maint: null }); const lv2 = await (await fetch(s3.U + '/live')).json();
  ok(lv.maint && lv.maint.msg === '손보는 중' && !lv2.maint, '점검 — 걸고 푼다');
  const C = await ask(s3, '/auth/signup', { id: 'ckc' + sfx, pw: 'Abcd1234!x', nick: '병' + (sfx % 1000) });
  const lk = await ask(s3, '/chat/send', { token: C.token, text: '무료 다이아 bit.ly/x' }), sg = await ask(s3, '/hm/sign', { token: C.token, who: B.id, t: '안​녕‮' }), gb = await ask(s3, '/hm/get', { who: B.id });
  ok(!lk.ok && /링크/.test(lk.why) && sg.ok && gb.gb[0].t === '안녕', '채팅 링크 금지 · 보이지 않는 글자 걷기');
  /* ⑦ 보안 (판 74) — 관리자 열쇠 두드리기 · 소식에 비밀 없음 · 머리말 · 걸러 담기 */
  {
    const cast = (code, ip) => fetch(s3.U + '/cast', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ code, notice: 'n' + Math.random() }) }).then(r => r.status);
    const okFirst = await cast(KEY, '7.7.7.7');
    for (let i = 0; i < 12; i++) await cast('wrong-guess-long-key-' + i, '8.8.8.8');
    const locked = await cast(KEY, '8.8.8.8'), other = await cast(KEY, '7.7.7.7');
    ok(okFirst === 200 && locked === 403 && other === 200, '관리자 열쇠 — 한 곳에서 열두 번 틀리면 맞는 열쇠도 30분 막힌다 · 다른 곳은 그대로');
    const lv = await (await fetch(s3.U + '/live')).json(), hd = await fetch(s3.U + '/health');
    ok(!('admOk' in lv) && !('luckyP' in lv) && !('luckyOwed' in lv) && !('wheelP' in lv) && !JSON.stringify(lv).includes(KEY), '소식(/live)에 열쇠 · 아는 곳 · 추첨 명단이 없다');
    ok(hd.headers.get('x-frame-options') === 'DENY' && /frame-ancestors 'none'/.test(hd.headers.get('content-security-policy') || '') && /max-age/.test(hd.headers.get('strict-transport-security') || ''), '답 머리말 — 틀 막기 · CSP · HSTS');
    await ask(s3, '/pf/set', { token: C.token, pf: { title: '<b>칭"호', fav: ['<x>', 'strike'], frame: '"><x' } });
    const pf = await ask(s3, '/pf/get', { who: 'ckc' + sfx });
    ok(pf.pf && !/[<>"']/.test(pf.pf.title) && pf.pf.fav.join() === 'strike' && pf.pf.frame === 'ink', '프로필 — 꺾쇠 · 따옴표 · 모르는 이름은 걸러 담는다');
  }
  /* 배포 재시작 */
  s3.kill('SIGTERM'); await new Promise(r => setTimeout(r, 1500));
  ok(s3.dead && s3.code === 0 && /SIGTERM/.test(s3.out), '배포 재시작(SIGTERM) — 적어 두고 조용히 내려간다');
  s.kill();
}
const line = `■ 서버 검사 — 통과 ${good.length} · 고칠 것 ${bad.length}`;
console.log('\n' + line);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 서버 검사\n\n| | 항목 |\n|---|---|\n${good.map(m => `| ○ | ${m} |`).join('\n')}\n${bad.map(m => `| ✗ | ${m} |`).join('\n')}\n\n${line}\n\n`);
process.exit(bad.length ? 1 : 0);
