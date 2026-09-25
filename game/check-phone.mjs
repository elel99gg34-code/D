/* ══════════════════════════════════════════════════════════
   손전화 판을 재어 본다
   ──────────────────────────────────────────────────────────
   안드로이드 폰 크기 몇 가지로 판을 세우고, 누를 것들이
     ① 제스처 막대에 깔리지 않는가
     ② 손가락이 닿을 만큼 큰가
     ③ 서로 겹치지 않는가
     ④ 화면 밖으로 나가지 않는가
     ⑤ 좌우가 한쪽으로 쏠리지 않는가
   를 본다.

   제스처 막대 — 요즘 안드로이드는 아래 가운데에 막대가 있고,
   그 둘레 48dp 는 시스템이 쓸어 넘기는 자리다. 거기에 단추를
   두면 눌리지 않거나 홈으로 나가 버린다.
   ══════════════════════════════════════════════════════════ */
import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FILE = process.argv[2] || '/home/user/D/app/android/www/index.html';

/* 시스템이 이미 자리를 떼어 둔 기계라면 판 끝이 곧 막대 위이므로
   가장자리만 살피면 되고, 끝까지 뻗는 기계라면 48px 을 비워야 한다. */
const GESTURE = process.argv[3] === '실제' ? 48 : 12;
const MIN_TAP = 44;        /* 손가락이 닿을 최소 크기 */

const SIZES = [
  { n: '갤럭시 S23 세로', w: 360, h: 780 },
  { n: '픽셀 7 세로',     w: 412, h: 915 },
  { n: '작은 폰 세로',    w: 360, h: 640 },
  { n: '갤럭시 S23 가로', w: 780, h: 360 },
  { n: '픽셀 7 가로',     w: 915, h: 412 },
  { n: '작은 폰 가로',    w: 640, h: 360 }
];

/* 누를 수 있는 것들 — 전투 화면에 실제로 뜨는 것 */
const WANT = ['#endturn', '#skillbtn', '#petbtn', '#energy', '#autobtn',
              '#drawpile', '#discardpile', '.card'];

/* 기계가 안전여백을 일러 주는 때와 아닌 때가 다르다.
     0  — 판이 이미 막대 위에서 끝난다 (시스템이 자리를 떼어 둠)
     48 — 판이 화면 끝까지 뻗는다 (edge-to-edge). 이때가 위험하다.
   브라우저는 늘 0 이므로, 48 인 척도 해 보고 둘 다 본다. */
const INSET = process.argv[3] === '실제' ? 48 : 0;

const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--mute-audio'] });
let bad = 0, warn = 0;
console.log(INSET ? '■ 화면 끝까지 뻗는 기계인 척 (safe-area 48px)'
                  : '■ 시스템이 자리를 떼어 둔 기계 (safe-area 0)');

for (const s of SIZES) {
  const page = await b.newPage({ viewport: { width: s.w, height: s.h },
                                 deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  if (INSET) await page.addStyleTag({ content: `:root{--gb:${INSET}px !important}` })
    .catch(() => {});
  await page.goto('file://' + FILE);
  await page.waitForTimeout(700);
  if (INSET) await page.addStyleTag({ content: `:root{--gb:${INSET}px !important}` });

  /* 전투를 세운다 — 컷씬은 건너뛴다 */
  await page.evaluate(() => {
    localStorage.clear();
    META.tutorDone = true; META.tourDone = true; saveMeta();
    newRun(0);
    document.querySelectorAll('.story,.tour,#rotate').forEach(x => x.remove());
    closeOverlay();
    startBattle(pick(ENCOUNTERS[1].normal), 'normal');
  });
  await page.waitForTimeout(1400);

  const r = await page.evaluate(({ WANT, GESTURE, MIN_TAP }) => {
    const W = innerWidth, H = innerHeight;
    const out = { 판: W + '×' + H, 깔림: [], 작음: [], 겹침: [], 밖: [], 쏠림: null, 없음: [] };
    const boxes = [];
    for (const sel of WANT) {
      const list = [...document.querySelectorAll(sel)];
      if (!list.length) { out.없음.push(sel); continue; }
      list.forEach((el, i) => {
        const b = el.getBoundingClientRect();
        if (!b.width || !b.height) return;
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity === 0) return;
        const name = sel + (list.length > 1 ? '[' + i + ']' : '');
        boxes.push({ name, sel, b });

        /* ① 제스처 자리에 깔리는가 — 아래 48px 띠와 겹치고,
              가운데 40% 안에 걸쳐 있으면 위험하다 */
        const inStrip = b.bottom > H - GESTURE;
        const cx = b.left + b.width / 2;
        const midL = W * 0.30, midR = W * 0.70;
        if (inStrip && b.right > midL && b.left < midR)
          out.깔림.push(`${name} 아래 ${Math.round(H - b.bottom)}px · 가운데 걸침`);
        else if (inStrip)
          out.깔림.push(`${name} 아래 ${Math.round(H - b.bottom)}px (가장자리)`);

        /* ② 손가락 크기 — 부적은 겹쳐 놓는 것이라 뺀다 */
        if (sel !== '.card' && (b.width < MIN_TAP || b.height < MIN_TAP))
          out.작음.push(`${name} ${Math.round(b.width)}×${Math.round(b.height)}`);

        /* ④ 화면 밖 */
        if (b.left < -1 || b.top < -1 || b.right > W + 1 || b.bottom > H + 1)
          out.밖.push(`${name} ${Math.round(b.left)},${Math.round(b.top)}` +
                      `~${Math.round(b.right)},${Math.round(b.bottom)}`);
      });
    }
    /* ③ 겹침 — 부적끼리는 일부러 겹친다 */
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const A = boxes[i], B = boxes[j];
        if (A.sel === '.card' && B.sel === '.card') continue;
        const x = Math.min(A.b.right, B.b.right) - Math.max(A.b.left, B.b.left);
        const y = Math.min(A.b.bottom, B.b.bottom) - Math.max(A.b.top, B.b.top);
        if (x > 2 && y > 2) out.겹침.push(`${A.name} × ${B.name} (${Math.round(x)}×${Math.round(y)})`);
      }
    /* ⑤ 좌우 쏠림 — 아래쪽 단추들의 무게중심 */
    const low = boxes.filter(x => x.sel !== '.card' && x.b.top > H * 0.6);
    if (low.length) {
      const c = low.reduce((a, x) => a + (x.b.left + x.b.width / 2), 0) / low.length;
      out.쏠림 = Math.round((c / W) * 100) + '%';
    }
    return out;
  }, { WANT, GESTURE, MIN_TAP });

  const t = [];
  if (r.깔림.length) { t.push('깔림 ' + r.깔림.length); bad += r.깔림.length; }
  if (r.작음.length) { t.push('작음 ' + r.작음.length); warn += r.작음.length; }
  if (r.겹침.length) { t.push('겹침 ' + r.겹침.length); bad += r.겹침.length; }
  if (r.밖.length)   { t.push('밖 ' + r.밖.length);   bad += r.밖.length; }
  console.log(`\n══ ${s.n} (${r.판}) ${t.length ? '✗ ' + t.join(' · ') : '○ 깨끗'} · 쏠림 ${r.쏠림}`);
  for (const k of ['깔림', '작음', '겹침', '밖', '없음'])
    for (const line of r[k].slice(0, 6)) console.log(`   ${k}: ${line}`);
  if (errs.length) console.log('   오류:', errs.slice(0, 2).join(' | '));
  await page.close();
}
console.log(`\n■ 고쳐야 할 것 ${bad} · 살필 것 ${warn}`);
await b.close();
