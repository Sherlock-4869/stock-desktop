'use strict';

const path = require('path');
const { app, BrowserWindow, ipcMain, safeStorage, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const { parseDeepLink, protocolTargetFromArgv, isRendererRequest } = require('../shared/protocol');
const { PreferencesStore } = require('./preferences-store');
const { TokenVault } = require('./token-vault');
const { DesktopApiClient } = require('./api-client');
const { createUpdateService } = require('./updates');

const PROTOCOL = 'stockwatch';
const MAIN_HTML = path.join(__dirname, '..', 'renderer', 'main.html');
const OVERLAY_HTML = path.join(__dirname, '..', 'renderer', 'overlay.html');

let mainWindow = null;
let overlayWindow = null;
let pendingTarget = protocolTargetFromArgv(process.argv);
let preferences = null;
let apiClient = null;
let updateService = null;
let refreshTimer = null;

function isDesktopWindow(webContents) {
  return webContents === mainWindow?.webContents || webContents === overlayWindow?.webContents;
}

function assertDesktopWindow(event) {
  if (!isDesktopWindow(event.sender)) throw new Error('不受信任的 IPC 调用');
}

function assertMainWindow(event) {
  if (event.sender !== mainWindow?.webContents) throw new Error('此操作只能由主窗口发起');
}

function preloadOptions() {
  return {
    preload:path.join(__dirname, '..', 'preload', 'index.js'),
    contextIsolation:true,
    nodeIntegration:false,
    sandbox:true,
    webSecurity:true,
    spellcheck:false,
  };
}

function protectWebContents(contents) {
  contents.setWindowOpenHandler(() => ({ action:'deny' }));
  contents.on('will-navigate', event => event.preventDefault());
  contents.on('will-attach-webview', event => event.preventDefault());
}

function sendToMain(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function sendTarget(target) {
  if (!target) return;
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingTarget = target;
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('desktop:navigate', target);
}

function registerProtocol() {
  if (app.isPackaged) {
    app.setAsDefaultProtocolClient(PROTOCOL);
    return;
  }
  const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
  if (entry) app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [entry]);
}

function createMainWindow() {
  const storedBounds = preferences.getPublic().mainWindowBounds;
  mainWindow = new BrowserWindow({
    width:storedBounds?.width || 1180,
    height:storedBounds?.height || 760,
    x:storedBounds?.x,
    y:storedBounds?.y,
    minWidth:900,
    minHeight:620,
    show:false,
    title:'Stock Watch',
    backgroundColor:'#0c111b',
    webPreferences:preloadOptions(),
  });
  protectWebContents(mainWindow.webContents);
  mainWindow.loadFile(MAIN_HTML);
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (pendingTarget) {
      const target = pendingTarget;
      pendingTarget = null;
      sendTarget(target);
    }
  });
  let saveBoundsTimer = null;
  mainWindow.on('resize', () => {
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(() => preferences.setMainWindowBounds(mainWindow.getBounds()), 250);
  });
  mainWindow.on('move', () => {
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(() => preferences.setMainWindowBounds(mainWindow.getBounds()), 250);
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function applyOverlayPreferences(values) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (values.bounds) overlayWindow.setBounds(values.bounds);
  overlayWindow.setOpacity(values.opacity);
  overlayWindow.setAlwaysOnTop(values.alwaysOnTop);
  if (process.platform === 'darwin') {
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen:true });
    if (values.alwaysOnTop) overlayWindow.setAlwaysOnTop(true, 'floating', 1);
  }
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.show();
    overlayWindow.focus();
    return overlayWindow;
  }
  const saved = preferences.getPublic().overlay;
  overlayWindow = new BrowserWindow({
    width:saved.bounds?.width || 500,
    height:saved.bounds?.height || 390,
    x:saved.bounds?.x,
    y:saved.bounds?.y,
    minWidth:360,
    minHeight:230,
    frame:false,
    transparent:true,
    resizable:true,
    alwaysOnTop:saved.alwaysOnTop,
    focusable:true,
    skipTaskbar:true,
    hasShadow:true,
    show:false,
    title:'Stock Watch 盯盘',
    backgroundColor:'#00000000',
    webPreferences:preloadOptions(),
  });
  protectWebContents(overlayWindow.webContents);
  overlayWindow.loadFile(OVERLAY_HTML);
  overlayWindow.once('ready-to-show', () => {
    applyOverlayPreferences(saved);
    overlayWindow.show();
  });
  let saveBoundsTimer = null;
  const saveBounds = () => {
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(() => {
      if (overlayWindow && !overlayWindow.isDestroyed()) preferences.setOverlay({ bounds:overlayWindow.getBounds() });
    }, 250);
  };
  overlayWindow.on('resize', saveBounds);
  overlayWindow.on('move', saveBounds);
  overlayWindow.on('closed', () => { overlayWindow = null; });
  return overlayWindow;
}

function configurePermissions() {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
}

function registerIpc() {
  ipcMain.handle('desktop:bootstrap', async event => {
    assertDesktopWindow(event);
    return { ...(await apiClient.bootstrap()), settings:preferences.getPublic() };
  });
  ipcMain.handle('desktop:set-server-url', async (event, value) => {
    assertMainWindow(event);
    return { serverUrl:preferences.setServerUrl(value) };
  });
  ipcMain.handle('desktop:login', async (event, credentials) => {
    assertMainWindow(event);
    if (!credentials || typeof credentials !== 'object') throw new Error('登录信息不正确');
    const username = String(credentials.username || '').trim();
    const password = String(credentials.password || '');
    if (!username || !password || username.length > 64 || password.length > 128) throw new Error('登录信息不正确');
    return apiClient.login({ username, password });
  });
  ipcMain.handle('desktop:request', async (event, request) => {
    assertDesktopWindow(event);
    const allowed = isRendererRequest(request);
    if (!allowed) throw new Error('渲染层不能调用该桌面端接口');
    return apiClient.request(allowed);
  });
  ipcMain.handle('desktop:logout', async event => {
    assertMainWindow(event);
    await apiClient.logout();
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close();
    return { loggedOut:true };
  });
  ipcMain.handle('desktop:overlay-open', async event => {
    assertMainWindow(event);
    createOverlayWindow();
    return preferences.getPublic().overlay;
  });
  ipcMain.handle('desktop:overlay-close', async event => {
    assertDesktopWindow(event);
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close();
    return { closed:true };
  });
  ipcMain.handle('desktop:overlay-update', async (event, update) => {
    assertDesktopWindow(event);
    if (!update || typeof update !== 'object' || Array.isArray(update)) throw new Error('悬浮窗设置不正确');
    const values = preferences.setOverlay(update);
    applyOverlayPreferences(values);
    if (typeof values.groupId === 'string' && overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('desktop:overlay-group', values.groupId);
    }
    return values;
  });
  ipcMain.handle('desktop:update-check', async event => {
    assertMainWindow(event);
    return updateService.check();
  });
  ipcMain.handle('desktop:update-download', async event => {
    assertMainWindow(event);
    await updateService.download();
    return { downloading:true };
  });
  ipcMain.handle('desktop:update-install', async event => {
    assertMainWindow(event);
    updateService.install();
    return { installing:true };
  });
}

function startSessionRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(async () => {
    if (!apiClient.session?.token) return;
    try {
      const result = await apiClient.refresh();
      sendToMain('desktop:session-refreshed', { auth:result.payload, secureStorageAvailable:result.persisted });
    } catch (_) {
      // The renderer will surface an error on its next data refresh. No secret
      // or server response body is logged from this long-running path.
    }
  }, 12 * 60 * 60 * 1000);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => sendTarget(protocolTargetFromArgv(argv)));
  app.on('open-url', (event, url) => {
    event.preventDefault();
    sendTarget(parseDeepLink(url));
  });
  app.whenReady().then(() => {
    preferences = new PreferencesStore(app.getPath('userData'));
    preferences.load();
    apiClient = new DesktopApiClient({
      preferences,
      vault:new TokenVault(app.getPath('userData'), safeStorage),
    });
    configurePermissions();
    registerProtocol();
    registerIpc();
    createMainWindow();
    updateService = createUpdateService({ app, autoUpdater, send:sendToMain });
    updateService.start();
    startSessionRefresh();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (!mainWindow) createMainWindow();
});
app.on('before-quit', () => {
  clearInterval(refreshTimer);
  updateService?.stop();
});
