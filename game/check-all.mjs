/* ══════════════════════════════════════════════════════════
   올리기 전 검사 — 한 곳을 고치다 다른 곳이 깨지지 않았는가
   ──────────────────────────────────────────────────────────
   게임이 파일 하나(2만 줄)라, 한 곳을 고치면 먼 곳이 깨지기 쉽다.
   실제로 겪은 것들을 잡는 그물이다:
     · 같은 이름(id)의 부적·요괴가 뒤의 것에 덮여 사라진 것
     · 조우표가 없는 요괴를 부르는 것
     · 파일에 코드(관리자 열쇠 따위)를 그대로 적은 것
     · 문법 오류로 판이 아예 안 뜨는 것
     · 켜자마자, 싸우다가 터지는 오류
     · 지어 낸 판(dist · app)이 깨진 것 · 판이 너무 무거워지거나 늦게 뜨는 것 (판 69)
   node game/check-all.mjs          — 다 본다
   node game/check-all.mjs 빠르게   — 브라우저 없이 글만 본다
   ══════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync, spawn } from 'child_process';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FILE = process.env.CHECK_FILE || path.join(HERE, 'index.html');
const QUICK = process.argv.includes('빠르게') || process.argv.includes('--quick');
const html = fs.readFileSync(FILE, 'utf8');
const bad = [];
const good = [];
const ok = m => { good.push(m); console.log('  ○ ' + m); };
const no = m => { bad.push(m); console.log('  ✗ ' + m); };

console.log('■ 글로 보는 검사');

/* ① 문법 — 스크립트 조각마다 node 로 읽혀 본다 */
{
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-'));
  blocks.forEach((b, i) => {
    const f = path.join(tmp, `s${i}.js`);
    fs.writeFileSync(f, b);
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); ok(`스크립트 ${i + 1}/${blocks.length} 문법`); }
    catch (e) { no(`스크립트 ${i + 1} 문법 오류: ` + String(e.stderr || e.message).split('\n').slice(0, 4).join(' ')); }
  });
  try { execFileSync(process.execPath, ['--check', path.join(ROOT, 'server/live.mjs')], { stdio: 'pipe' }); ok('서버 문법'); }
  catch (e) { no('서버 문법 오류: ' + String(e.stderr || e.message).split('\n')[0]); }
}

/* ② 같은 이름(id) — 뒤의 것이 앞의 것을 덮어 버린다 */
for (const kind of ['defCard', 'defEnemy', 'defRelic', 'defPot', 'defSkill']) {
  const ids = [...html.matchAll(new RegExp(kind + String.raw`\(\{\s*id:\s*'([^']+)'`, 'g'))].map(m => m[1]);
  const seen = new Map(), dup = new Set();
  for (const id of ids) { if (seen.has(id)) dup.add(id); seen.set(id, 1); }
  if (dup.size) no(`${kind} 같은 id ${dup.size}개: ${[...dup].join(', ')}`);
  else ok(`${kind} ${ids.length}개 — id 겹침 없음`);
}

/* ③ 파일에 코드를 그대로 적지 않았는가 — 지문(SHA-256)만 두어야 한다
   코드 조각을 검사에 적어 두면 그것이 곧 새는 것이다 (판 69 전까지 여기에 조각이 적혀 있었다).
   그래서 저장소의 모든 글 파일에서 낱말을 떠, 판이 하는 대로(앞뒤 빈칸 걷고 소문자) 지문을 내어
   판 · 서버에 적힌 열쇠 지문과 맞춰 본다. 맞으면 그 파일에 코드가 그대로 있는 것이다. */
{
  const srv = fs.readFileSync(path.join(ROOT, 'server/live.mjs'), 'utf8');
  const fp = new Map();
  for (const [, n, h] of html.matchAll(/const ([A-Z]+_H\d?)\s*=\s*'([0-9a-f]{64})'/g)) fp.set(h, n);
  for (const [, n, h] of srv.matchAll(/const ([A-Z_]+_SHA)\s*=\s*'([0-9a-f]{64})'/g)) fp.set(h, fp.get(h) || n);
  let files = [];
  try { files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n'); }
  catch (e) { files = ['game/index.html', 'game/mobile.html', 'server/live.mjs']; }
  files = files.filter(f => f && !/\.(png|jpe?g|webp|gif|ico|icns|keystore|jks|ogg|mp3|wav|woff2?|ttf|otf|zip|gz)$/i.test(f));
  const hashOf = new Map(), sum = k => { let h = hashOf.get(k); if (!h) { h = createHash('sha256').update(k).digest('hex'); hashOf.set(k, h); } return h; };
  const hits = []; let nf = 0;
  for (const f of files) {
    let t; try { t = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { continue; }
    nf++;
    const cand = new Set();
    for (const m of t.matchAll(/[A-Za-z0-9가-힣_\-]{4,80}/g)) cand.add(m[0]);
    for (const m of t.matchAll(/[^\s'"`<>(){}\[\],;=]{4,80}/g)) cand.add(m[0]);
    for (const m of t.matchAll(/(['"`])([^'"`\n]{4,80})\1/g)) cand.add(m[2]);
    const got = new Set();
    for (const c of cand) { const n = fp.get(sum(c.trim().toLowerCase())); if (n) got.add(n); }
    for (const n of got) hits.push(`${f} 에 ${n} 의 코드`);
  }
  if (fp.size < 8) no(`열쇠 지문을 다 찾지 못했다 (${fp.size}개) — 지문 이름이 바뀌었는가`);
  if (/baekya-(admin|cast|taste|guest)-[a-z0-9]{6,}/.test(html + srv)) hits.push('옛 코드 꼴(baekya-…)');
  if (hits.length) no('코드가 파일에 그대로 적혀 있다: ' + hits.join(' · '));
  else ok(`관리자·퍼뜨리기 코드가 파일에 없다 — 글 파일 ${nf}개 · 낱말 ${hashOf.size}개를 열쇠 지문 ${fp.size}개와 맞춰 봄`);
}

/* ④ 지어 낸 판 — build-apps 가 낸 것도 문법이 서는가 (손전화판 mobile.html 포함) */
{
  const built = ['game/mobile.html', 'dist/web/index.html', 'dist/web/mobile.html', 'app/android/www/index.html', 'app/desktop/app/index.html']
    .map(f => path.join(ROOT, f)).filter(f => fs.existsSync(f) && f !== FILE);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bgb-')); const broken = [];
  for (const f of built) {
    const src = fs.readFileSync(f, 'utf8');
    [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
      const j = path.join(tmp, `b${i}.js`); fs.writeFileSync(j, m[1]);
      try { execFileSync(process.execPath, ['--check', j], { stdio: 'pipe' }); }
      catch (e) { broken.push(`${path.relative(ROOT, f)} 스크립트 ${i + 1}: ` + String(e.stderr || e.message).split('\n').slice(0, 2).join(' ')); }
    });
    if (/dist|app[\\/]/.test(path.relative(ROOT, f)) && !/window\.__EDITION=/.test(src)) broken.push(`${path.relative(ROOT, f)} 에 판 표지(__EDITION)가 없다`);
  }
  if (!built.length) ok('지어 낸 판 — 아직 짓지 않았다 (node game/build-apps.mjs)');
  else if (broken.length) broken.slice(0, 6).forEach(no);
  else ok(`지어 낸 판 ${built.length}개 — 문법 · 판 표지`);
}

/* ⑤ 무게 — 그림을 통째로 박아 넣는 따위로 판이 갑자기 무거워지지 않았는가 */
{
  const LIMIT = 5 * 1048576, kb = Math.round(Buffer.byteLength(html) / 1024);
  const big = [...html.matchAll(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{150000,}/g)].length;
  if (Buffer.byteLength(html) > LIMIT) no(`판이 ${kb}KB — 한도 ${LIMIT / 1048576}MB 를 넘었다`);
  else if (big) no(`판에 150KB 가 넘는 그림 덩이(data:…base64)가 ${big}개 — vendor/ 나 따로 둔 파일로`);
  else ok(`판 무게 ${kb}KB — 한도 ${LIMIT / 1048576}MB 의 ${Math.round(Buffer.byteLength(html) / LIMIT * 100)}%`);
}

if (QUICK) finish();

/* ══ 브라우저로 켜서 보는 검사 ══════════════════════════ */
console.log('■ 켜서 보는 검사');
const { chromium } = await import('playwright-core');
const EXE = process.env.CHROME || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome']
  .find(p => fs.existsSync(p));
const b = await chromium.launch(Object.assign({ args: ['--no-sandbox', '--mute-audio'] }, EXE ? { executablePath: EXE } : {}));
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
/* 판 74 — 보호막(CSP)에 걸린 것을 센다: 판이 스스로 막히면 어딘가 깨진 것이다 */
const cspHits = [];
p.on('console', m => { if (/Content Security Policy|Refused to (load|connect|execute|apply)/.test(m.text())) cspHits.push(m.text().slice(0, 140)); });
await p.route('https://**', r => r.abort());          /* 바깥 서버에는 가지 않는다 */
const t0 = Date.now();
await p.goto('file://' + FILE);
await p.waitForSelector('#title-scene', { timeout: 20000 }).catch(() => {});
const bootMs = Date.now() - t0;
/* 첫 화면까지 — 느린 기계(검사 서버)에서도 8초 안 · 켠 뒤 기억은 300MB 아래 */
const heap = await p.evaluate(() => (performance.memory || {}).usedJSHeapSize || 0);
bootMs < 8000 ? ok(`첫 화면까지 ${(bootMs / 1000).toFixed(1)}초`) : no(`첫 화면까지 ${(bootMs / 1000).toFixed(1)}초 — 8초를 넘었다`);
heap < 300 * 1048576 ? ok(`켠 뒤 기억 ${Math.round(heap / 1048576)}MB`) : no(`켠 뒤 기억 ${Math.round(heap / 1048576)}MB — 너무 무겁다`);
await p.waitForTimeout(1200);

const r = await p.evaluate(async () => {
  const out = { boot: !!document.querySelector('#title-scene'), probs: [] };
  const P = m => out.probs.push(m);
  /* 조우표 — 부르는 요괴가 다 있는가 */
  for (const act in ENCOUNTERS) for (const k in ENCOUNTERS[act]) {
    const list = ENCOUNTERS[act][k];
    for (const g of list) for (const id of [].concat(g)) if (!ENEMIES[id]) P(`${act}막 ${k}: 없는 요괴 ${id}`);
  }
  /* 요괴의 수 — next() 가 고르는 수가 실제로 있는가 (몇 번 굴려 본다) */
  for (const id in ENEMIES) {
    const d = ENEMIES[id]; if (!d.moves || !d.next || d.duel) continue;
    for (let i = 0; i < 12; i++) {
      const e = { hist: i ? [Object.keys(d.moves)[i % Object.keys(d.moves).length]] : [], turnCount: i, s: {}, hp: 50, maxHp: 100, def: d };
      if (d.init) try { d.init(e); } catch (x) {}
      let k; try { k = d.next(e); } catch (x) { P(`${id}.next 오류 ${x.message}`); break; }
      if (!d.moves[k] && !(typeof AWAKEN_MOVES === 'object' && AWAKEN_MOVES[k])) { P(`${id} 가 없는 수 ${k} 를 고른다`); break; }
    }
  }
  /* 부적 — 글과 효과가 있는가 */
  for (const id in CARDS) {
    const c = CARDS[id];
    if (!c.n || !c.rar || !GRADE[c.rar]) P(`부적 ${id}: 이름·등급이 이상하다`);
    try { const v = c.v ? c.v(false) : {}; if (c.txt) c.txt(v); } catch (x) { P(`부적 ${id} 글 오류 ${x.message}`); }
  }
  /* 공지사항의 코드가 실제로 받아지는가 */
  for (const n of NEWS) if (n.code && !CODES[codeKey(n.code)]) P(`공지 ${n.id} 의 코드 ${n.code} 가 없다`);
  /* 모험을 열고, 지도 → 싸움 → 자동으로 몇 차례 */
  META.tutorDone = true; META.tourDone = true; saveMeta();
  SPEED = 0.02;
  newRun(0); document.querySelectorAll('.story,.tour').forEach(x => x.remove()); closeOverlay(); showMap();
  out.map = document.querySelectorAll('.mapnode.avail').length;
  for (const act of [1, 5, 12, 25]) {
    G.run.act = act;
    const e = ENCOUNTERS[act];
    for (const kind of ['normal', 'elite', 'boss']) {
      const ids = kind === 'boss' ? [e.boss[0]] : e[kind][0];
      startBattle(ids, kind);
      for (let i = 0; i < 400 && G.b && !G.b.over; i++) {
        if (!G.b.busy) { try { autoBattleStep(); } catch (x) { P(`${act}막 ${kind} 자동 오류 ${x.message}`); break; } }
        await new Promise(r => setTimeout(r, 5));
        if (G.b && G.b.turn > 6) break;
      }
      G.b = null; battleWatch(false); closeOverlay(); showMap();
      G.run.hp = G.run.maxHp;
    }
  }
  showTitle();
  out.title = !!document.querySelector('#title-scene');
  return out;
});
r.boot ? ok('켜자마자 첫 화면') : no('첫 화면이 안 뜬다');
r.map > 0 ? ok(`지도 — 갈 칸 ${r.map}개`) : no('지도에 갈 칸이 없다');
if (r.probs.length) r.probs.slice(0, 20).forEach(no); else ok('조우표·요괴의 수·부적 글·공지 코드');
r.title ? ok('싸움 여러 판 뒤 첫 화면으로') : no('첫 화면으로 못 돌아온다');
const realErr = errs.filter(e => !/Failed to fetch|NetworkError|net::/.test(e));
if (realErr.length) realErr.slice(0, 8).forEach(e => no('오류: ' + e)); else ok('켜고 싸우는 동안 오류 없음');
{ const csp = await p.evaluate(() => { const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]'); return m ? m.content : ''; }).catch(() => '');
  csp && /object-src 'none'/.test(csp) && /connect-src[^;]*onrender\.com/.test(csp) && !/connect-src[^;]*\*/.test(csp)
    ? ok('보호막(CSP) — 게임 서버하고만 말한다 · 플러그인 · 틀 막힘') : no('보호막(CSP)이 없거나 느슨하다');
  cspHits.length ? cspHits.slice(0, 5).forEach(t => no('보호막에 걸림: ' + t)) : ok('보호막에 걸린 것 없음'); }
await b.close();

/* ── 서버가 서고 답하는가 ── */
{
  const port = 10000 + Math.floor(Math.random() * 5000);
  const srv = spawn(process.execPath, [path.join(ROOT, 'server/live.mjs')],
                    { env: Object.assign({}, process.env, { PORT: String(port), CAST_CODE: 'x' }), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  try {
    const h = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    const l = await (await fetch(`http://127.0.0.1:${port}/live`)).json();
    const pay = await fetch(`http://127.0.0.1:${port}/pay/creem`, { method: 'POST', body: '{"checkout_id":"x"}' });
    (h.ok && l.now && pay.status === 503) ? ok('서버 — 서고, 소식을 주고, 설정 없이는 결제를 내주지 않는다')
      : no('서버 답이 이상하다');
  } catch (e) { no('서버가 서지 않는다: ' + e.message); }
  srv.kill();
}
finish();

function finish() {
  console.log(bad.length ? `\n■ 고칠 것 ${bad.length}개` : '\n■ 모두 통과');
  /* GitHub 검사 화면의 요약 칸에 표로 남긴다 (판 69) */
  if (process.env.GITHUB_STEP_SUMMARY) try {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 올리기 전 검사\n\n| | 항목 |\n|---|---|\n${bad.map(m => `| ✗ | ${m.replace(/\|/g, '\\|')} |`).concat(good.map(m => `| ○ | ${m.replace(/\|/g, '\\|')} |`)).join('\n')}\n\n**통과 ${good.length} · 고칠 것 ${bad.length}**\n\n`);
  } catch (e) {}
  process.exit(bad.length ? 1 : 0);
}
