/* ══════════════════════════════════════════════════════════
   앱 그림을 그린다 — 아이콘과 첫 화면
   ──────────────────────────────────────────────────────────
     node game/build-icons.mjs

   게임 제목 옆에 찍힌 붉은 도장을 그대로 쓴다. 작게 줄여도
   알아볼 수 있어야 하므로 아이콘에는 글자 하나(鬼)만 크게 넣고,
   네 글자(百鬼夜行)는 첫 화면에만 쓴다.

   내놓는 것
     app/android/assets/icon.png             1024  통짜
     app/android/assets/icon-foreground.png  1024  글자만 (안드로이드가 오려낸다)
     app/android/assets/icon-background.png  1024  바탕만
     app/android/assets/splash.png           2732  첫 화면
     app/android/assets/splash-dark.png      2732  어두운 첫 화면
     app/desktop/build/icon.png              1024  electron-builder 가 ico·icns 로 옮긴다

   안드로이드는 아이콘을 동그라미로도 오려 내므로, 글자는 가운데
   66% 안에 둔다. 그러지 않으면 모서리가 잘려 나간다.
   ══════════════════════════════════════════════════════════ */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const EXE = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const RED = '#a8272c', INK = '#17130f', PAPER = '#e9dfc9';
const FONT = "'WenQuanYi Zen Hei','Noto Sans CJK KR','Apple SD Gothic Neo',serif";

/* 붉은 바탕 — 가운데가 조금 밝고 가장자리가 가라앉는다 */
const field = (w, c1, c2) => `
  <rect width="${w}" height="${w}" fill="${c1}"/>
  <radialGradient id="v" cx="50%" cy="42%" r="72%">
    <stop offset="0" stop-color="#fff" stop-opacity=".13"/>
    <stop offset="1" stop-color="${c2}" stop-opacity=".45"/>
  </radialGradient>
  <rect width="${w}" height="${w}" fill="url(#v)"/>`;

/* 한 글자를 가운데 크게 */
const oneWord = (w, size, color, dy) => `
  <text x="${w / 2}" y="${w / 2 + (dy || 0)}" fill="${color}" font-family="${FONT}"
        font-size="${size}" text-anchor="middle" dominant-baseline="central">鬼</text>`;

/* 네 글자를 두 줄로 — 도장처럼 */
const fourWords = (w, size, color) => {
  const g = ['百', '鬼', '夜', '行'], gap = size * 1.06;
  return g.map((ch, i) => {
    const x = w / 2 + (i % 2 ? gap / 2 : -gap / 2);
    const y = w / 2 + (i < 2 ? -gap / 2 : gap / 2);
    return `<text x="${x}" y="${y}" fill="${color}" font-family="${FONT}"
              font-size="${size}" text-anchor="middle" dominant-baseline="central">${ch}</text>`;
  }).join('');
};

const PAGE = (w, body) => `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}" viewBox="0 0 ${w} ${w}">${body}</svg>`;

const SHOTS = [
  { to: 'app/android/assets/icon.png', w: 1024, clear: false,
    body: w => field(w, RED, '#5c1114') + oneWord(w, w * 0.52, '#fff', w * 0.01) },
  { to: 'app/android/assets/icon-background.png', w: 1024, clear: false,
    body: w => field(w, RED, '#5c1114') },
  /* 오려 낼 것을 헤아려 글자를 조금 작게 — 동그라미로 잘려도 남는다 */
  { to: 'app/android/assets/icon-foreground.png', w: 1024, clear: true,
    body: w => oneWord(w, w * 0.40, '#fff', w * 0.01) },
  { to: 'app/desktop/build/icon.png', w: 1024, clear: false,
    body: w => field(w, RED, '#5c1114') + oneWord(w, w * 0.52, '#fff', w * 0.01) },
  { to: 'app/android/assets/splash.png', w: 2732, clear: false,
    body: w => `<rect width="${w}" height="${w}" fill="${INK}"/>
      <rect x="${w / 2 - w * 0.085}" y="${w / 2 - w * 0.085}" width="${w * 0.17}" height="${w * 0.17}"
            rx="${w * 0.008}" fill="${RED}" transform="rotate(-6 ${w / 2} ${w / 2})"/>
      <g transform="rotate(-6 ${w / 2} ${w / 2})">${fourWords(w, w * 0.062, '#fff')}</g>` },
  { to: 'app/android/assets/splash-dark.png', w: 2732, clear: false,
    body: w => `<rect width="${w}" height="${w}" fill="#000"/>
      <rect x="${w / 2 - w * 0.085}" y="${w / 2 - w * 0.085}" width="${w * 0.17}" height="${w * 0.17}"
            rx="${w * 0.008}" fill="${RED}" transform="rotate(-6 ${w / 2} ${w / 2})"/>
      <g transform="rotate(-6 ${w / 2} ${w / 2})">${fourWords(w, w * 0.062, PAPER)}</g>` }
];

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
for (const s of SHOTS) {
  const page = await browser.newPage({ viewport: { width: s.w, height: s.w },
                                       deviceScaleFactor: 1 });
  await page.setContent(PAGE(s.w, s.body(s.w)));
  await page.waitForTimeout(120);                       /* 글꼴이 자리를 잡을 틈 */
  const buf = await page.screenshot({ omitBackground: s.clear });
  const to = join(ROOT, s.to);
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, buf);
  console.log(`${s.to} · ${s.w}px · ${(buf.length / 1024).toFixed(0)}KB`);
  await page.close();
}
await browser.close();
console.log('그림 다 그렸다');
