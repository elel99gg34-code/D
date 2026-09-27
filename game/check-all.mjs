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
   node game/check-all.mjs          — 다 본다
   node game/check-all.mjs 빠르게   — 브라우저 없이 글만 본다
   ══════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FILE = process.env.CHECK_FILE || path.join(HERE, 'index.html');
const QUICK = process.argv.includes('빠르게') || process.argv.includes('--quick');
const html = fs.readFileSync(FILE, 'utf8');
const bad = [];
const ok = m => console.log('  ○ ' + m);
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

/* ③ 파일에 코드를 그대로 적지 않았는가 — 지문(SHA-256)만 두어야 한다 */
{
  const leaks = [/cdminjuvv/, /031675mj/, /0316bakgi75/, /baekya-(admin|cast|taste)-[a-z0-9]{6,}/];
  const hit = leaks.filter(re => re.test(html) || re.test(fs.readFileSync(path.join(ROOT, 'server/live.mjs'), 'utf8')));
  if (hit.length) no('코드가 파일에 그대로 적혀 있다: ' + hit.map(String).join(' '));
  else ok('관리자·퍼뜨리기 코드가 파일에 없다');
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
await p.route('https://**', r => r.abort());          /* 바깥 서버에는 가지 않는다 */
await p.goto('file://' + FILE);
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
  process.exit(bad.length ? 1 : 0);
}
