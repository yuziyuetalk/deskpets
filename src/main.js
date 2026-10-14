const { app, BrowserWindow, dialog, ipcMain, Menu, Tray, nativeImage, screen, powerMonitor, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { Store } = require('./store');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const startupHidden = process.argv.includes('--hidden');
const portableExe = process.env.PORTABLE_EXECUTABLE_FILE || (app.isPackaged ? process.execPath : path.join(__dirname, '..', 'DeskPets-dev.exe'));
const dataDir = process.env.DESKPETS_TEST_USERDATA && !app.isPackaged ? process.env.DESKPETS_TEST_USERDATA : path.join(path.dirname(portableExe), 'petsdata');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, 'cache'), { recursive: true });
app.setPath('userData', dataDir);
app.setPath('sessionData', path.join(dataDir, 'cache'));

let store;
let manager;
let musicPlayer;
let tray;
let userPaused = false;
let screenLocked = false;
let onBattery = false;
let fullscreen = false;
let fullscreenMonitor;
let cursorTimer;
const overlays = new Map();
const isWindows = process.platform === 'win32';
const scripts = app.isPackaged ? path.join(process.resourcesPath, 'windows') : path.join(__dirname, 'windows');
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
else app.on('second-instance', (_event, commandLine) => { if (manager && !commandLine.includes('--hidden')) showManager(); });
function resolvedTheme() { return store?.state.settings.theme === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : (store?.state.settings.theme || 'dark'); }
function applyTheme() {
  if (nativeTheme.themeSource !== store.state.settings.theme) nativeTheme.themeSource = store.state.settings.theme;
  const dark = resolvedTheme() === 'dark';
  if (manager && !manager.isDestroyed()) {
    manager.setTitleBarOverlay({ color: dark ? '#171c21' : '#f3f6f2', symbolColor: dark ? '#e9f0eb' : '#203029', height: 42 });
    manager.setBackgroundColor(dark ? '#101318' : '#f4f7f3');
  }
  broadcast('theme:changed', resolvedTheme());
}

function activeScene() { return store.state.scenes.find(scene => scene.id === store.state.activeSceneId); }
function assetPath(asset) { return path.isAbsolute(asset.path) ? asset.path : path.join(dataDir, asset.path); }
function displays() {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map(display => ({
    id: String(display.id),
    name: display.label || `显示器 ${display.id}`,
    primary: display.id === primary,
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor
  }));
}
function publicState() {
  const state = store.get();
  state.assets = state.assets.map(asset => ({
    ...asset,
    path: assetPath(asset),
    exists: fs.existsSync(assetPath(asset)),
    url: pathToFileURL(asset.playbackPath && fs.existsSync(asset.playbackPath) ? asset.playbackPath : assetPath(asset)).href
  }));
  return state;
}
function broadcast(channel, payload) {
  if (manager && !manager.isDestroyed()) manager.webContents.send(channel, payload);
  if (musicPlayer && !musicPlayer.isDestroyed()) musicPlayer.webContents.send(channel, payload);
  for (const win of overlays.values()) if (!win.isDestroyed()) win.webContents.send(channel, payload);
}
function pausedReasons() {
  const reasons = [];
  if (userPaused) reasons.push('manual');
  if (screenLocked) reasons.push('locked');
  if (store.state.settings.pauseOnBattery && onBattery) reasons.push('battery');
  if (store.state.settings.pauseOnFullscreen && fullscreen) reasons.push('fullscreen');
  return reasons;
}
function updatePlayback() { broadcast('playback:changed', { paused: pausedReasons().length > 0, reasons: pausedReasons() }); updateTray(); }
function notify(message, type = 'info') { broadcast('notice', { message, type }); }
function sync() {
  syncOverlays();
  broadcast('state:changed', publicState());
  updatePlayback();
}
function update(mutator) { const state = store.update(mutator); sync(); return state; }
function getDisplayForPet(pet, list = displays()) {
  return list.find(display => display.id === pet.monitorId) || list.find(display => display.primary) || list[0];
}

function createManager() {
  manager = new BrowserWindow({
    width: 1220, height: 800, minWidth: 970, minHeight: 620,
    title: 'DeskPets', backgroundColor: '#101318', show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#171c21', symbolColor: '#e9f0eb', height: 42 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  manager.loadFile(path.join(__dirname, 'manager.html'));
  applyTheme();
  manager.webContents.on('console-message', details => { if (details.level === 'error') console.error('Manager:', details.message); });
  manager.once('ready-to-show', () => {
    if (!startupHidden) manager.show();
    if (!app.isPackaged && process.env.DESKPETS_SCREENSHOT) {
      setTimeout(async () => {
        try {
          const image = await manager.webContents.capturePage();
          fs.writeFileSync(process.env.DESKPETS_SCREENSHOT, image.toPNG());
          console.log(`Screenshot saved: ${process.env.DESKPETS_SCREENSHOT}`);
          for (const [key, win] of overlays) {
            if (!win.isDestroyed() && win.deskPetsReady) {
              const overlayPath = process.env.DESKPETS_SCREENSHOT.replace(/\.png$/i, `-${key.replace(':', '-')}.png`);
              fs.writeFileSync(overlayPath, (await win.webContents.capturePage()).toPNG());
              console.log(`Overlay screenshot saved: ${overlayPath}`);
            }
          }
        } catch (error) { console.error('Screenshot failed:', error); }
        app.isQuitting = true;
        app.quit();
      }, 2000);
    }
  });
  manager.on('close', event => {
    if (!app.isQuitting) { event.preventDefault(); manager.hide(); }
  });
}
function showManager() { if (manager) { manager.show(); manager.focus(); } }

function createMusicPlayer() {
  musicPlayer = new BrowserWindow({
    width: 1, height: 1, show: false, skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  musicPlayer.loadFile(path.join(__dirname, 'music.html'));
  musicPlayer.webContents.on('console-message', details => { if (details.level === 'error') console.error('Music:', details.message); });
  musicPlayer.webContents.once('did-finish-load', () => {
    musicPlayer.webContents.send('state:changed', publicState());
    musicPlayer.webContents.send('playback:changed', { paused: pausedReasons().length > 0, reasons: pausedReasons() });
  });
}

function overlayKey(displayId, layer) { return `${displayId}:${layer}`; }
function createOverlay(display, layer) {
  const win = new BrowserWindow({
    x: display.bounds.x, y: display.bounds.y,
    width: display.bounds.width, height: display.bounds.height,
    frame: false, transparent: true, backgroundColor: '#00000000',
    hasShadow: false, focusable: false, skipTaskbar: true,
    show: false, resizable: false,
    alwaysOnTop: layer === 'floating',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  win.deskPetsReady = false;
  win.setIgnoreMouseEvents(true, { forward: true });
  if (layer === 'floating') win.setAlwaysOnTop(true, 'floating');
  win.loadFile(path.join(__dirname, 'overlay.html'), { query: { display: display.id, layer } });
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('state:changed', publicState());
    win.webContents.send('displays:changed', displays());
    win.webContents.send('playback:changed', { paused: pausedReasons().length > 0, reasons: pausedReasons() });
    if (layer === 'desktop' && isWindows) {
      attachToDesktop(win).then(ok => {
        if (!win.isDestroyed()) {
          if (ok) { win.deskPetsReady = true; console.log(`Desktop layer attached: ${display.id}`); if (store.state.settings.showPets) { win.showInactive(); setTimeout(() => { if (!win.isDestroyed()) attachToDesktop(win); }, 250); } }
          else { win.destroy(); const key = overlayKey(display.id, layer); if (overlays.get(key) === win) overlays.delete(key); notify('桌面层挂载失败。请尝试悬浮模式，或重启 Windows 资源管理器后重试。', 'error'); }
        }
      });
    } else { win.deskPetsReady = true; if (store.state.settings.showPets) win.showInactive(); }
  });
  win.on('closed', () => { const key = overlayKey(display.id, layer); if (overlays.get(key) === win) overlays.delete(key); });
  return win;
}
function syncOverlays() {
  if (!store) return;
  const list = displays();
  const scene = activeScene();
  const needed = new Set();
  for (const pet of scene.pets) {
    if (!pet.visible || !pet.assetIds.length) continue;
    if (!pet.assetIds.some(id => store.state.assets.some(asset => asset.id === id && asset.status === 'ready' && fs.existsSync(asset.playbackPath || assetPath(asset))))) continue;
    const display = getDisplayForPet(pet, list);
    if (display) needed.add(overlayKey(display.id, pet.layer));
  }
  for (const [key, win] of overlays) {
    if (!needed.has(key)) { overlays.delete(key); if (!win.isDestroyed()) win.destroy(); }
  }
  for (const key of needed) {
    const [displayId, layer] = key.split(':');
    const display = list.find(item => item.id === displayId);
    if (!display) continue;
    let win = overlays.get(key);
    if (!win || win.isDestroyed()) { win = createOverlay(display, layer); overlays.set(key, win); }
    else {
      const bounds = win.getBounds();
      if (bounds.x !== display.bounds.x || bounds.y !== display.bounds.y || bounds.width !== display.bounds.width || bounds.height !== display.bounds.height) {
        win.setBounds(display.bounds);
      }
    }
    if (store.state.settings.showPets && win.deskPetsReady && !win.isVisible()) win.showInactive();
    if (!store.state.settings.showPets && win.isVisible()) win.hide();
  }
}

function runWindowsScript(name, args = []) {
  return new Promise(resolve => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(scripts, name), ...args.map(String)], { windowsHide: true });
    let output = '';
    let error = '';
    child.stdout.on('data', data => { output += data.toString(); });
    child.stderr.on('data', data => { error += data.toString(); });
    child.on('error', err => resolve({ ok: false, output: err.message }));
    child.on('close', code => resolve({ ok: code === 0, output: (output || error).trim() }));
  });
}
async function attachToDesktop(win) {
  try {
    const handle = win.getNativeWindowHandle();
    const id = process.arch === 'ia32' ? BigInt(handle.readUInt32LE()) : handle.readBigUInt64LE();
    const result = await runWindowsScript('desktop-layer.ps1', [id.toString()]);
    return result.ok && result.output.includes('ATTACHED');
  } catch { return false; }
}
async function applyWallpaper(assetId) {
  if (!assetId) return;
  const asset = store.state.assets.find(item => item.id === assetId && item.kind === 'image');
  if (!asset || !fs.existsSync(assetPath(asset))) { notify('壁纸图片不存在。', 'error'); return; }
  if (!isWindows) { notify('当前版本仅在 Windows 上更换壁纸。', 'error'); return; }
  const result = await runWindowsScript('set-wallpaper.ps1', [assetPath(asset)]);
  if (!result.ok) notify(`更换壁纸失败：${result.output}`, 'error');
}
function startFullscreenMonitor() {
  if (!isWindows) return;
  fullscreenMonitor = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(scripts, 'fullscreen-monitor.ps1'), '-ExcludeProcessId', String(process.pid)], { windowsHide: true });
  let buffer = '';
  fullscreenMonitor.stdout.on('data', data => {
    buffer += data.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) {
      if (line === 'FULLSCREEN 1' || line === 'FULLSCREEN 0') {
        const next = line.endsWith('1');
        if (next !== fullscreen) { fullscreen = next; updatePlayback(); }
      }
    }
  });
  fullscreenMonitor.on('error', () => {});
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png')));
  tray.setToolTip('DeskPets');
  tray.on('double-click', showManager);
  updateTray();
}
function updateTray() {
  if (!tray || !store) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 DeskPets', click: showManager },
    { label: store.state.settings.showPets ? '隐藏所有桌宠' : '显示所有桌宠', click: () => update(state => { state.settings.showPets = !state.settings.showPets; }) },
    { label: userPaused ? '继续播放' : '暂停播放', click: () => { userPaused = !userPaused; updatePlayback(); } },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
}

function registerIpc() {
  ipcMain.handle('state:get', () => publicState());
  ipcMain.handle('displays:get', () => displays());
  ipcMain.handle('manager:show', showManager);
  ipcMain.handle('media:import', async (_event, kind) => {
    if (!['video', 'image', 'audio'].includes(kind)) return [];
    const image = kind === 'image';
    const audio = kind === 'audio';
    const allowed = image ? ['png', 'jpg', 'jpeg', 'webp', 'bmp'] : audio ? ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'] : ['webm'];
    const result = await dialog.showOpenDialog(manager, {
      title: image ? '导入图片壁纸' : audio ? '导入音乐' : '导入透明视频',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: image ? '图片' : audio ? '音乐' : 'WebM 视频', extensions: allowed }]
    });
    if (result.canceled || !result.filePaths.length) return [];
    const imported = [];
    const copied = [];
    for (const filePath of result.filePaths) {
      const ext = path.extname(filePath).slice(1).toLowerCase();
      if (!allowed.includes(ext)) continue;
      const id = randomUUID();
      const folder = path.join(dataDir, image ? 'wallpapers' : audio ? 'music' : 'media');
      fs.mkdirSync(folder, { recursive: true });
      const target = path.join(folder, `${id}.${ext}`);
      try {
        await fs.promises.copyFile(filePath, target);
        copied.push({ id, path: path.relative(dataDir, target), name: path.basename(filePath), kind, format: ext, status: 'ready', error: null });
        imported.push(id);
      } catch (error) { notify(`导入失败：${path.basename(filePath)} · ${error.message}`, 'error'); }
    }
    if (copied.length) update(state => { state.assets.push(...copied); });
    return imported;
  });
  ipcMain.handle('asset:remove', (_event, id) => {
    const item = store.state.assets.find(asset => asset.id === id);
    const result = update(state => {
      state.assets = state.assets.filter(asset => asset.id !== id);
      for (const scene of state.scenes) {
        scene.pets = scene.pets.map(pet => ({ ...pet, assetIds: pet.assetIds.filter(assetId => assetId !== id) })).filter(pet => pet.assetIds.length);
        if (scene.wallpaper === id) scene.wallpaper = null;
        scene.musicIds = scene.musicIds.filter(assetId => assetId !== id);
      }
    });
    if (item && path.resolve(assetPath(item)).startsWith(path.resolve(dataDir) + path.sep)) fs.promises.unlink(assetPath(item)).catch(() => {});
    return result;
  });
  ipcMain.handle('pet:add', (_event, assetId, monitorId) => {
    if (!store.state.assets.some(asset => asset.id === assetId && asset.kind === 'video')) return null;
    const id = randomUUID();
    update(state => {
      const scene = state.scenes.find(item => item.id === state.activeSceneId);
      const asset = state.assets.find(item => item.id === assetId);
      scene.pets.push({ id, name: asset.name.replace(/\.[^.]+$/, ''), assetIds: [assetId], layer: 'desktop', monitorId: String(monitorId || 'primary'), x: 0.62, y: 0.56, width: 0.24, speed: 1, opacity: 1, motion: 'fixed', motionDuration: 20, routePoints: [], hoverStyle: 'sparkle', visible: true });
    });
    return id;
  });
  ipcMain.handle('pet:patch', (_event, id, patch) => update(state => {
    const pet = state.scenes.flatMap(scene => scene.pets).find(item => item.id === id);
    if (!pet || !patch || typeof patch !== 'object') return;
    for (const key of ['name', 'layer', 'monitorId', 'x', 'y', 'width', 'speed', 'opacity', 'motion', 'motionDuration', 'routePoints', 'hoverStyle', 'visible']) {
      if (Object.hasOwn(patch, key)) pet[key] = patch[key];
    }
  }));
  ipcMain.handle('pet:remove', (_event, id) => update(state => { for (const scene of state.scenes) scene.pets = scene.pets.filter(pet => pet.id !== id); }));
  ipcMain.handle('scene:add', () => {
    const id = randomUUID();
    update(state => { state.scenes.push({ id, name: `场景 ${state.scenes.length + 1}`, wallpaper: null, musicIds: [], musicVolume: 0.7, pets: [] }); state.activeSceneId = id; });
    return id;
  });
  ipcMain.handle('scene:rename', (_event, id, name) => update(state => {
    const scene = state.scenes.find(item => item.id === id);
    if (scene) scene.name = String(name || '未命名场景').slice(0, 80);
  }));
  ipcMain.handle('scene:delete', (_event, id) => update(state => {
    if (state.scenes.length < 2) return;
    state.scenes = state.scenes.filter(scene => scene.id !== id);
    if (state.activeSceneId === id) state.activeSceneId = state.scenes[0].id;
  }));
  ipcMain.handle('scene:activate', (_event, id) => {
    if (!store.state.scenes.some(scene => scene.id === id)) return;
    update(state => { state.activeSceneId = id; });
    applyWallpaper(activeScene().wallpaper);
  });
  ipcMain.handle('scene:wallpaper', (_event, assetId) => {
    if (assetId && !store.state.assets.some(asset => asset.id === assetId && asset.kind === 'image')) return;
    update(state => { state.scenes.find(scene => scene.id === state.activeSceneId).wallpaper = assetId || null; });
    applyWallpaper(assetId);
  });
  ipcMain.handle('scene:music:add', (_event, assetId) => {
    if (!store.state.assets.some(asset => asset.id === assetId && asset.kind === 'audio')) return;
    return update(state => { const scene = state.scenes.find(item => item.id === state.activeSceneId); if (!scene.musicIds.includes(assetId)) scene.musicIds.push(assetId); });
  });
  ipcMain.handle('scene:music:remove', (_event, assetId) => update(state => {
    const scene = state.scenes.find(item => item.id === state.activeSceneId);
    scene.musicIds = scene.musicIds.filter(id => id !== assetId);
  }));
  ipcMain.handle('scene:music:volume', (_event, volume) => update(state => {
    state.scenes.find(item => item.id === state.activeSceneId).musicVolume = Math.min(1, Math.max(0, Number(volume) || 0));
  }));
  ipcMain.handle('settings:update', (_event, patch) => {
    const allowed = ['launchAtLogin', 'pauseOnBattery', 'pauseOnFullscreen', 'mute', 'showPets'];
    update(state => { for (const key of allowed) if (Object.hasOwn(patch || {}, key)) state.settings[key] = Boolean(patch[key]); });
    if (['dark', 'light', 'system'].includes(patch?.theme)) { update(state => { state.settings.theme = patch.theme; }); applyTheme(); }
    if (Object.hasOwn(patch || {}, 'launchAtLogin')) app.setLoginItemSettings({ openAtLogin: store.state.settings.launchAtLogin, path: portableExe, args: ['--hidden'] });
  });
  ipcMain.handle('playback:pause', (_event, value) => { userPaused = Boolean(value); updatePlayback(); return userPaused; });
}

if (hasInstanceLock) app.whenReady().then(() => {
  store = new Store(path.join(app.getPath('userData'), 'deskpets.json'));
  if (store.state.settings.launchAtLogin && isWindows) app.setLoginItemSettings({ openAtLogin: true, path: portableExe, args: ['--hidden'] });
  applyTheme();
  onBattery = powerMonitor.isOnBatteryPower();
  registerIpc();
  createManager();
  createMusicPlayer();
  createTray();
  syncOverlays();
  cursorTimer = setInterval(() => {
    if (!overlays.size || pausedReasons().length || !store.state.settings.showPets) return;
    const point = screen.getCursorScreenPoint();
    for (const win of overlays.values()) if (!win.isDestroyed() && win.deskPetsReady && win.isVisible()) win.webContents.send('cursor:move', point);
  }, 50);
  startFullscreenMonitor();
  screen.on('display-added', displayChanged);
  screen.on('display-removed', displayChanged);
  screen.on('display-metrics-changed', displayChanged);
  powerMonitor.on('on-battery', () => { onBattery = true; updatePlayback(); });
  powerMonitor.on('on-ac', () => { onBattery = false; updatePlayback(); });
  powerMonitor.on('lock-screen', () => { screenLocked = true; updatePlayback(); });
  powerMonitor.on('unlock-screen', () => { screenLocked = false; updatePlayback(); });
  nativeTheme.on('updated', () => { if (store.state.settings.theme === 'system') applyTheme(); });
  if (isWindows) setInterval(() => {
    for (const [key, win] of overlays) {
      if (key.endsWith(':desktop') && !win.isDestroyed() && win.isVisible()) attachToDesktop(win);
    }
  }, 45000).unref();
});
function displayChanged() {
  const windows = [...overlays.values()];
  overlays.clear();
  for (const win of windows) if (!win.isDestroyed()) win.destroy();
  syncOverlays();
  broadcast('displays:changed', displays());
}
app.on('activate', showManager);
app.on('window-all-closed', () => {});
app.on('before-quit', () => { app.isQuitting = true; if (fullscreenMonitor) fullscreenMonitor.kill(); if (cursorTimer) clearInterval(cursorTimer); });
