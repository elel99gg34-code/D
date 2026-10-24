/* ══════════════════════════════════════════════════════════
   백귀야행 — 데스크톱판 껍데기
   ──────────────────────────────────────────────────────────
   하는 일은 창 하나를 띄워 app/index.html 을 보여 주는 것뿐이다.
   알맹이는 game/index.html 그대로이고, 여기서 더하는 것은
   창 크기 기억과 전체화면 단추(F11)뿐이다.
   ══════════════════════════════════════════════════════════ */
const { app, BrowserWindow, Menu, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');

/* 창 크기를 기억해 둔다 — 끌 때의 모습으로 다시 열리게 */
const seatFile = () => path.join(app.getPath('userData'), 'window.json');
function readSeat() {
  try { return JSON.parse(fs.readFileSync(seatFile(), 'utf8')); } catch (e) { return {}; }
}
/* 끌거나 늘리는 동안은 쉰 뒤에 한 번만 적는다 — 움직일 때마다 디스크에 쓰던 것.
   최대화한 채로 꺼도 「보통 크기」를 적어 둔다 — 최대화를 풀면 원래 크기로 돌아오게 */
let _seatT = null;
function writeSeat(win, now) {
  if (!win || win.isDestroyed()) return;
  clearTimeout(_seatT);
  const go = () => {
    if (win.isDestroyed()) return;
    const b = win.getNormalBounds();
    try { fs.writeFileSync(seatFile(), JSON.stringify({ ...b, max: win.isMaximized() })); } catch (e) {}
  };
  if (now) go(); else _seatT = setTimeout(go, 400);
}
/* 적어 둔 자리가 지금 붙은 화면 안에 있는가 — 모니터를 떼면 창이 보이지 않는 곳에 열리던 것 */
function seatOnScreen(s) {
  if (typeof s.x !== 'number' || typeof s.y !== 'number') return false;
  try {
    return screen.getAllDisplays().some(d => { const a = d.workArea;
      return s.x + 120 > a.x && s.x < a.x + a.width - 120 && s.y >= a.y - 20 && s.y < a.y + a.height - 120; });
  } catch (e) { return false; }
}

function makeWindow() {
  const seat = readSeat(), on = seatOnScreen(seat);
  let wa = { width: 1440, height: 900 };
  try { wa = screen.getPrimaryDisplay().workAreaSize; } catch (e) {}
  const win = new BrowserWindow({
    width:  Math.min(seat.width  || 1440, wa.width),
    height: Math.min(seat.height || 900, wa.height),
    x: on ? seat.x : undefined, y: on ? seat.y : undefined,
    minWidth: 900, minHeight: 600,
    backgroundColor: '#0d0b09',
    title: '백귀야행 百鬼夜行',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (seat.max) win.maximize();
  win.once('ready-to-show', () => win.show());
  Menu.setApplicationMenu(null);

  /* 바깥 주소는 게임 창이 아니라 브라우저로 보낸다 */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); shell.openExternal(url); }
  });

  /* 판 74 — 카메라 · 마이크 · 위치 · 알림 같은 권한은 묻지도 않고 거절한다 (게임은 쓰지 않는다) */
  const ALLOW = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock']);
  win.webContents.session.setPermissionRequestHandler((wc, perm, cb) => cb(ALLOW.has(perm)));
  win.webContents.session.setPermissionCheckHandler((wc, perm) => ALLOW.has(perm));
  /* 창 안에 다른 웹 화면(webview)을 붙이지 못하게 */
  win.webContents.on('will-attach-webview', e => e.preventDefault());

  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  for (const ev of ['resize', 'move']) win.on(ev, () => writeSeat(win));
  win.on('close', () => writeSeat(win, true));
  return win;
}

/* 한 벌만 돈다 — 두 번 눌러도 창은 하나 */
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  });
  app.whenReady().then(() => {
    makeWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) makeWindow();
    });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
