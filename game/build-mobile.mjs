/* ══════════════════════════════════════════════════════════
   mobile.html 을 짓는다
   ──────────────────────────────────────────────────────────
   index.html 을 그대로 읽어 「손전화 겉옷」 한 겹만 덧대어
   game/mobile.html 로 내놓는다. 알맹이는 건드리지 않으므로
   index.html 을 고치면 이것만 다시 돌리면 된다.

     node game/build-mobile.mjs

   덧대는 것은 두 가지뿐이다.
     · 좁은 화면용 CSS — 카드·요괴·단추를 줄이고 자리를 다시 잡는다
     · 손가락용 JS — 겨냥선, 고르기 물리기, 두 번 눌러 확대 막기,
                     세로일 때 「돌려 주세요」 알림, 파편 상한 낮추기
   ══════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, 'index.html');
const OUT = join(here, 'mobile.html');

const MOBILE_CSS = `
/* ══════════════════════════════════════════════════════════
   손전화 겉옷 — 좁은 화면에서 판이 넘치지 않게
   ══════════════════════════════════════════════════════════ */
html, body { overscroll-behavior: none; -webkit-text-size-adjust: 100%; }
body { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
/* 홈 표시줄·노치를 피한다 */
#app { padding: env(safe-area-inset-top) env(safe-area-inset-right)
              env(safe-area-inset-bottom) env(safe-area-inset-left); box-sizing: border-box; }

/* 손가락에는 hover 가 없다 — 마우스를 올려야 뜨던 것들을 끈다 */
@media (hover: none) {
  .unit.targetable:hover .body { filter: none; }
  #endturn:hover, #skillbtn:hover, #petbtn:hover { transform: none; }
  #tip { display: none !important; }          /* 말풍선은 손가락을 가린다 */
}

/* ── 좁거나 낮은 화면 ─────────────────────────────────── */
@media (max-width: 1000px), (max-height: 560px) {
  :root { --cw: 96px; --ch: 134px; }
  #topbar { height: 42px; gap: 6px; padding: 0 8px; overflow-x: auto; overflow-y: hidden;
            scrollbar-width: none; }
  #topbar::-webkit-scrollbar { display: none; }
  #topbar .grp { font-size: 13px; gap: 5px; }
  #topbar .lbl { display: none; }
  .topbtn { width: 34px !important; height: 34px !important; font-size: 15px !important; flex: 0 0 auto; }
  #relicbar { min-width: 40px; }

  #field { top: 42px; bottom: 176px; padding: 0 8px; align-items: flex-start; }
  #pside { width: 118px; gap: 4px; padding-top: 4px; }
  #eside { gap: 12px; padding-bottom: 2px; align-items: flex-start; padding-top: 4px; }
  .unit .body { width: 84px; height: 84px; }
  .unit.big .body { width: 108px; height: 108px; }
  .unit .body .glyph { font-size: 30px; }
  .unit.big .body .glyph { font-size: 40px; }
  .unit .nm { font-size: 11px; }
  .unit .ebar { width: 84px; height: 11px; }
  .unit .ebar b { font-size: 9px; }
  .intent { height: 24px; font-size: 14px; gap: 3px; }
  .intent svg { width: 20px; height: 20px; }
  .unit .prev { height: 17px; font-size: 12px; }

  #hud { height: 176px; }
  .card .art { flex: 0 0 34px; margin: 3px 0; }
  .card .art .g { font-size: 23px; }
  .card .art .ring { width: 34px; height: 34px; }
  .card .cname { font-size: 11px; margin-top: 5px; }
  .card .txt { font-size: 10px; line-height: 1.4; }
  .card .txt.long { font-size: 9.2px; }
  .card .txt.xlong { font-size: 8.6px; }
  .card .kind { font-size: 8.5px; }
  .card .cost { width: 27px; height: 27px; left: -7px; top: -7px; font-size: 14px; }
  .card .grade { transform: scale(.8); transform-origin: top right; }

  #energy { left: 62px; bottom: 62px; width: 54px; height: 54px; font-size: 16px; }
  #energy small { font-size: 10px; }
  #skillbtn { left: 8px; bottom: 66px; width: 50px; height: 50px; }
  #skillbtn b { font-size: 19px; } #skillbtn small { font-size: 8px; }
  #petbtn { left: 8px; bottom: 124px; width: 50px; height: 46px; }
  #petbtn b { font-size: 18px; } #petbtn small { font-size: 8px; max-width: 40px; }
  #endturn { right: 10px; bottom: 58px; padding: 11px 16px; font-size: 14px; }
  #autobtn { right: 10px; bottom: 106px; padding: 7px 11px; font-size: 12px; }
  #blogbtn { right: 10px; top: 50px; width: 32px; height: 32px; }
  #coldeckbtn { right: 48px; top: 50px; padding: 5px 9px; font-size: 11px; }
  .pile { width: 46px; height: 46px; font-size: 9px; }
  .pile b { font-size: 15px; }

  /* 창들 — 손전화에서는 화면을 거의 다 쓴다 */
  #overlay > * { max-width: 96vw; max-height: 92vh; padding: 16px 14px; }
  #overlay h2 { font-size: 20px; margin-bottom: 6px; }
  #overlay .hint { font-size: 11.5px; }
  .shopgrid { flex-direction: column; gap: 10px; }
  .shopcol .cardgrid, .shopcol .rewardrow { width: auto !important; max-width: 92vw !important;
    max-height: 34vh !important; }
  .rewardrow { flex-wrap: wrap; }
  .brush-btn { padding: 10px 16px; font-size: 14px; min-height: 40px; }
  .cardgrid { gap: 8px; }
  /* 지도 — 칸과 이름표를 손가락에 맞게 */
  .mapnode { width: 46px; height: 46px; margin: -23px 0 0 -23px; font-size: 19px; }
  .mapnode b { font-size: 9.5px; top: calc(100% + 4px); }
  #maphead .actsub { font-size: 10px; }
}

/* ── 더 좁은 화면(세로 손전화) ────────────────────────── */
@media (max-width: 560px) {
  :root { --cw: 84px; --ch: 118px; }
  #eside { gap: 8px; }
  .unit .body { width: 68px; height: 68px; }
  .unit .body .glyph { font-size: 25px; }
  .unit .ebar { width: 70px; }
  #hud { height: 158px; }
  #field { bottom: 158px; }
  #pside { width: 92px; }
}

/* ── 세로로 들었을 때 — 위아래로 쌓는다 ────────────────── */
@media (orientation: portrait) and (max-width: 620px) {
  /* 윗줄은 두 줄까지 접힌다 — 옆으로 밀어야 보이던 단추들을 앉힌다 */
  #topbar { height: auto; min-height: 40px; flex-wrap: wrap; row-gap: 4px;
            padding: 5px 8px; overflow: visible; }
  #battle { padding-top: 84px; }
  #field { top: 84px; }
  #scene > #map, #scene > .lobby { padding-top: 34px; }

  /* 요괴가 위, 나는 그 아래 — 옆으로 나란히는 자리가 없다 */
  #field { flex-direction: column-reverse; justify-content: flex-end;
           align-items: center; gap: 6px; }
  #pside { width: auto; flex-direction: row; align-items: center; gap: 10px; }
  #pside .unit { flex-direction: row; gap: 8px; }
  #eside { flex: none; width: 100%; flex-wrap: wrap; justify-content: center;
           gap: 10px 14px; padding-top: 2px; }

  /* 「당신의 차례」가 판을 다 덮었다 */
  #turnlabel { font-size: 26px; letter-spacing: .18em; top: 46%; }

  /* ── 아래 판을 세 층으로 나눈다 ─────────────────────────
     ┌ 기합 · 기 · 팻 ────────────────── 자동 ┐
     │            부적 다섯 장            │
     └ 뽑을 더미 ── 턴 종료 ── 버린 더미 ─────┘
     옆으로 늘어놓을 자리가 없으니 위아래로 쌓는다.
     ──────────────────────────────────────────────────── */
  #hud { height: 220px; }
  #field { bottom: 220px; }
  .card { top: 44px; }

  #skillbtn { left: 8px;   bottom: 180px; width: 44px; height: 40px; }
  #petbtn   { left: 58px;  bottom: 180px; width: 44px; height: 40px; }
  #energy   { left: 108px; bottom: 180px; width: 44px; height: 40px;
              border-radius: 12px; font-size: 15px; }
  #energy small { font-size: 9px; }
  #skillbtn b { font-size: 17px; } #skillbtn small { font-size: 7.5px; }
  #petbtn b { font-size: 16px; } #petbtn small { font-size: 7.5px; max-width: 36px; }
  #autobtn { right: 8px; bottom: 184px; padding: 6px 9px; font-size: 11px; }

  #pilebar { height: 56px; padding: 0 8px; }
  .pile { width: 44px; height: 44px; font-size: 8px; }
  .pile b { font-size: 14px; }
  #endturn { left: 50%; right: auto; bottom: 8px; width: 44vw;
             padding: 12px 0; text-align: center; font-size: 14px;
             transform: translateX(-50%); }
  #endturn:hover, #endturn:disabled, #endturn:active { transform: translateX(-50%); }
}

/* ── 세로로 들었을 때 — 돌리라고 한 번 일러 준다 ───────── */
#rotate {
  position: fixed; inset: 0; z-index: 200; display: none;
  background: rgba(12, 10, 8, .93); color: #e9dfc9;
  flex-direction: column; align-items: center; justify-content: center; gap: 18px;
  text-align: center; padding: 30px; letter-spacing: .06em;
}
#rotate.on { display: flex; }
#rotate .ph { width: 76px; height: 128px; border: 3px solid #c8a94e; border-radius: 12px;
  animation: rotSpin 2.2s ease-in-out infinite; }
@keyframes rotSpin { 0%,30% { transform: rotate(0) } 60%,100% { transform: rotate(-90deg) } }
#rotate b { font-size: 19px; color: #f2e6c4; font-weight: 400; }
#rotate span { font-size: 13px; color: #a89a80; line-height: 1.8; }
#rotate button { margin-top: 4px; padding: 11px 22px; border-radius: 6px; font-size: 14px;
  background: rgba(255,255,255,.08); border: 1px solid rgba(200,180,140,.35); color: #e9dfc9; }
`;

const MOBILE_JS = `
/* ══════════════════════════════════════════════════════════
   손전화용 한 겹 — 알맹이는 건드리지 않는다
   ══════════════════════════════════════════════════════════ */
(function () {
  const touch = matchMedia('(hover: none)').matches || 'ontouchstart' in window;

  /* ① 겨냥선이 손가락을 따라오게 —
        본판은 mousemove 만 듣는다. 손가락에는 그것이 없다. */
  const follow = e => {
    const t = e.touches && e.touches[0];
    const x = t ? t.clientX : e.clientX, y = t ? t.clientY : e.clientY;
    if (x == null) return;
    mouseXY.x = x; mouseXY.y = y;
    if (typeof updateArrow === 'function') updateArrow();
  };
  addEventListener('touchstart', follow, { passive: true });
  addEventListener('touchmove', follow, { passive: true });
  addEventListener('pointerdown', follow, { passive: true });

  /* ② 고르기 물리기 — 오른쪽 단추가 없으니 빈 곳을 누르면 풀린다 */
  addEventListener('pointerdown', e => {
    if (!G.b || (!G.b.sel && G.b.potSel == null)) return;
    const t = e.target;
    if (!t || typeof t.closest !== 'function') return;   /* 화면 밖에서 온 것 */
    if (t.closest('.card, .unit, #hud, #overlay, #topbar, .brush-btn')) return;
    G.b.sel = null; hideArrow();
    try { syncHand(); syncEnemies(); } catch (err) {}
  });

  /* ③ 두 번 두드려 확대하는 것과 당겨 새로 고치는 것을 막는다 */
  let lastTap = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - lastTap < 320) e.preventDefault();
    lastTap = now;
  }, { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());

  /* ④ 손전화는 파편을 덜 뿌린다 — 프레임이 눈에 띄게 산다 */
  if (touch) { try { FX_CAP = Math.min(FX_CAP, 90); } catch (e) {} }

  /* ⑤ 세로로 들면 한 번 일러 준다 (닫으면 그 판에서는 다시 안 뜬다) */
  const box = document.createElement('div');
  box.id = 'rotate';
  box.innerHTML = '<div class="ph"></div>' +
    '<b>가로로 돌려 주십시오</b>' +
    '<span>부적을 늘어놓을 자리가 있어야 합니다.<br>세로로도 할 수는 있습니다.</span>' +
    '<button id="rot_ok">이대로 한다</button>';
  document.body.appendChild(box);
  let hushed = false;
  box.querySelector('#rot_ok').onclick = () => { hushed = true; box.classList.remove('on'); };
  const look = () => {
    const portrait = innerHeight > innerWidth;
    box.classList.toggle('on', portrait && !hushed && innerWidth < 620);
  };
  addEventListener('resize', look);
  addEventListener('orientationchange', () => setTimeout(look, 240));
  look();

  /* ⑥ 주소창이 오르내려도 판이 잘리지 않게 — 실제 높이를 쓴다 */
  const vh = () => document.documentElement.style.setProperty('--vh', innerHeight * 0.01 + 'px');
  addEventListener('resize', vh); vh();
})();
`;

const src = readFileSync(SRC, 'utf8');
if (!src.includes('</style>\n</head>')) {
  console.error('index.html 의 생김새가 달라졌다 — </style></head> 를 찾지 못했다');
  process.exit(1);
}
if (!src.includes('</body>')) {
  console.error('index.html 에서 </body> 를 찾지 못했다');
  process.exit(1);
}

let out = src.replace('</style>\n</head>', '</style>\n<style>' + MOBILE_CSS + '</style>\n</head>');
/* 마지막 </body> 앞에 넣는다 */
const at = out.lastIndexOf('</body>');
out = out.slice(0, at) + '<script>' + MOBILE_JS + '<\/script>\n' + out.slice(at);
/* 제목만 살짝 다르게 — 어느 쪽을 열었는지 알아보게 */
out = out.replace('<title>', '<title>[손전화] ');

writeFileSync(OUT, out);
console.log('mobile.html 지었다 ·', (out.length / 1024).toFixed(0) + 'KB',
  '(index.html 보다', ((out.length - src.length) / 1024).toFixed(1) + 'KB 큼)');
