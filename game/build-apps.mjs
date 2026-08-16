/* ══════════════════════════════════════════════════════════
   한 벌의 알맹이에서 여러 판을 짓는다
   ──────────────────────────────────────────────────────────
     node game/build-apps.mjs

   짓는 것
     dist/web/index.html      웹 체험판 (넓은 화면)
     dist/web/mobile.html     웹 체험판 (손전화)
     dist/android/index.html  안드로이드 전체판 — Capacitor 가 감쌀 것
     dist/desktop/index.html  데스크톱 전체판 — Electron 이 감쌀 것

   하는 일은 두 가지뿐이다.
     ① index.html 앞머리에 window.__EDITION / __PLAT 을 심는다
     ② 손전화용은 build-mobile 의 겉옷을 한 겹 덧댄다

   알맹이(index.html)는 건드리지 않는다. 무엇이 다른지는 게임
   안의 DEMO · PLAT 두 낱말이 알아서 가른다.
   ══════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const here = dirname(fileURLToPath(import.meta.url));
const SRC  = join(here, 'index.html');
const DIST = join(here, '..', 'dist');

/* 손전화 겉옷은 build-mobile 이 가지고 있다 — 그것을 그대로 쓴다 */
execFileSync(process.execPath, [join(here, 'build-mobile.mjs')], { stdio: 'ignore' });
/* 줄바꿈은 LF 로 고른다 — 윈도우에서 받으면 CRLF 가 되어 찾기가 어긋난다 */
const lf = f => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const wide   = lf(SRC);
const narrow = lf(join(here, 'mobile.html'));

/* 알맹이가 시작되는 자리 바로 앞에 심는다 — 게임이 읽기 전이어야 한다 */
const MARK = '<script>\n"use strict";';
for (const [name, html] of [['index', wide], ['mobile', narrow]]) {
  if (!html.includes(MARK)) {
    console.error(`${name} 에서 알맹이가 시작되는 자리를 찾지 못했다`);
    process.exit(1);
  }
}

function stamp(html, edition, plat) {
  const head = `<script>window.__EDITION=${JSON.stringify(edition)};` +
               `window.__PLAT=${JSON.stringify(plat)};<\/script>\n`;
  return html.replace(MARK, head + MARK);
}

/* 껍데기가 기다리는 자리에 곧장 써 넣는다 — 옮기는 일을 셸에 맡기면
   윈도우에서 cp·rm 이 없어 무너진다. 여기서 다 끝낸다. */
const APP = join(here, '..', 'app');
const PLANS = [
  { to: join(DIST, 'web', 'index.html'),          html: wide,   edition: 'demo', plat: 'web' },
  { to: join(DIST, 'web', 'mobile.html'),         html: narrow, edition: 'demo', plat: 'web' },
  { to: join(APP, 'android', 'www', 'index.html'), html: narrow, edition: 'full', plat: 'android' },
  { to: join(APP, 'desktop', 'app', 'index.html'), html: wide,   edition: 'full', plat: 'desktop' }
];

rmSync(DIST, { recursive: true, force: true });
for (const p of PLANS) {
  const out = stamp(p.html, p.edition, p.plat);
  mkdirSync(dirname(p.to), { recursive: true });
  writeFileSync(p.to, out);
  console.log(`${relative(join(here, '..'), p.to)} · ${p.edition} · ${p.plat} · ${(out.length / 1024).toFixed(0)}KB`);
}

/* 웹 체험판은 없는 자리로 들어와도 첫 자리로 돌려보낸다 */
writeFileSync(join(DIST, 'web', '404.html'),
  '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/">');
console.log('다 지었다');
