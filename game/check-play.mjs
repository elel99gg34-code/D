/* ══════════════════════════════════════════════════════════
   판 검사 (판 69) — 브라우저로 켜서 실제로 놀아 본다
   ──────────────────────────────────────────────────────────
     ① 모든 부적을 실제로 낸다 · 모든 물약 · 수상한 일의 모든 갈래
     ② 모든 막의 조우 · 엘리트 · 보스와 자동으로 싸운다
     ③ 모든 메뉴를 처음 화면 · 지도 · 싸움에서 연다 — 넓은 화면과 폰 가로 화면
     ④ 저장이 깨지면 백업에서 되살린다 · 저장 칸이 꽉 차면 알린다
     ⑤ 두 창 · 한글 조합 Enter · Ctrl 단축키 · 싸움 시작 방어도
     ⑥ 판 68 기능 — 도감 보상 · 요괴 이야기 · 덱 보관함 · 팻 성장 · 통행증 · 복귀 보상
     ⑦ 접근성 — 대화 상자 · 낭독 · 단추 이름 · 창 안 Tab
   node game/check-play.mjs           (CHECK_FILE 로 다른 판도)
   ══════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.env.CHECK_FILE || path.join(HERE, 'index.html');
const { chromium } = await import('playwright-core');
const EXE = process.env.CHROME || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
const b = await chromium.launch(Object.assign({ args: ['--no-sandbox', '--mute-audio'] }, EXE ? { executablePath: EXE } : {}));
const bad = [], good = [];
const ok = (c, m) => { (c ? good : bad).push(m); console.log((c ? '  ○ ' : '  ✗ ') + m); };
const open = async (vp = { width: 1280, height: 720 }, opt = {}) => {
  const ctx = await b.newContext(Object.assign({ viewport: vp }, opt));
  await ctx.route(u => /^https?:/.test(u.href), r => r.abort());
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load|fetch|ERR_/i.test(m.text())) p.errs.push('console: ' + m.text().slice(0, 160)); });
  p.on('dialog', d => d.dismiss());
  await p.goto('file://' + FILE); await p.waitForTimeout(1200);
  await p.evaluate(() => { META.tutorDone = true; META.tourDone = true; OPT.noFriend = true; OPT.noGuide = true; OPT.story = 'off'; OPT.cuts = false; SPEED = 0.02; });
  p.ctx = ctx; return p;
};
console.log('■ 판 검사');
/* ① ② 놀아 본다 */
{
  const p = await open();
  const r = await p.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const out = { cards: [], pots: [], events: [], fights: [], n: 0 };
    newRun(0); closeOverlay();
    const fresh = () => { if (G.b) { G.b.over = true; battleWatch(false); G.b = null; } closeOverlay(); document.querySelectorAll('.cut').forEach(x => x.remove()); if (!G.run) { newRun(0); closeOverlay(); } G.run.hp = G.run.maxHp; };
    const arena = async () => { fresh(); G.run.act = 6; startBattle(['boar', 'spirit'], 'normal'); await sleep(20); for (let i = 0; i < 60 && G.b.busy; i++) await sleep(15); G.b.busy = false; for (const e of G.b.enemies) { e.maxHp = e.hp = 99999; } };
    const WAIT_PICK = new Set(['ready']);                     /* 고르는 창을 띄우고 기다리는 부적 */
    await arena();
    for (const id of Object.keys(CARDS)) {
      if (!G.b || G.b.over || !alive().length) await arena();
      const b = G.b; b.busy = false; b.energy = 9; const c = mkCard(id, false); b.hand.push(c);
      try { await Promise.race([playCard(c, alive()[0]), sleep(WAIT_PICK.has(id) ? 300 : 3000).then(() => { if (!WAIT_PICK.has(id)) throw new Error('3초 넘게 안 끝남'); })]); }
      catch (e) { out.cards.push(id + ': ' + e.message); }
      closeOverlay(); if (G.b) G.b.busy = false; out.n++;
    }
    for (const id of Object.keys(POTIONS)) { await arena(); G.run.potions = [id];
      try { await Promise.race([usePotion(0, alive()[0]), sleep(3000).then(() => { throw new Error('안 끝남'); })]); } catch (e) { out.pots.push(id + ': ' + e.message); } }
    for (const ev of EVENTS) { let opts; fresh(); G.run.gold = 999; G.run.dia = 999;
      try { opts = ev.opts(G.run); } catch (e) { out.events.push(ev.id + ': ' + e.message); continue; }
      for (let i = 0; i < opts.length; i++) { fresh(); G.run.gold = 999; G.run.dia = 999;
        try { const o = ev.opts(G.run)[i]; const res = o.do && o.do(); if (res && res.then) await Promise.race([res, sleep(2500)]); } catch (e) { out.events.push(ev.id + '#' + i + ': ' + e.message); } } }
    for (const act in ENCOUNTERS) { const E = ENCOUNTERS[act];
      for (const [kind, ids] of [['normal', E.normal && E.normal[0]], ['elite', E.elite && E.elite[0]], ['boss', E.boss && [E.boss[0]]]]) {
        if (!ids) continue; fresh(); G.run.act = +act; G.run.maxHp = G.run.hp = 999;
        try { startBattle([].concat(ids), kind); } catch (e) { out.fights.push(act + kind + ' 시작: ' + e.message); continue; }
        for (let i = 0; i < 400 && G.b && !G.b.over; i++) { if (!G.b.busy) { try { autoBattleStep(); } catch (e) { out.fights.push(act + kind + ': ' + e.message); break; } } await sleep(3); if (G.b && G.b.turn > 3) break; } } }
    fresh(); return out;
  });
  ok(!r.cards.length, `모든 부적 ${r.n}장을 실제로 냈다` + (r.cards.length ? ' — ' + r.cards.slice(0, 4).join(' / ') : ''));
  ok(!r.pots.length && !r.events.length, '모든 물약 · 수상한 일의 모든 갈래' + (r.pots.concat(r.events).length ? ' — ' + r.pots.concat(r.events).slice(0, 4).join(' / ') : ''));
  ok(!r.fights.length, '모든 막의 조우 · 엘리트 · 보스와 자동 싸움' + (r.fights.length ? ' — ' + r.fights.slice(0, 4).join(' / ') : ''));
  ok(!p.errs.length, '노는 동안 오류 0' + (p.errs.length ? ' — ' + [...new Set(p.errs)].slice(0, 3).join(' / ') : ''));
  await p.ctx.close();
}
/* ③ 모든 메뉴 */
for (const [nm, vp] of [['넓은 화면', { width: 1280, height: 720 }], ['폰 가로', { width: 740, height: 360 }]]) {
  const p = await open(vp);
  await p.evaluate(() => { META.cleared = 12; ACCT = { id: 'chk', token: 'c'.repeat(48), nick: '검사', at: Date.now() }; });
  let n = 0;
  for (const s of ['title', 'map', 'battle']) {
    await p.evaluate(s => { try { closeOverlay(); } catch (e) {} document.querySelectorAll('.school,.cut').forEach(x => x.remove());
      if (s === 'title') { G.b = null; G.run = null; showTitle(); } else { if (!G.run) { newRun(0); closeOverlay(); } G.run.act = 6; if (s === 'map') { if (G.b) { G.b.over = true; G.b = null; } showMap(); } else startBattle(ENCOUNTERS[6].normal[0], 'normal'); } }, s);
    await p.waitForTimeout(s === 'battle' ? 1200 : 300);
    n += await p.evaluate(async s => { let k = 0;
      for (const m of MENU_ITEMS) { if (['yield', 'full', 'map', 'auto'].includes(m.k)) continue; let vis; try { vis = !m.show || m.show(); } catch (e) { console.error('show ' + m.k + ' ' + e.message); continue; } if (!vis) continue;
        try { if (m.sub) m.sub(); if (m.dot) m.dot(); const r = m.run(); if (r && r.catch) r.catch(e => console.error('메뉴 ' + m.k + ' ' + e.message)); } catch (e) { console.error('메뉴 ' + m.k + ' ' + e.message); }
        await new Promise(r => setTimeout(r, 60)); try { closeOverlay(); } catch (e) {} document.querySelectorAll('.school').forEach(x => x.remove()); k++; }
      return k; }, s);
  }
  await p.waitForTimeout(500);
  ok(!p.errs.length, `모든 메뉴(${n}번 열기) — 처음 화면 · 지도 · 싸움 · ${nm}` + (p.errs.length ? ' — ' + [...new Set(p.errs)].slice(0, 3).join(' / ') : ''));
  await p.ctx.close();
}
/* ④ ⑤ ⑥ ⑦ */
{
  const p = await open();
  /* 싸움 시작 방어도 */
  await p.evaluate(() => { newRun(0); closeOverlay(); G.run.relics.push({ id: 'march_lamp', used: false }); startBattle(['boar'], 'normal'); }); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => P().block >= 5), '싸움 시작 때 얻은 방어도가 첫 차례에도 남는다');
  await p.evaluate(() => { G.b.over = true; G.b = null; G.run.relics = G.run.relics.filter(r => r.id !== 'march_lamp'); closeOverlay(); showMap(); });
  /* 한글 조합 Enter · Ctrl 단축키 */
  const ime = await p.evaluate(() => { const i = el('input'); document.body.appendChild(i); let hit = 0; i.onkeydown = () => hit++;
    i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })); const a = hit; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); i.remove(); return [a, hit]; });
  await p.evaluate(() => { AUTO.on = false; }); await p.keyboard.down('Control'); await p.keyboard.press('a'); await p.keyboard.up('Control');
  ok(ime[0] === 0 && ime[1] === 1 && await p.evaluate(() => !AUTO.on), '한글 조합 중 Enter 는 막고 · Ctrl+A 는 자동 플레이를 켜지 않는다');
  /* 저장 깨짐 · 꽉 참 */
  await p.evaluate(() => { _bakAt = 0; META.jp = 4321; saveMeta(); sessionStorage.setItem('brk', '1'); G.run.gold = 777; _runBakAt = 0; saveRun(); });
  await p.addInitScript(() => { if (sessionStorage.getItem('brk') === '1') { sessionStorage.setItem('brk', '2'); localStorage.setItem('bge_meta_v1', '{"broken":'); localStorage.setItem('bge_save_v1', '{"run":'); } });
  await p.reload(); await p.waitForTimeout(1500);
  const rs = await p.evaluate(() => { META.tutorDone = true; OPT.story = 'off'; OPT.cuts = false; resumeRun(); return { jp: META.jp, gold: G.run && G.run.gold, bad: !!localStorage.getItem(META_BAD) }; });
  ok(rs.jp === 4321 && rs.gold === 777 && rs.bad, '저장이 깨지면 — 깨진 글은 떼어 두고 백업에서 되살린다 (도감·재화 · 모험)');
  const q = await p.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function () { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; }; META._qt = Date.now(); saveMeta(); Storage.prototype.setItem = o; return _quotaSaid; });
  ok(q, '저장 칸이 꽉 차면 알린다');
  /* 두 창 */
  const p2 = await p.ctx.newPage(); await p2.goto('file://' + FILE); await p2.waitForTimeout(1200);
  ok(await p.evaluate(() => !!document.querySelector('#tabfreeze')) && !(await p2.evaluate(() => !!document.querySelector('#tabfreeze'))), '두 창에서 열면 — 앞 창이 멈춘다');
  await p2.close(); await p.evaluate(() => document.querySelector('#tabfreeze').remove());
  /* 판 68 */
  const f68 = await p.evaluate(() => {
    const o = {}; closeOverlay(); if (!G.run) { newRun(0); closeOverlay(); }
    /* 도감 보상 */
    META.dexPay = {}; dexCardIds().forEach(id => META.dex.cards[id] = 1); dexRelicIds().forEach(id => META.dex.relics[id] = 1); dexEnemyIds().forEach(id => META.dex.enemies[id] = 1);
    o.dex = dexProg().pct === 100 && DEXP.every(x => dexClaim(x)) && achTitles().includes('백귀록') && pfFramesOpen().includes('dex') && !dexClaim(DEXP[0]);
    /* 요괴 이야기 */
    META.ek = { wisp: 9 }; startBattle(['wisp'], 'normal'); G.b.enemies[0].hp = 0; loreKill(G.b.enemies[0]); o.lore = loreGot('wisp') === 1 && loreOf('gumiho').length === 3; G.b.over = true; G.b = null;
    /* 덱 보관함 */
    const dk = { n: '검사', d: ['strike+', 'defend', 'strike'] }; const back = dboxParse(dboxCode(dk)); o.dbox = back && back.d.join() === dk.d.join() && back.n === '검사';
    /* 팻 성장 */
    const pid = PET_POOL[0]; META.pets = { own: { [pid]: { dead: false, need: 0, evo: 0, fed: 0, lv: 4, xp: 190 } }, active: pid, pulls: 0 };
    petXpWin({ kind: 'normal' }); o.pet = petLv(pid) === 5 && petSk(pid, 'guard') && !petSk(pid, 'howl');
    /* 통행증 */
    META.pass = null; passAdd(250); o.pass = passLv() === 2 && passClaim(1) && !passClaim(1) && (META.pass.m = '2000-01', passState().xp === 0);
    /* 복귀 보상 — 한 번만 */
    META.backGot = 0; META.lastPlay = Date.now() - 10 * 864e5; backGive(10 * 864e5); const g1 = !!META.backGot && backBuf() === BACK_BONUS; const at = META.backGot; backGive(10 * 864e5); o.back = g1 && META.backGot === at;
    closeOverlay(); return o;
  });
  ok(Object.values(f68).every(Boolean), '판 68 기능 — ' + Object.entries(f68).map(([k, v]) => (v ? '' : '✗') + k).join(' · '));
  /* 접근성 */
  await p.evaluate(() => { closeOverlay(); showDex(); }); await p.waitForTimeout(300);
  const ax = await p.evaluate(() => { const d = document.querySelector('#overlay .panel'); return { dlg: d && d.getAttribute('role') === 'dialog' && !!d.getAttribute('aria-label'), live: document.querySelector('#toast').getAttribute('aria-live') === 'polite' }; });
  const f = await p.evaluate(() => { const bs = [...document.querySelector('#overlay').lastElementChild.querySelectorAll('button')].filter(x => x.offsetParent); bs[bs.length - 1].focus(); return bs.length; });
  await p.keyboard.press('Tab');
  const trap = await p.evaluate(() => document.querySelector('#overlay').lastElementChild.contains(document.activeElement));
  ok(ax.dlg && ax.live && trap, '접근성 — 대화 상자 이름표 · 알림 낭독 · 창 안에서만 Tab');
  /* 판 70 — 손이 미끄러질 때 · 화면 · 아우라 */
  await p.evaluate(() => closeOverlay());
  const gb = await p.evaluate(() => { window._hit = 0; const m = modal('<h2>시험</h2><button class="brush-btn" id="gx">눌러</button>'); const x = m.querySelector('#gx'); x.onclick = () => window._hit++; const r = x.getBoundingClientRect(); return { x: r.x + 5, y: r.y + 5 }; });
  await p.mouse.click(gb.x, gb.y); const g1 = await p.evaluate(() => _hit); await p.waitForTimeout(280); await p.mouse.click(gb.x, gb.y);
  ok(g1 === 0 && await p.evaluate(() => _hit) === 1, '판 70 — 창이 뜬 직후의 누름은 흘리고, 그 뒤는 받는다');
  await p.evaluate(() => { closeOverlay(); if (G.b) { G.b.over = true; G.b = null; } OPT.endWarn = false; startBattle(['boar'], 'normal'); }); await p.waitForTimeout(1600);
  const t0 = await p.evaluate(() => G.b.turn); await p.waitForTimeout(400); await p.dblclick('#endturn');
  await p.waitForFunction(() => G.b && !G.b.busy, null, { timeout: 15000 }).catch(() => {});
  const t1 = await p.evaluate(() => G.b.turn), tl = await p.evaluate(() => TLOG.slice(0, 6).map(x => x.m).join('|'));
  ok(t1 === t0 + 1 && !/엉켜|막힌 자리/.test(tl), `판 70 — 차례 끝을 두 번 눌러도 한 번만 (${t0}→${t1})`);
  const gh = await p.evaluate(async () => { const pl = P(); pl.hp = pl.maxHp; syncPlayer(); await new Promise(r => setTimeout(r, 450)); pl.hp = Math.round(pl.maxHp / 2); syncPlayer(); await new Promise(r => setTimeout(r, 100)); const g = pl.el.querySelector('.ebar .hpg'), bar = pl.el.querySelector('.ebar i'); return !!g && parseFloat(g.style.width) > parseFloat(bar.style.width) + 20; });
  const au = await p.evaluate(() => { auraState(); return [document.querySelectorAll('#bg .aur').length, document.body.dataset.aura]; });
  ok(gh && au[0] === 4 && au[1] === 'fight', `판 70 — 체력 잔상 · 배경 아우라 ${au.join(' ')}`);
  ok(await p.evaluate(() => qHit('구미호', 'ㄱㅁㅎ') && hanToKey('ㅠㅁ다ㅛㅁ') === 'baekya' && fullHalf('ＡＢ１') === 'AB1'), '판 70 — 초성 찾기 · 한글 자판 아이디 · 전각 글자');
  await p.evaluate(() => { G.b.over = true; G.b = null; closeOverlay(); });
  ok(!p.errs.filter(e => !/QuotaExceeded|bge_/.test(e)).length, '기능 검사 동안 오류 0' + (p.errs.length ? ' — ' + [...new Set(p.errs)].slice(0, 3).join(' / ') : ''));
  await p.ctx.close();
}
/* 움직임 줄이기 */
{
  const p = await open({ width: 1280, height: 720 }, { reducedMotion: 'reduce' });
  ok(await p.evaluate(() => OPT.noFlash === true && OPT.shake === false), '기기의 「움직임 줄이기」를 처음부터 따른다');
  await p.ctx.close();
}
await b.close();
const line = `■ 판 검사 — 통과 ${good.length} · 고칠 것 ${bad.length}`;
console.log('\n' + line);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 판 검사\n\n| | 항목 |\n|---|---|\n${good.map(m => `| ○ | ${m} |`).join('\n')}\n${bad.map(m => `| ✗ | ${m} |`).join('\n')}\n\n${line}\n\n`);
process.exit(bad.length ? 1 : 0);
