/* ══════════════════════════════════════════════════════════
   백귀야행 — 데스크톱판 껍데기
   ──────────────────────────────────────────────────────────
   하는 일은 창 하나를 띄워 app/index.html 을 보여 주는 것뿐이다.
   알맹이는 game/index.html 그대로이고, 여기서 더하는 것은
   창 크기 기억과 전체화면 단추(F11)뿐이다.
   ══════════════════════════════════════════════════════════ */
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

/* 창 크기를 기억해 둔다 — 끌 때의 모습으로 다시 열리게 */
const seatFile = () => path.join(app.getPath('userData'), 'window.json');
function readSeat() {
  try { return JSON.parse(fs.readFileSync(seatFile(), 'utf8')); } catch (e) { return {}; }
}
function writeSeat(win) {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  try { fs.writeFileSync(seatFile(), JSON.stringify({ ...b, max: win.isMaximized() })); } catch (e) {}
}

function makeWindow() {
  const seat = readSeat();
  const win = new BrowserWindow({
    width:  seat.width  || 1440,
    height: seat.height || 900,
    x: seat.x, y: seat.y,
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

  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  for (const ev of ['resize', 'move', 'close']) win.on(ev, () => writeSeat(win));
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
