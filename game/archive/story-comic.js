/* ══════════════════════════════════════════════════════════
   백귀야행 — 예전의 「이야기 만화」 보관본
   ──────────────────────────────────────────────────────────
   판 8까지 게임 안에 있던, 글이 한 자씩 찍히는 이야기 화면(오프닝·막간·엔딩)이다.
   판 9에서 카메라가 도는 컷씬(cutPlay)으로 바꾸며 게임에서 뺐다.
   글(STORY)과 그림(storyScene)은 막마다 대사를 얹을 때 다시 쓰려고 여기 그대로 둔다.
   이 파일은 빌드에 들어가지 않는다.
   되살리려면: CSS 를 <style> 에, JS 를 <script> 에 붙이고 showStory(key) 를 부르면 된다.
   ══════════════════════════════════════════════════════════ */

/* ── CSS ───────────────────────────────────────────────── */
const STORY_CSS = String.raw`
/* ══ 이야기 ══════════════════════════════════════════════ */
.story{position:fixed;inset:0;z-index:70;display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:#0d0b09;cursor:pointer;overflow:hidden}
.story .sart{position:absolute;inset:0;opacity:.9}
.story .sart svg{width:100%;height:100%;display:block}
.story .svig{position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(ellipse at 50% 45%,transparent 30%,rgba(6,5,4,.86) 100%)}
.story .stext{position:relative;z-index:2;max-width:min(760px,86vw);text-align:center;
  color:#f0e6d0;font-size:24px;line-height:2.05;letter-spacing:.06em;white-space:pre-line;
  text-shadow:0 3px 18px rgba(0,0,0,.95),0 0 40px rgba(0,0,0,.8);min-height:150px;
  display:flex;align-items:center;justify-content:center}
.story .stext .cur{opacity:.7;animation:hintBlink .7s ease-in-out infinite}
/* 말하는 이 — 이름패 */
.story .swho{position:relative;z-index:2;color:#f4e2b0;font-size:14px;letter-spacing:.34em;
  margin-bottom:16px;margin-left:.34em;padding:7px 22px;border-radius:3px;
  background:linear-gradient(90deg,transparent,rgba(120,90,40,.5),transparent);
  border-top:1px solid rgba(200,169,78,.45);border-bottom:1px solid rgba(200,169,78,.45);
  text-shadow:0 0 14px rgba(255,200,110,.6);animation:whoIn .5s cubic-bezier(.2,.9,.3,1)}
.story .swho:empty{display:none}
@keyframes whoIn{0%{opacity:0;transform:translateY(10px) scale(.9);letter-spacing:.6em}
  100%{opacity:1;transform:none}}
/* 글이 한 줄씩 밀려 올라온다 */
.story .stext{animation:textIn .45s cubic-bezier(.2,.9,.3,1)}
@keyframes textIn{0%{opacity:0;transform:translateY(14px)}100%{opacity:1;transform:none}}
/* 위아래 검은 띠 — 영화처럼 */
.story:before,.story:after{content:'';position:absolute;left:0;right:0;height:52px;z-index:3;pointer-events:none;
  background:#050403;animation:barIn .6s cubic-bezier(.2,.9,.3,1)}
.story:before{top:0;box-shadow:0 3px 22px rgba(0,0,0,.8)}
.story:after{bottom:0;box-shadow:0 -3px 22px rgba(0,0,0,.8)}
@keyframes barIn{0%{transform:scaleY(0)}100%{transform:scaleY(1)}}
.story:before{transform-origin:top}.story:after{transform-origin:bottom}
/* 화면을 떠도는 먼지 */
.story .sdust{position:absolute;inset:0;z-index:1;pointer-events:none;overflow:hidden}
.story .sdust i{position:absolute;width:3px;height:3px;border-radius:50%;background:rgba(255,235,190,.55);
  box-shadow:0 0 7px rgba(255,220,160,.6);animation:dustGo linear infinite}
@keyframes dustGo{0%{transform:translate(0,0);opacity:0}
  12%{opacity:.85}80%{opacity:.5}100%{transform:translate(var(--dx,30px),-120vh);opacity:0}}
/* 장면이 천천히 밀려든다 */
.story .sart{animation:artIn 1.1s ease-out}
@keyframes artIn{0%{opacity:0;transform:scale(1.08)}100%{opacity:.9;transform:none}}
/* 아래 검은 띠(52px)에 글자가 반쯤 잘리던 것을 띄운다 */
.story .snext{position:absolute;bottom:68px;color:#9d9077;font-size:13px;letter-spacing:.24em;
  animation:hintBlink 1.3s ease-in-out infinite;z-index:4}
.story .sskip{position:absolute;top:20px;right:24px;z-index:3;padding:7px 16px;border-radius:5px;font-size:13px;
  color:#c9bda2;background:rgba(255,255,255,.06);border:1px solid rgba(200,180,140,.3);letter-spacing:.1em}
.story .sskip:hover{background:rgba(255,255,255,.14);color:#f2e9d3}
.story .stitle{position:relative;z-index:2;font-size:52px;letter-spacing:.28em;margin-left:.28em;color:#e9dfc9;
  margin-bottom:6px;text-shadow:0 0 40px rgba(168,39,44,.6)}
.story.fadeout{animation:storyOut .6s ease forwards}
@keyframes storyOut{to{opacity:0}}
.story .sart.kenburns{animation:kenburns 9s ease-out forwards}
@keyframes kenburns{0%{transform:scale(1.14) translateY(10px)}100%{transform:scale(1) translateY(0)}}

`;

/* ── JS ────────────────────────────────────────────────── */
/* ══════════════════════════════════════════════════════════
   12-B. 이야기 — 오프닝과 막간
   ══════════════════════════════════════════════════════════ */
function storyScene(kind) {
  const sky = { moon: ['#131826', '#0b0d14'], parade: ['#1a1220', '#0a0710'],
    village: ['#2a1410', '#0d0605'], master: ['#181a16', '#0a0b09'],
    hero: ['#1d1a14', '#0b0a08'], fox: ['#241016', '#0c0508'],
    tiger: ['#241a0e', '#0d0906'], dragon: ['#12141d', '#07080c'],
    gate: ['#1a1626', '#08070c'], dawn: ['#2c2418', '#100c07'],
    abyss: ['#0c0a14', '#030206'], first: ['#3a3222', '#1a1610'],
    voidless: ['#0a0a0b', '#020203'], ash: ['#1c1410', '#080605'],
    dano: ['#161a20', '#07090c'] }[kind] || ['#14110d', '#080706'];
  const mt = (fill, d, op) => `<path d="${d}" fill="${fill}" opacity="${op}"/>`;
  let art = '';
  switch (kind) {
    case 'abyss': {                       /* 무저갱 — 아래로 끝없이 */
      let rings = '';
      for (let i = 0; i < 9; i++) {
        const rx = 460 - i * 48, ry = 150 - i * 15, cy = 300 + i * 30;
        rings += `<ellipse cx="500" cy="${cy}" rx="${rx}" ry="${Math.max(6, ry)}" fill="none"
          stroke="#6a5f86" stroke-width="${(9 - i) * .5}" opacity="${.5 - i * .045}"/>`;
      }
      let dust = '';
      for (let i = 0; i < 26; i++)
        dust += `<circle cx="${40 + (i * 137) % 920}" cy="${60 + (i * 211) % 500}" r="${1 + (i % 3)}"
          fill="#b9a8e0" opacity="${.14 + (i % 5) * .05}"/>`;
      art = `<rect width="1000" height="600" fill="#07060c"/>${rings}${dust}
        <ellipse cx="500" cy="588" rx="200" ry="34" fill="#000" opacity=".9"/>`;
      break;
    }
    case 'first': {                       /* 태초 — 아무것도 없던 자리 */
      let halo = '';
      for (let i = 6; i >= 1; i--)
        halo += `<circle cx="500" cy="300" r="${i * 62}" fill="#ffe9a8" opacity="${.045 * (7 - i)}"/>`;
      let rays = '';
      for (let i = 0; i < 20; i++) {
        const a = i * 18 * Math.PI / 180, L = 200 + (i % 4) * 110;
        rays += `<line x1="500" y1="300" x2="${(500 + Math.cos(a) * L).toFixed(1)}"
          y2="${(300 + Math.sin(a) * L).toFixed(1)}" stroke="#fff3ce" stroke-width="${1 + (i % 3)}"
          opacity="${.1 + (i % 3) * .06}"/>`;
      }
      art = `<rect width="1000" height="600" fill="#1a1610"/>${halo}${rays}
        <circle cx="500" cy="300" r="52" fill="#fffbe8"/>
        <circle cx="500" cy="300" r="52" fill="none" stroke="#fff" stroke-width="2" opacity=".7"/>`;
      break;
    }
    case 'voidless': {                    /* 무간 — 있어야 할 것이 없는 자리 */
      /* 그릴 것이 없다. 그래서 「지운 자국」만 그린다. */
      let scratch = '';
      for (let i = 0; i < 26; i++) {
        const y = 24 + i * 22, w = 90 + ((i * 173) % 420), x = ((i * 211) % 700) + 30;
        scratch += `<rect x="${x}" y="${y}" width="${w}" height="${1 + (i % 2)}"
          fill="#5c5c70" opacity="${.10 + (i % 4) * .05}"/>`;
      }
      /* 사람 하나가 서 있던 자리 — 지워지고 테두리만 남았다 */
      const fig = `M488,214 a24,24 0 1,1 .1,0 M478,238 L522,238 L534,300 L534,432
        L516,432 L512,346 L488,346 L484,432 L466,432 L466,300 Z`;
      art = `<rect width="1000" height="600" fill="#050506"/>${scratch}
        <g opacity=".55">
          <path d="${fig}" fill="#050506"/>
          <path d="${fig}" fill="none" stroke="#8a8aa0" stroke-width="1.6"
            stroke-dasharray="7 11" opacity=".8"/>
        </g>
        ${[1, 2].map(i => {
          const s = 1 - i * .22, x = 500 + i * 150;
          return `<g opacity="${.2 - i * .06}" transform="translate(${x} ${432 * (1 - s)}) scale(${s}) translate(${-500} 0)">
            <path d="${fig}" fill="none" stroke="#6a6a80" stroke-width="${1.4 / s}" stroke-dasharray="${6 / s} ${10 / s}"/>
          </g>`;
        }).join('')}
        <line x1="0" y1="432" x2="1000" y2="432" stroke="#3a3a48" stroke-width="1" opacity=".35"/>
        <rect x="0" y="0" width="1000" height="600" fill="url(#vg)" opacity=".85"/>
        <defs><radialGradient id="vg" cx=".5" cy=".52" r=".78">
          <stop offset="0" stop-color="#000" stop-opacity="0"/>
          <stop offset=".62" stop-color="#000" stop-opacity=".45"/>
          <stop offset="1" stop-color="#000" stop-opacity=".96"/></radialGradient></defs>`;
      break;
    }
    case 'ash': {                         /* 재 — 통 부적이 타고 남은 것 */
      let flakes = '';
      for (let i = 0; i < 34; i++) {
        const x = 60 + (i * 149) % 900, y = 70 + (i * 233) % 470, s = 3 + (i % 4) * 3;
        flakes += `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="1" fill="#6a5c4c"
          opacity="${.12 + (i % 5) * .1}" transform="rotate(${(i * 37) % 90} ${x + s / 2} ${y + s / 2})"/>`;
      }
      let embers = '';
      for (let i = 0; i < 12; i++)
        embers += `<circle cx="${120 + (i * 181) % 780}" cy="${120 + (i * 127) % 400}"
          r="${1.5 + (i % 3)}" fill="#e2762a" opacity="${.25 + (i % 4) * .14}"/>`;
      /* 반쯤 탄 부적 한 장 */
      /* 부적은 가운데 글이 앉을 자리를 비켜 왼쪽 위에 둔다 */
      art = `<rect width="1000" height="600" fill="#0d0907"/>${flakes}${embers}
        <g transform="translate(-208 -78) rotate(-8 500 320)">
          <path d="M440,190 L560,190 L560,404 Q536,430 500,414 Q470,438 440,404 Z" fill="#d8c9a4" opacity=".78"/>
          <path d="M440,330 L560,330 L560,404 Q536,430 500,414 Q470,438 440,404 Z" fill="#241a12" opacity=".85"/>
          <path d="M440,318 Q470,344 500,314 Q532,342 560,320 L560,340 L440,340 Z" fill="#e2762a" opacity=".55"/>
          <text x="500" y="272" text-anchor="middle" font-size="86" fill="#a8272c"
            font-family="serif" opacity=".85">通</text>
        </g>
        <ellipse cx="292" cy="486" rx="180" ry="24" fill="#000" opacity=".7"/>`;
      break;
    }
    case 'dano': {                        /* 단오 — 등불을 든 뒷모습, 멀어진다 */
      /* 걸어가는 사람 하나. 발치는 늘 y=470 에 둔다. */
      const walker = (col, sc) => {
        const H = 190 * sc, W = 40 * sc, hd = 21 * sc, top = 470 - H;
        return `<g fill="${col}">
          <rect x="${-W / 2}" y="${top}" width="${W}" height="${H}" rx="${5 * sc}"/>
          <circle cx="0" cy="${top - hd * .82}" r="${hd}"/>
          <rect x="${-hd * 1.5}" y="${top - hd * 1.5}" width="${hd * 3}" height="${hd * .6}" rx="${2 * sc}"/>
          <rect x="${W / 2 - 2 * sc}" y="${top - hd * .4}" width="${3 * sc}" height="${H + hd * .4}"
            rx="${1.5 * sc}" transform="rotate(7 ${W / 2} ${top + H / 2})"/></g>`;
      };
      let echo = '';
      for (let i = 3; i >= 1; i--) {
        const s = 1 - i * .16, x = 500 + i * 96;
        echo += `<g opacity="${.13 - i * .028}" transform="translate(${x} ${470 * (1 - s) * .0})">${walker('#4a7ea0', s)}</g>`;
      }
      /* 등불 — 손에 든 빛. 그 빛만 이쪽까지 온다. */
      const lampX = 452, lampY = 372;
      art = mt('#151c26', 'M0,452 L200,352 L400,442 L600,344 L800,432 L1000,372 L1000,600 L0,600 Z', .9) +
        echo +
        `<g transform="translate(500 0)">${walker('#090c10', 1)}</g>
         <g><circle cx="${lampX}" cy="${lampY}" r="72" fill="#d8a24a" opacity=".035"/>
           <circle cx="${lampX}" cy="${lampY}" r="30" fill="#d8a24a" opacity=".07"/>
           <circle cx="${lampX}" cy="${lampY}" r="13" fill="#e8b45c" opacity=".18"/>
           <rect x="${lampX - 6}" y="${lampY - 8}" width="12" height="17" rx="3" fill="#e8b45c" opacity=".9"/>
           <rect x="${lampX - 8}" y="${lampY - 11}" width="16" height="4" rx="2" fill="#0a0d11"/>
           <path d="M${lampX},${lampY - 11} L${lampX},${lampY - 26} L481,${lampY - 34}"
             fill="none" stroke="#0a0d11" stroke-width="2"/></g>
         <ellipse cx="500" cy="474" rx="46" ry="9" fill="#000" opacity=".55"/>
         <circle cx="500" cy="262" r="86" fill="none" stroke="#3a6a8a" stroke-width="2" opacity=".24"/>
         <circle cx="500" cy="262" r="122" fill="none" stroke="#3a6a8a" stroke-width="1" opacity=".11"/>` +
        mt('#0a0e14', 'M0,520 L220,486 L440,516 L660,482 L880,512 L1000,490 L1000,600 L0,600 Z', .95);
      break;
    }
    case 'moon':
      art = `<circle cx="700" cy="150" r="86" fill="#c9585c" opacity=".55"/>
        <circle cx="700" cy="150" r="86" fill="none" stroke="#e8a0a2" stroke-width="1.5" opacity=".4"/>` +
        mt('#2a2a3a', 'M0,420 L150,250 L260,340 L380,190 L500,330 L620,240 L760,360 L880,270 L1000,400 L1000,600 L0,600 Z', .85) +
        mt('#14141e', 'M0,500 L120,410 L230,470 L340,380 L470,460 L600,400 L720,470 L860,390 L1000,450 L1000,600 L0,600 Z', .95);
      break;
    case 'parade': {
      let lanterns = '';
      for (let i = 0; i < 16; i++) {
        const x = 60 + i * 58, y = 300 + Math.sin(i * .9) * 46;
        lanterns += `<circle cx="${x}" cy="${y}" r="${7 + (i % 3) * 2}" fill="#e2a13a" opacity=".85"/>
          <circle cx="${x}" cy="${y}" r="${18 + (i % 3) * 4}" fill="#e2a13a" opacity=".13"/>`;
      }
      art = mt('#241a2e', 'M0,430 L180,300 L320,380 L460,260 L620,370 L780,290 L1000,410 L1000,600 L0,600 Z', .9) +
        lanterns + mt('#0e0a14', 'M0,520 L200,470 L420,510 L640,460 L860,505 L1000,470 L1000,600 L0,600 Z', .95);
      break;
    }
    case 'village': {
      let fire = '';
      for (let i = 0; i < 9; i++) {
        const x = 180 + i * 78, h = 40 + (i % 4) * 26;
        fire += `<path d="M${x},480 Q${x - 14},${480 - h} ${x},${480 - h * 1.5} Q${x + 14},${480 - h} ${x},480 Z"
          fill="#e2622a" opacity=".55"/>`;
      }
      art = mt('#3a1a12', 'M0,440 L200,330 L420,420 L640,320 L860,410 L1000,350 L1000,600 L0,600 Z', .8) + fire +
        `<g opacity=".9" fill="#120806">
          <rect x="220" y="450" width="90" height="70"/><rect x="380" y="430" width="120" height="90"/>
          <rect x="560" y="455" width="100" height="65"/><rect x="720" y="440" width="110" height="80"/>
        </g>` + mt('#0b0504', 'M0,520 L1000,520 L1000,600 L0,600 Z', 1);
      break;
    }
    case 'master':
      art = mt('#1e2019', 'M0,450 L220,320 L440,430 L660,310 L880,420 L1000,370 L1000,600 L0,600 Z', .8) +
        `<g opacity=".9"><rect x="470" y="330" width="58" height="190" rx="6" fill="#0d0e0c"/>
          <circle cx="499" cy="308" r="26" fill="#0d0e0c"/></g>
         <g opacity=".85">${[0, 1, 2, 3, 4, 5].map(i =>
            `<rect x="${300 + i * 78}" y="${180 + (i % 3) * 34}" width="26" height="42" rx="2"
              fill="#e8dcc0" transform="rotate(${-18 + i * 7} ${313 + i * 78} ${201 + (i % 3) * 34})" opacity=".8"/>`).join('')}</g>`;
      break;
    case 'hero':
      art = mt('#22201a', 'M0,470 L180,340 L360,450 L540,330 L720,440 L900,350 L1000,410 L1000,600 L0,600 Z', .85) +
        `<g opacity=".95"><rect x="478" y="300" width="46" height="200" rx="5" fill="#0c0b09"/>
          <circle cx="501" cy="280" r="24" fill="#0c0b09"/>
          <rect x="524" y="250" width="7" height="230" rx="3" fill="#0c0b09" transform="rotate(9 527 365)"/></g>
         <circle cx="501" cy="280" r="70" fill="none" stroke="#a8272c" stroke-width="2" opacity=".35"/>`;
      break;
    case 'fox': {
      let tails = '';
      for (let i = 0; i < 9; i++) {
        const a = -76 + i * 19;
        tails += `<path d="M500,360 Q${500 + Math.cos(a * Math.PI / 180) * 200},${360 + Math.sin(a * Math.PI / 180) * 150}
          ${500 + Math.cos(a * Math.PI / 180) * 300},${330 + Math.sin(a * Math.PI / 180) * 190}"
          fill="none" stroke="#c94a58" stroke-width="12" stroke-linecap="round" opacity=".4"/>`;
      }
      art = mt('#2a1018', 'M0,470 L250,350 L500,450 L750,340 L1000,440 L1000,600 L0,600 Z', .85) + tails +
        `<circle cx="500" cy="330" r="60" fill="#160810" opacity=".9"/>
         <circle cx="482" cy="322" r="7" fill="#ffcf5a"/><circle cx="520" cy="322" r="7" fill="#ffcf5a"/>`;
      break;
    }
    case 'tiger':
      art = mt('#2e2312', 'M0,430 L200,270 L400,400 L600,250 L800,390 L1000,300 L1000,600 L0,600 Z', .85) +
        `<g opacity=".9"><ellipse cx="500" cy="360" rx="130" ry="105" fill="#1a1208"/>
          <circle cx="455" cy="335" r="10" fill="#ffd34a"/><circle cx="545" cy="335" r="10" fill="#ffd34a"/>
          ${[0, 1, 2, 3].map(i => `<rect x="${390 + i * 62}" y="255" width="12" height="52" rx="6"
            fill="#c07a1f" opacity=".65" transform="rotate(${-14 + i * 9} ${396 + i * 62} 281)"/>`).join('')}</g>`;
      break;
    case 'dragon': {
      let coil = '';
      for (let i = 0; i < 5; i++)
        coil += `<path d="M${120 + i * 30},${520 - i * 74} Q500,${430 - i * 74} ${880 - i * 30},${520 - i * 74}"
          fill="none" stroke="#2b3348" stroke-width="${20 - i * 2}" stroke-linecap="round" opacity=".8"/>`;
      art = coil + `<circle cx="500" cy="180" r="52" fill="#161a26"/>
        <circle cx="480" cy="172" r="8" fill="#4fe0a0"/><circle cx="522" cy="172" r="8" fill="#4fe0a0"/>`;
      break;
    }
    case 'gate':
      art = mt('#1d1828', 'M0,470 L250,360 L500,450 L750,350 L1000,440 L1000,600 L0,600 Z', .85) +
        `<g opacity=".92"><rect x="330" y="140" width="34" height="380" fill="#0e0b16"/>
          <rect x="636" y="140" width="34" height="380" fill="#0e0b16"/>
          <rect x="286" y="110" width="428" height="30" rx="6" fill="#0e0b16"/>
          <rect x="364" y="170" width="272" height="350" fill="#3a2f5c" opacity=".55"/>
          <rect x="364" y="170" width="272" height="350" fill="url(#gg)" opacity=".7"/></g>
        <defs><linearGradient id="gg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#b98cff" stop-opacity=".85"/><stop offset="1" stop-color="#2de1ff" stop-opacity="0"/>
        </linearGradient></defs>`;
      break;
    case 'dawn':
      art = `<circle cx="500" cy="330" r="120" fill="#f0c877" opacity=".45"/>
        <circle cx="500" cy="330" r="200" fill="#f0c877" opacity=".12"/>` +
        mt('#3a2f1c', 'M0,420 L180,290 L360,400 L540,280 L720,390 L900,300 L1000,360 L1000,600 L0,600 Z', .8) +
        mt('#1a150d', 'M0,500 L200,450 L420,495 L640,445 L860,490 L1000,455 L1000,600 L0,600 Z', .95);
      break;
    default:
      art = mt('#1c1913', 'M0,460 L250,340 L500,440 L750,330 L1000,430 L1000,600 L0,600 Z', .85);
  }
  return `<svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice">
    <rect width="1000" height="600" fill="${sky[0]}"/>
    <rect width="1000" height="600" fill="url(#skyg)" opacity=".9"/>
    <defs><linearGradient id="skyg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>
    ${art}</svg>`;
}

const STORY = {
  opening: [
    { scene: 'moon', title: '백귀야행', t: '백 년에 한 번,\n산이 문을 연다.' },
    { scene: 'parade', t: '그 밤이면 온갖 것들이 줄을 지어 내려온다.\n등을 들고, 노래를 부르며, 천천히.\n\n사람들은 그 행렬을 백귀야행이라 불렀다.' },
    { scene: 'village', t: '올해는 문이 닫히지 않았다.\n\n세 마을이 하룻밤에 사라졌다.\n비명을 들은 사람은 아무도 없었다.' },
    { scene: 'master', who: '스승', t: '"문은 산꼭대기에 있다.\n누군가 안에서 열어 두었어."\n\n스승은 부적 한 짐을 지고 올라갔다.' },
    { scene: 'master', t: '이레 뒤,\n돌아온 것은 부적 열 장뿐이었다.\n\n참격 다섯, 호신 넷, 벽사부 하나.' },
    { scene: 'hero', t: '남은 퇴마사는 둘이다.\n\n나와, 같은 날 스승을 잃은 단오(丹午).' },
    { scene: 'hero', who: '단오', t: '"산 어귀에서 길이 둘로 갈려."\n\n"네가 왼쪽, 내가 오른쪽. 위에서 만나자."' },
    { scene: 'hero', t: '단오가 부적 두 장을 반으로 갈라 한 쪽을 건넸다.\n通 — 통할 통.\n\n"이게 붙어 있는 동안은 서로 목소리가 들려."\n"내가 봐 줄게. 너 판 보는 눈이 영 없잖아."' },
    { scene: 'hero', t: '부적 열 장과 통 부적 한 조각을 품고,\n산을 오른다.\n\n귓가에서 단오가 웃는 소리가 들린다.' }
  ],
  act1: [
    { scene: 'fox', who: '구미호', t: '"……어리구나. 스승보다 더."\n\n꼬리 아홉이 하나씩 스러진다.' },
    { scene: 'fox', who: '구미호', t: '"우리가 문을 연 것이 아니다.\n우리도 쫓겨 내려온 것뿐."' },
    { scene: 'moon', t: '여우가 재로 흩어진 자리에\n안개가 밀려 내려왔다.\n\n위쪽에서 무언가가 부르고 있었다.' }
  ],
  act2: [
    { scene: 'tiger', who: '산군', t: '"나는 이 산의 문지기였다."\n\n호랑이의 눈에서 노란빛이 빠져나간다.' },
    { scene: 'tiger', who: '산군', t: '"천 년을 지켰는데,\n위에서 부르는 소리를 견디지 못했다.\n\n……너는 견딜 수 있겠느냐."' },
    { scene: 'gate', t: '봉우리 너머,\n구천으로 오르는 벼랑이 드러났다.\n\n문은 아직 열려 있다.' }
  ],
  /* 제3막에는 보스가 둘이다 — 꺾은 쪽에 따라 다른 말이 나온다 */
  act3_blackdragon: [
    { scene: 'dragon', who: '흑룡', t: '"문을 연 것은 내가 아니다."\n\n"나도 이 아래에서 쫓겨 올라온 것뿐."' },
    { scene: 'gate', t: '비늘이 흩어진 자리에 또 다른 문이 있었다.\n이번에는 아래로 내려가는 문이었다.\n\n명계로 가는 길이다.' }
  ],
  act3_yeomra: [
    { scene: 'gate', who: '염라', t: '"명부에 네 이름이 없구나."\n\n붓끝이 허공에서 멎는다.' },
    { scene: 'gate', who: '염라', t: '"위에서 무언가가 명부를 찢고 있다.\n나는 그것을 막으러 내려왔을 뿐이다."\n\n"…네가 대신 가겠느냐."' },
    { scene: 'gate', t: '염라가 붓을 내려놓자\n벼랑 끝에 또 다른 문이 열렸다.\n이번에는 아래로 내려가는 문이었다.\n\n명계로 가는 길이다.' }
  ],
  act3: [
    { scene: 'gate', t: '벼랑 끝에 또 다른 문이 있었다.\n이번에는 아래로 내려가는 문이었다.\n\n명계로 가는 길이다.' }
  ],
  act4: [
    { scene: 'gate', who: '강림도령', t: '"명부에 네 이름이 세 번 적혔다가 세 번 지워졌다."\n\n"누가 지운 줄 아느냐."' },
    { scene: 'moon', t: '저승사자가 흩어지자\n명계의 천장이 갈라지며 빛이 쏟아졌다.\n\n위로, 더 위로 가야 한다.' }
  ],
  act5: [
    { scene: 'hero', who: '단오', t: '"야, 나 여기 좀 이상해."\n\n"위로 갈수록 부적이 지지직거려.\n네 목소리도 끊겨."' },
    { scene: 'tiger', who: '치우천왕', t: '"하늘도 저것을 막지 못했다."\n\n구리 이마가 갈라지며 피가 흐른다.' },
    { scene: 'dragon', who: '치우천왕', t: '"문 너머에는 아무것도 없다.\n아무것도 없는 것이 있다."\n\n"그것이 네 이름을 지웠다."' },
    { scene: 'gate', t: '구천의 끝, 무간(無間)의 입구가 열렸다.\n\n소리도, 빛도, 냄새도 없다.' }
  ],
  /* 통 부적이 끊기는 그 자리 — 제6막 정예를 만나는 순간에 나온다 */
  mugan_lost: [
    { scene: 'voidless', t: '무간에 들어서자\n소리가 한 겹씩 벗겨졌다.\n\n발소리가 먼저 없어졌고,\n그다음에 숨소리가 없어졌다.' },
    { scene: 'voidless', t: '남은 소리는 하나뿐이었다.\n귀 뒤에 붙여 둔 통(通) 부적.\n\n그 안에서 단오가 아직 걷고 있었다.' },
    { scene: 'dano', who: '단오', t: '"야. 너 아직 거기 있냐?"\n\n"…나는 네 대답이 안 들려.\n한참 전부터 안 들렸어."' },
    { scene: 'dano', who: '단오', t: '"괜찮아, 나 혼자 떠들면 되지 뭐.\n원래 내가 말 더 많았잖아."\n\n웃는 소리가 났다.\n무간에서는 그 소리가 어울리지 않았다.' },
    { scene: 'voidless', who: '단오', t: '"근데 여기 뭔가 이상해."\n\n"엘리트가 아니야. 이건—\n이건 아무것도 아니야."' },
    { scene: 'voidless', who: '단오', t: '"아무것도 아닌 게 나를 보고 있어."\n\n"눈이 없는데 보고 있는 걸\n어떻게 아는지 모르겠는데,\n\n알겠어."' },
    { scene: 'ash', t: '부적 너머에서 종이 긁는 소리가 났다.\n단오가 무언가를 붙이고 있었다.\n급하게, 여러 장을, 겹쳐서.\n\n종이 찢어지는 소리가 그보다 더 빨랐다.' },
    { scene: 'voidless', who: '단오', t: '"야."\n\n"…야, 내 이름이 뭐였지."\n\n"불러 줘. 빨리."' },
    { scene: 'ash', t: '입을 열었다.\n\n소리가 나가지 않았다.\n무간이 먼저 그것을 가져갔다.' },
    { scene: 'ash', t: '통 부적이 손 안에서 뜨거워졌다.\n通 자가 한 획씩 지워졌다.\n\n획이 다 빠지자\n아무 글자도 아니게 되었다.' },
    { scene: 'ash', t: '"단오야!"\n\n그제야 소리가 나왔다.\n부적은 이미 재였다.\n\n재는 따뜻하지도 않았다.' },
    { scene: 'voidless', t: '무간에는 메아리가 없다.\n\n부른 이름이 돌아오지 않았다.\n어디로 간 것도 아니고,\n그냥 없어졌다.\n\n부르기 전부터 없었던 것처럼.' }
  ],
  act6: [
    { scene: 'voidless', t: '무간을 걷는 데 며칠이 걸렸는지 모른다.\n\n해가 없어 날로 셀 수 없었고,\n배가 고프지 않아 끼니로도 셀 수 없었다.' },
    { scene: 'voidless', t: '그래서 부적으로 셌다.\n한 장 붙일 때마다 하루로 쳤다.\n\n열이레째에 단오가 지나간 자리를 찾았다.' },
    { scene: 'dano', t: '바닥에 부적이 스무 장쯤 흩어져 있었다.\n전부 다 쓴 것이었다.\n\n마지막 한 장에는 글씨가 없었다.\n쓰다 만 것이 아니라,\n쓴 것이 지워진 것이었다.' },
    { scene: 'ash', t: '한 장을 주웠다.\n\n획 끝을 꼭 위로 튕겨 올리는 버릇이 남아 있었다.\n스승이 백 번을 고쳐도\n끝내 안 고쳐지던 그 버릇.' },
    { scene: 'ash', t: '"…너 진짜 글씨 못 쓴다."\n\n아무도 대꾸하지 않았다.\n대꾸할 자리도 없었다.' },
    { scene: 'voidless', who: '무간', t: '"……"\n\n그것은 아무 말도 하지 않았다.\n애초에 입이 없었다.' },
    { scene: 'voidless', t: '목소리를 잃은 얼굴이 아니었다.\n\n목소리라는 것을\n한 번도 겪어 본 적이 없는 얼굴이었다.' },
    { scene: 'voidless', t: '무간은 때리지 않았다.\n닿는 것을 하나씩 없앨 뿐이었다.\n\n방어도가 없어지고,\n이름이 없어지고,\n없어졌다는 사실까지 없어졌다.' },
    { scene: 'ash', t: '부적이 한 장씩 타들어 갔다.\n열 장이 재가 되고, 스무 장이 재가 되고,\n\n셀 수 있는 것이 재밖에 남지 않았을 때\n품 안에서 마지막 한 조각을 꺼냈다.' },
    { scene: 'ash', t: '반쪽짜리, 재가 된 통 부적.\n\n재를 손바닥에 문질러\n없는 얼굴에 그대로 붙였다.\n\n通 — 통할 통.' },
    { scene: 'voidless', who: '무간', t: '없는 것에게 처음으로 길이 났다.\n\n"…아."\n\n그 한마디에 그것이 무너졌다.' },
    { scene: 'ash', t: '무너지면서 그것이 재를 돌려주었다.\n\n붙였던 자리에서 재가 스르르 흘러\n손바닥에 도로 고였다.\n\n한 번 길이 난 재는 다시 붙일 수 있다.\n通 — 통할 통.' },
    { scene: 'dano', t: '무너진 자리에 발자국이 있었다.\n두 사람 몫이 아니라 한 사람 몫이었고,\n아래로 이어져 있었다.\n\n단오는 떨어진 것이다. 혼자.' },
    { scene: 'abyss', t: '그 발자국을 따라 뛰어내렸다.\n떨어지는 데 이레가 걸렸다.\n\n이레 내내 아무 소리도 나지 않아서,\n그동안 단오의 목소리를 되짚었다.\n\n잊으면 못 찾을 것 같아서.' }
  ],
  act7: [
    { scene: 'abyss', t: '떨어지는 동안 재를 놓치지 않으려고\n주먹을 쥐고 있었다.\n\n이레 뒤 손을 펴 보니\n손금에 通 자 한 획이 눌려 있었다.' },
    { scene: 'abyss', who: '무저', t: '"여기가 바닥이라 생각했느냐."\n\n대답할 입이 그것에게도 없었다.' },
    { scene: 'abyss', t: '바닥이 갈라지고,\n그 아래에서 빛이 올라왔다.\n\n아래인데 빛이 올라왔다.' },
    { scene: 'first', t: '떨어지던 몸이 문득 떠올랐다.\n\n산도, 문도, 어둠도 없는 자리.\n아무것도 없던 자리에 닿았다.' }
  ],
  act8: [
    { scene: 'first', who: '태초', t: '"네가 지운 것이 나다."\n\n"내가 지운 것도 너다."' },
    { scene: 'first', t: '처음이 닫히자 빛이 걷혔다.\n\n그 자리에 낯익은 것이 서 있었다.\n산이었다. 처음 오르던 그 산.' },
    { scene: 'hero', t: '길도, 요괴도, 부적도 그대로였다.\n\n다만 앞서 가는 사람의 뒷모습이\n어쩐지 낯이 익었다.' }
  ],
  act9: [
    { scene: 'hero', who: '나', t: '"여기까지 온 것을 축하하네."\n\n돌아본 얼굴은 내 얼굴이었다.' },
    { scene: 'hero', who: '나', t: '"단오를 찾나?"\n\n"찾을 수 있을 걸세. 다만 자네가 아는 단오는 아닐지도."' },
    { scene: 'moon', who: '나', t: '"백 년마다 하나가 오르지.\n그리고 백 년마다 하나가 남네."\n\n"이번엔 자네 차례일세."' },
    { scene: 'parade', t: '재가 흩어진 자리에서\n등불이 하나둘 켜지기 시작했다.\n\n행렬이 돌아오고 있었다.' }
  ],
  act10: [
    { scene: 'parade', who: '백귀야행', t: '수천의 등불이 산을 감았다.\n\n노래는 없었다. 발소리뿐이었다.' },
    { scene: 'parade', t: '행렬의 맨 앞이 걸음을 멈췄다.\n그리고 뒤로 돌아섰다.\n\n등불이 하나씩 꺼졌다.' },
    { scene: 'dawn', t: '재만 남은 능선 위로\n하늘 끝이 붉어지기 시작했다.\n\n밤이 끝나가고 있었다.' }
  ],
  act11: [
    { scene: 'dawn', who: '여명', t: '"밤을 이겼다고 생각하나."\n\n해가 눈을 찔렀다. 밤보다 아팠다.' },
    { scene: 'dawn', t: '해가 다 뜨자 산이 훤히 보였다.\n\n산은 비어 있었다.\n요괴는 한 마리도 남지 않았다.' },
    { scene: 'hero', t: '그제야 알았다.\n행렬은 산을 내려간 것이다.\n\n서둘러 내려가야 했다.' }
  ],
  act12: [
    { scene: 'hero', who: '이장', t: '"어서 오시게. 자네를 기다렸네."\n\n마을 사람 전부가 웃고 있었다.\n한 사람도 빠짐없이.' },
    { scene: 'moon', t: '우물에 비친 얼굴이 하나 더 많았다.\n\n세어 보니 마을 사람 수와 같았다.' },
    { scene: 'village', t: '그 하나를 우물에서 끌어냈다.\n\n끌려 나온 것이 웃자 마을이 함께 웃었고,\n벽사부를 붙이자 마을이 함께 탔다.\n\n사람이 타는 냄새는 나지 않았다.\n애초에 사람이 없었기 때문이다.' },
    { scene: 'gate', t: '마을이 타고 남은 자리에\n북쪽으로 난 길이 있었다.\n\n왕도로 가는 길이었다.' }
  ],
  act13: [
    { scene: 'gate', who: '국사', t: '"백 년 전에도 하나가 올라왔지."\n\n"그자는 여기서 벼슬을 받았네."' },
    { scene: 'gate', who: '옥좌', t: '"산을 연 것이 누구라 생각하나."\n\n옥좌는 비어 있었고, 목소리만 앉아 있었다.' },
    { scene: 'moon', t: '옥좌가 갈라지자\n그 안에서 하늘로 난 계단이 나왔다.\n\n밟을 때마다 발이 가벼워졌다.' }
  ],
  act14: [
    { scene: 'moon', who: '천제', t: '"우리는 보고만 있었다."\n\n"보는 것도 하는 것이라 하겠느냐."' },
    { scene: 'dragon', t: '천군이 흩어지고 구름이 걷혔다.\n\n구름 위에는 아무것도 없었다.\n하늘조차 없었다.' },
    { scene: 'first', t: '발밑이 사라졌다.\n떨어지는 느낌도 없었다.\n\n떨어질 아래가 없었기 때문이다.' }
  ],
  act15: [
    { scene: 'first', who: '무', t: '"여기까지 온 사람이 몇 있었다."\n\n"전부 여기 있다. 없는 채로."' },
    { scene: 'first', t: '없음이 없어졌다.\n\n눈을 뜨니 산 아래였다.\n마을에는 밥 짓는 연기가 올랐다.' },
    { scene: 'hero', t: '길 어귀에 낯익은 팻말이 서 있었다.\n\n제1막, 요괴 숲.\n\n다시 처음이었다.' }
  ],
  act16: [
    { scene: 'hero', who: '되풀이', t: '"몇 번째인지 세지 않네."\n\n"자네도 세지 말게. 세면 못 오르네."' },
    { scene: 'moon', t: '두 번째로 오르는 산은 낯설었다.\n요괴들이 나를 알아보았기 때문이다.\n\n"또 왔구나." 하고 웃었다.' },
    { scene: 'abyss', t: '되풀이를 끊자 되풀이가 멈췄다.\n\n멈춘 자리에 지금껏 죽인 것들이\n전부 서서 나를 보고 있었다.' }
  ],
  act17: [
    { scene: 'abyss', who: '기억', t: '"너는 하나도 잊지 않았다."\n\n"우리도 하나도 잊지 않았다."' },
    { scene: 'moon', t: '이름을 하나씩 불러 주었다.\n부를 이름이 없는 것에는\n이름을 지어 주었다.\n\n그러자 흩어졌다.' },
    { scene: 'gate', t: '마지막 하나가 흩어지며 말했다.\n\n"자네 스승도 여기 있었네."' }
  ],
  act18: [
    { scene: 'gate', who: '스승', t: '"늦었구나."\n\n벽사부를 쥐여 주던 그 손이었다.' },
    { scene: 'hero', who: '스승', t: '"백 년 전에도 산이 열렸지.\n그때 오른 것이 나였네."\n\n"나는 문 앞에서 멈췄네."' },
    { scene: 'parade', t: '스승이 흩어지자 길이 열렸다.\n\n그 길에 사람이 서 있었다.\n하나가 아니었다. 백 명이었다.' }
  ],
  act19: [
    { scene: 'parade', who: '백년', t: '"백 년에 하나씩, 백 명이 올랐다."\n\n"아무도 넘지 못했다."' },
    { scene: 'dawn', t: '백 명이 하나씩 길을 비켰다.\n비킨 자리마다 발자국이 남았다.\n\n발자국은 전부 위를 향하고 있었다.' },
    { scene: 'first', t: '마지막 발자국 앞에\n산이 통째로 서 있었다.\n\n문을 연 것은 요괴가 아니었다.' }
  ],
  act20: [
    { scene: 'first', who: '산', t: '"나는 백 년에 한 번 숨을 쉰다."\n\n"숨을 쉬면 문이 열린다. 그뿐이다."' },
    { scene: 'dawn', t: '산이 숨을 멈췄다.\n문은 닫혔고, 백귀는 흩어졌다.\n\n그런데 아직 하나가 남았다.' },
    { scene: 'hero', t: '산을 오르기 시작한 것이 여섯 해 전이다.\n무간에서 이레, 무저에서 이레,\n나머지는 세는 것을 잊었다.\n\n그동안 한 번도 울리지 않던 것이\n품 안에서 아주 약하게 떨렸다.\n\n재가 된 통 부적이었다.\n단오가 어딘가에 있다.' }
  ],
  act21: [
    { scene: 'hero', who: '사잇길', t: '"산은 끝났지. 하지만 길은 안 끝났네."' },
    { scene: 'moon', t: '산 너머에 길이 하나 더 있었다.\n어느 지도에도 없는 길이었다.\n\n재가 된 부적이 그쪽으로 기울었다.' },
    { scene: 'gate', t: '길 끝에 문이 있었다.\n이번 문은 위로 나 있었다.\n\n문 너머가 환했다.' }
  ],
  act22: [
    { scene: 'gate', who: '문지기', t: '"네 이름은 명부에 없다."\n\n"산 사람은 못 들어간다."' },
    { scene: 'moon', t: '문틈으로 들여다보았다.\n하얗고, 넓고, 조용했다.\n\n그 안 어딘가에서 낯익은 웃음소리가 났다.' },
    { scene: 'dragon', t: '문을 부수고 들어갔다.\n\n퇴마사가 천국의 문을 부순 것은\n아마 내가 처음일 것이다.' }
  ],
  act23: [
    { scene: 'dragon', who: '천국', t: '"여기 있으면 아프지 않다."\n\n"네 벗도 그래서 남았다."' },
    { scene: 'hero', t: '단오를 찾아 헤맸다.\n웃음소리는 자꾸 들리는데\n돌아보면 빈자리뿐이었다.' },
    { scene: 'parade', t: '천국의 하늘이 검게 갈라졌다.\n\n갈라진 틈으로 낫이 먼저 들어왔다.' }
  ],
  act24: [
    { scene: 'parade', who: '사신 장군', t: '"천국은 오래 살찐 밭이다."\n\n"거둘 때가 됐다."' },
    { scene: 'abyss', t: '복 받은 것들이 줄줄이 거두어졌다.\n비명도 없었다. 여기 사람들은\n비명 지르는 법을 잊은 지 오래였다.' },
    { scene: 'abyss', t: '무너지는 천국의 끝에서\n낯익은 등이 하나 서 있었다.\n\n"…단오야?"\n\n돌아본 얼굴에는 눈이 없었다.' }
  ],
  end_sasindo: [
    { scene: 'abyss', who: '사신도', t: '"이 그림에 들어온 것은 나가지 못한다."\n\n"네 벗은 여기 여섯 해째 걸려 있다."' },
    { scene: 'abyss', who: '사신도', t: '"아까 네가 부른 것은 내가 그린 것이다.\n등만 베껴 놓으면 너희는 꼭 이름을 부르더라."\n\n"눈까지 그리기는 귀찮았다."' },
    { scene: 'abyss', t: '그림 속에서 단오가 이쪽을 보았다.\n입 모양만으로 무언가 말했다.\n\n— 야. 너 판 보는 눈 여전히 없네.' },
    { scene: 'dragon', t: '부적도 벽사부도 다 떨어졌다.\n남은 것은 재가 된 통 부적 한 조각.\n\n그것을 그림에 붙였다.\n通 — 통할 통.' },
    { scene: 'dawn', t: '그림이 찢어졌다.\n\n찢어진 자리에서 손이 하나 나왔다.\n잡았다. 따뜻했다.\n\n둘이서 산을 내려왔다.\n이번에는 길이 갈리지 않았다.' }
  ],
  end_mountain: [
    { scene: 'first', who: '산', t: '"나는 백 년에 한 번 숨을 쉰다."\n\n"숨을 쉬면 문이 열린다. 그뿐이다."' },
    { scene: 'dragon', t: '부적도, 벽사부도, 이름도 다 떨어졌다.\n\n남은 것은 산을 오른 발뿐이었다.\n그 발로 정상을 밟았다.' },
    { scene: 'dawn', t: '산이 숨을 멈췄다.\n\n백 년 뒤에도 문은 열리지 않았고,\n그다음 백 년에도 열리지 않았다.\n\n산이 잠들었기 때문이다.\n누군가 끝까지 올라갔기 때문이다.' }
  ],
  end_mu: [
    { scene: 'first', who: '무', t: '"여기까지 온 사람이 몇 있었다."\n\n"전부 여기 있다. 없는 채로."' },
    { scene: 'first', t: '부적은 진작 다 떨어졌다.\n스승의 벽사부도 재가 되었다.\n\n남은 것은 손 하나뿐이었다.\n그 손으로 붙였다.' },
    { scene: 'dawn', t: '없음이 없어졌다.\n\n눈을 뜨니 산 아래였다.\n마을에는 밥 짓는 연기가 올랐고,\n아무도 나를 알아보지 못했다.\n\n그것으로 되었다.' }
  ],
  end_hyakki: [
    { scene: 'parade', who: '백귀야행', t: '수천의 등불이 산을 감았다.\n\n노래는 없었다. 발소리뿐이었다.' },
    { scene: 'parade', t: '스승의 벽사부가 마지막으로 타올랐다.\n\n행렬의 맨 앞이 걸음을 멈췄다.\n그리고 뒤로 돌아섰다.' },
    { scene: 'dawn', t: '문이 닫혔다. 이번에는 안쪽에서.\n\n산은 다시 잠들었고,\n백 년 뒤에도 행렬은 오지 않았다.\n\n누군가 끝까지 올라갔기 때문이다.' }
  ],
  end_taecho: [
    { scene: 'first', who: '태초', t: '"네가 지운 것이 나다."\n\n"내가 지운 것도 너다."' },
    { scene: 'first', t: '부적은 진작 다 떨어졌다.\n\n마지막으로 남은 것은\n스승이 남긴 벽사부 한 장이었다.' },
    { scene: 'dawn', t: '처음이 닫혔다.\n\n산은 다시 잠들었고,\n백 년 뒤 누군가 다시 오를 것이다.\n\n그때는 문 앞에서 멈추기를.' }
  ],
  end_mugan: [
    { scene: 'gate', who: '무간', t: '"……"\n\n그것은 아무 말도 하지 않았다.\n애초에 입이 없었다.' },
    { scene: 'dragon', t: '부적이 한 장씩 타들어 갔다.\n마지막 한 장을 붙였을 때,\n\n비로소 소리가 돌아왔다.' },
    { scene: 'dawn', t: '문이 닫혔다.\n\n산은 다시 잠들었고, 백 년이 흘렀다.\n누군가 다시 오를 것이다.' }
  ],
  end_blackdragon: [
    { scene: 'dragon', who: '흑룡', t: '"문을 연 것은 내가 아니다."\n\n"다만 닫으러 온 손을 백 년 동안\n한 번도 막지 않았을 뿐."' },
    { scene: 'gate', t: '흑룡이 무너지자\n문이 스스로 닫히기 시작했다.\n\n부적을 마지막 한 장까지 붙였다.' },
    { scene: 'dawn', t: '아침이 왔다.\n\n산은 다시 잠들었고,\n행렬은 어디에도 없었다.' }
  ],
  end_yeomra: [
    { scene: 'gate', who: '염라', t: '"명부에 네 이름이 없구나."\n\n"살아서 여기까지 온 자는 처음이다."' },
    { scene: 'gate', t: '염라는 붓을 내려놓고 문을 닫았다.\n\n"백 년 뒤에 다시 오너라.\n그때는 이름을 적어 두마."' },
    { scene: 'dawn', t: '아침이 왔다.\n\n산은 다시 잠들었고,\n행렬은 어디에도 없었다.' }
  ]
};

/* 한 글자씩 찍히는 이야기 화면 */
function showStory(key) {
  const pages = key && STORY[key];
  if (!pages || !pages.length) return Promise.resolve();
  return new Promise(done => {
    let i = 0, typing = null, finished = false;
    const sc = el('div', 'story');
    sc.innerHTML = `<div class="sart"></div><div class="svig"></div>
      <div class="sdust">${[...Array(22)].map((_, k) =>
        `<i style="left:${(k * 4.7 + (k % 3) * 9) % 100}%;bottom:-8px;` +
        `animation-duration:${(9 + (k % 5) * 4)}s;animation-delay:${(k * .7).toFixed(1)}s;` +
        `--dx:${((k % 7) - 3) * 22}px;width:${2 + (k % 3)}px;height:${2 + (k % 3)}px"></i>`).join('')}</div>
      <div class="swho"></div><div class="stitle"></div>
      <div class="stext"></div><div class="snext">눌러서 계속</div>
      <button class="sskip">건너뛰기</button>`;
    $('#app').appendChild(sc);
    const art = sc.querySelector('.sart'), who = sc.querySelector('.swho'),
      title = sc.querySelector('.stitle'), text = sc.querySelector('.stext'),
      next = sc.querySelector('.snext');

    function finish() {
      if (finished) return; finished = true;
      clearInterval(typing);
      sc.classList.add('fadeout');
      setTimeout(() => { sc.remove(); done(); }, 600);
    }
    function page() {
      const p = pages[i];
      art.innerHTML = storyScene(p.scene);
      art.classList.remove('kenburns'); void art.offsetWidth; art.classList.add('kenburns');
      who.textContent = p.who || '';
      title.textContent = p.title || '';
      title.style.display = p.title ? '' : 'none';
      next.style.opacity = '0';
      const full = p.t;
      let n = 0;
      clearInterval(typing);
      text.classList.remove('stext'); void text.offsetWidth; text.classList.add('stext');
      if (p.who) { who.style.animation = 'none'; void who.offsetWidth; who.style.animation = ''; }
      SND.hiss({ dur: .06, vol: .05, freq: 3000, filter: 'bandpass', q: 2 });
      typing = setInterval(() => {
        n += 1;
        text.innerHTML = full.slice(0, n).replace(/\n/g, '<br>') + (n < full.length ? '<span class="cur">▍</span>' : '');
        if (n % 3 === 0 && full[n - 1] && full[n - 1].trim())
          SND.blip(1400 + Math.random() * 400, { dur: .02, type: 'square', vol: .012 });
        if (n >= full.length) { clearInterval(typing); typing = null; next.style.opacity = ''; }
      }, 42);
    }
    function advance() {
      if (typing) {                       /* 타자 중이면 즉시 완성 */
        clearInterval(typing); typing = null;
        text.innerHTML = pages[i].t.replace(/\n/g, '<br>');
        next.style.opacity = '';
        return;
      }
      i++;
      if (i >= pages.length) { finish(); return; }
      SND.ui(); page();
    }
    sc.onclick = advance;
    sc.querySelector('.sskip').onclick = e => { e.stopPropagation(); finish(); };
    const key2 = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); advance(); } };
    addEventListener('keydown', key2);
    const origDone = done;
    done = () => { removeEventListener('keydown', key2); origDone(); };
    page();
  });
}

/* 컷씬 하나를 골라 본다 */
const STORY_LABEL = {
  opening: '여는 이야기', end_taecho: '끝 — 태초', end_mugan: '끝 — 무간',
  end_blackdragon: '끝 — 흑룡', end_yeomra: '끝 — 염라', end_sasindo: '끝 — 사신도',
  act3_blackdragon: '제3막 — 흑룡', act3_yeomra: '제3막 — 염라',
  mugan_lost: '제6막 — 끊긴 통 부적'
};
function storyLabel(k) {
  if (STORY_LABEL[k]) return STORY_LABEL[k];
  const m = /^act(\d+)$/.exec(k);
  if (m) return `제${m[1]}막 — ${ACT_NAME[+m[1]] || ''}`;
  return k;
}
function showStoryPicker() {
  const keys = Object.keys(STORY);
  const p = modal(`<h2>컷 씬</h2>
    <div class="hint">${keys.length}개 · 눌러서 본다</div>
    <div class="cutgrid" id="cut_grid"></div>
    <button class="brush-btn ghost" id="cut_x" style="color:#e9dfc9;border-color:#8a7f68">닫기</button>`);
  p.dataset.noauto = '1';
  const g = p.querySelector('#cut_grid');
  for (const k of keys) {
    const pages = STORY[k] || [];
    const t = el('div', 'cuttile', `<b>${storyLabel(k)}</b><small>${pages.length}쪽 · ${k}</small>`);
    t.onclick = async () => { closeTop(); await showStory(k); showStoryPicker(); };
    g.appendChild(t);
  }
  p.querySelector('#cut_x').onclick = closeTop;
}
