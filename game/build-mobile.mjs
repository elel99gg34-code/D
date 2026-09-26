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

/* ── 아래를 시스템에 내어 준다 ──────────────────────────
   요즘 안드로이드는 화면 맨 아래 가운데에 제스처 막대가 있고,
   그 둘레는 시스템이 쓸어 넘기는 자리다. 거기에 누를 것을 두면
   눌리지 않거나 홈으로 나가 버린다.

   env(safe-area-inset-bottom) 은 기계가 일러 주는 참값이지만,
   판이 화면 끝까지 뻗지 않는 기계에서는 0 으로 온다. 그래서
   바닥값을 하나 두어 어느 쪽이든 자리가 남게 한다.
   ──────────────────────────────────────────────────────── */
:root { --gb: max(env(safe-area-inset-bottom, 0px), 26px); }
/* 가로로 누우면 막대가 얇아진다 — 높이가 아까우므로 조금만 둔다 */
@media (orientation: landscape) and (max-height: 560px) {
  :root { --gb: max(env(safe-area-inset-bottom, 0px), 20px); }
}
/* 노치·모서리를 피한다 (아래는 --gb 가 따로 맡는다) */
#app { padding: env(safe-area-inset-top) env(safe-area-inset-right)
              0 env(safe-area-inset-left); box-sizing: border-box; }

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

  #field { top: 42px; bottom: calc(176px + var(--gb)); padding: 0 8px; align-items: flex-start; }
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

  /* 판 전체를 제스처 막대 위로 올린다 — 부적 패가 거기 깔리면
     한 장 내려다 홈으로 나가 버린다 */
  #hud { height: calc(176px + var(--gb)); padding-bottom: var(--gb); box-sizing: border-box; }
  #pilebar { bottom: var(--gb); }
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

  #energy { left: 62px; bottom: calc(62px + var(--gb)); width: 54px; height: 54px; font-size: 16px; }
  #energy small { font-size: 10px; }
  #skillbtn { left: 8px; bottom: calc(66px + var(--gb)); width: 50px; height: 50px; }
  #skillbtn b { font-size: 19px; } #skillbtn small { font-size: 8px; }
  #petbtn { left: 8px; bottom: calc(124px + var(--gb)); width: 50px; height: 46px; }
  #petbtn b { font-size: 18px; } #petbtn small { font-size: 8px; max-width: 40px; }
  /* 손가락이 닿을 만큼 — 세로 44px 아래로는 내려가지 않게 */
  #endturn { right: 10px; bottom: calc(58px + var(--gb)); padding: 13px 18px;
             font-size: 14px; min-height: 46px; }
  #autobtn { right: 10px; bottom: calc(114px + var(--gb)); padding: 13px 15px;
             font-size: 12px; min-height: 46px; min-width: 46px; }
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
  /* 보이는 동그라미는 작아도 눌리는 자리는 넓게 — 낮은 가로 폰에서는
     동그라미가 30px 까지 작아진다. 지도째 줄어들므로(0.65배쯤) 그만큼
     더 넓혀 둔다. 칸 사이가 100px 쯤이라 이웃과 겹치지 않는다.
     (::before·::after 는 갈 칸 화살표·테두리 고리가 이미 쓰고 있다) */
  .mapnode .mhit { display: block; inset: -18px; }
  .mapnode b { font-size: 9.5px; top: calc(100% + 4px); }
  #maphead .actsub { font-size: 10px; }
  /* 지도는 끌어서 본다는 것을 알 수 있게 — 가장자리가 흐려진다 */
  #mapstage { -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 22px,
                                    #000 calc(100% - 22px), transparent 100%);
              mask-image: linear-gradient(90deg, transparent 0, #000 22px,
                                    #000 calc(100% - 22px), transparent 100%); }
}
/* 가로로 누운 낮은 화면 — 지도가 설 자리가 170px 밖에 안 됐다.
   머리를 한 줄로 줄이고 범례는 걷는다. 칸 이름으로 알 수 있다. */
@media (max-height: 560px) {
  /* 상단바가 42px 인데 지도는 52px 에서 시작해 10px 을 버리고 있었다 */
  #map { top: 42px; }
  /* 머리가 여러 줄로 쌓여 63px 을 먹었다 — 한 줄로 누른다 */
  #maphead { display: flex; align-items: center; justify-content: center; gap: 10px;
             padding: 3px 0; font-size: 11.5px; letter-spacing: .16em; margin-left: 0; }
  #maphead .actname { display: inline; margin: 0; font-size: 11px; }
  #maphead .actbar { width: 90px; margin: 0; flex: 0 0 auto; }
  #maphead .actsub { display: none; }
  #maplegend { display: none; }
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
  /* 윗줄이 몇 줄로 접히든 판은 그 아래에서 — --tbh 는 본판이 잰 참 높이 */
  #battle { padding-top: var(--tbh, 84px); }
  #field { top: calc(var(--tbh, 84px) + 2px); }
  #scene > #map, #scene > .lobby { padding-top: max(34px, calc(var(--tbh, 84px) - 50px)); }
  #blogbtn { top: calc(var(--tbh, 84px) + 6px); }

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
     └ 뽑을·버린 더미 ───────────── 턴 종료 ┘
     ····· 아래 --gb 만큼은 제스처 막대 몫 ·····

     턴 종료를 한가운데 두었더니 안드로이드 홈 막대에 깔려
     눌리지 않았다. 오른쪽으로 물리고, 더미 둘은 왼쪽으로 모은다.
     엄지가 닿는 자리이기도 하다.
     ──────────────────────────────────────────────────── */
  #hud { height: calc(224px + var(--gb)); padding-bottom: 0; }
  #field { bottom: calc(224px + var(--gb)); }
  /* 부적이 아래 줄(더미·턴 종료)을 덮으면 손가락이 엉뚱한 것을 짚는다 */
  .card { top: 22px; }

  #skillbtn { left: 8px;   bottom: calc(184px + var(--gb)); width: 46px; height: 46px; }
  #petbtn   { left: 60px;  bottom: calc(184px + var(--gb)); width: 46px; height: 46px; }
  #energy   { left: 112px; bottom: calc(184px + var(--gb)); width: 46px; height: 46px;
              border-radius: 12px; font-size: 15px; }
  #energy small { font-size: 9px; }
  #skillbtn b { font-size: 17px; } #skillbtn small { font-size: 7.5px; }
  #petbtn b { font-size: 16px; } #petbtn small { font-size: 7.5px; max-width: 36px; }
  #autobtn { right: 8px; bottom: calc(184px + var(--gb)); padding: 12px 14px;
             font-size: 11px; min-height: 46px; min-width: 46px; }

  /* 더미 둘을 왼쪽에 나란히, 오른쪽은 턴 종료에 내어 준다 */
  #pilebar { height: 60px; bottom: var(--gb); padding: 0 8px;
             justify-content: flex-start; gap: 10px; }
  .pile { width: 46px; height: 46px; font-size: 8px; flex: 0 0 auto; }
  .pile b { font-size: 14px; }
  #endturn { left: auto; right: 8px; bottom: calc(var(--gb) + 7px);
             width: auto; min-width: 118px; min-height: 46px;
             padding: 13px 18px; text-align: center; font-size: 14px;
             transform: none; }
  #endturn:hover, #endturn:disabled, #endturn:active { transform: none; }
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

/* 줄바꿈은 LF 로 고른다 — 윈도우에서 받으면 CRLF 가 되어 찾기가 어긋난다 */
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
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
/* 화면 끝까지 쓰겠다고 일러 둔다 — 이 말이 있어야 기계가
   safe-area-inset 을 참값으로 알려 준다. 없으면 0 으로 와서
   제스처 막대를 피할 길이 없다. */
if (!out.includes('viewport-fit=cover')) {
  const before = out;
  out = out.replace(/(<meta name="viewport" content="[^"]*)"/,
                    '$1,viewport-fit=cover"');
  if (out === before) {
    console.error('뷰포트 줄을 찾지 못했다 — 안전여백이 0 으로 올 것이다');
    process.exit(1);
  }
}

writeFileSync(OUT, out);
console.log('mobile.html 지었다 ·', (out.length / 1024).toFixed(0) + 'KB',
  '(index.html 보다', ((out.length - src.length) / 1024).toFixed(1) + 'KB 큼)');
