const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const CONFIG_NAME = 'aeroslate-native.json';
const LEGACY_CONFIG_NAME = 'dispatchlink-native.json';
let mainWindow = null;

function configPath(name = CONFIG_NAME) { return path.join(app.getPath('userData'), name); }
function readConfig() {
  for (const name of [CONFIG_NAME, LEGACY_CONFIG_NAME]) {
    try { return JSON.parse(fs.readFileSync(configPath(name), 'utf8')); } catch { /* try next */ }
  }
  return {};
}
function normalizeAppUrl(value) { const raw = String(value || '').trim().replace(/\/+$/, ''); return /^https?:\/\//i.test(raw) ? raw : ''; }
function writeConfig(next) { fs.mkdirSync(path.dirname(configPath()), { recursive: true }); fs.writeFileSync(configPath(), JSON.stringify({ ...readConfig(), ...next }, null, 2)); }
function selectedAppUrl() {
  const arg = process.argv.find(value => value.startsWith('--app-url='))?.slice('--app-url='.length);
  return normalizeAppUrl(arg || process.env.AEROSLATE_APP_URL || process.env.DISPATCHLINK_APP_URL || readConfig().appUrl || (app.isPackaged ? '' : 'http://localhost:5173'));
}

function providerWindow(url, parent, title = 'AeroSlate Provider') {
  const child = new BrowserWindow({ width: 1420, height: 920, parent, backgroundColor: '#071018', autoHideMenuBar: true, title,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'persist:aeroslate-providers' } });
  configureWindowOpen(child.webContents, child); void child.loadURL(url); return child;
}
function configureWindowOpen(contents, parent) {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(?:[^/]+\.)?(?:simbrief\.com|navigraph\.com)\//i.test(url)) { providerWindow(url, parent); return { action: 'deny' }; }
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
}
function createMainWindow(appUrl) {
  const win = new BrowserWindow({ width: 1560, height: 980, minWidth: 900, minHeight: 620, backgroundColor: '#071018', title: 'AeroSlate EFB', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true, partition: 'persist:aeroslate-app' } });
  mainWindow = win; configureWindowOpen(win.webContents, win);
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    const detail = `${validatedUrl}. ${errorDescription}`.replace(/[<>&]/g, '');
    void win.loadURL(`data:text/html;charset=utf-8,<body style="font-family:system-ui;background:%23071018;color:white;padding:40px"><h1>AeroSlate backend unavailable</h1><p>${detail}</p><p>Check the Render service, then press Ctrl+R. To change the service URL, relaunch with <code>--app-url=https://...</code>.</p></body>`);
  });
  void win.loadURL(appUrl); return win;
}
function createSetupWindow() {
  const win = new BrowserWindow({ width: 620, height: 470, resizable: false, backgroundColor: '#071018', title: 'Set up AeroSlate',
    webPreferences: { preload: path.join(__dirname, 'setup-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  void win.loadFile(path.join(__dirname, 'setup.html')); return win;
}

ipcMain.handle('aeroslate:get-app-url', () => selectedAppUrl());
ipcMain.handle('aeroslate:set-app-url', (_event, value) => { const appUrl = normalizeAppUrl(value); if (!appUrl) throw new Error('Enter a complete http:// or https:// URL.'); writeConfig({ appUrl }); if (mainWindow && !mainWindow.isDestroyed()) void mainWindow.loadURL(appUrl); else createMainWindow(appUrl); return appUrl; });
ipcMain.handle('aeroslate:setup-complete', (_event, value) => { const appUrl = normalizeAppUrl(value); if (!appUrl) throw new Error('Enter the public URL of your Render deployment.'); writeConfig({ appUrl }); createMainWindow(appUrl); return appUrl; });
ipcMain.handle('aeroslate:open-external', (_event, url) => /^https?:\/\//i.test(url) ? shell.openExternal(url) : false);
ipcMain.handle('aeroslate:open-provider', (_event, url, title) => /^https?:\/\//i.test(url) ? Boolean(providerWindow(url, mainWindow, title)) : false);
// Legacy IPC names remain for existing installations during migration.
ipcMain.handle('dispatchlink:get-app-url', () => selectedAppUrl());
ipcMain.handle('dispatchlink:set-app-url', (_event, value) => { const appUrl = normalizeAppUrl(value); if (!appUrl) throw new Error('Enter a complete URL.'); writeConfig({ appUrl }); if (mainWindow) void mainWindow.loadURL(appUrl); return appUrl; });
ipcMain.handle('dispatchlink:open-external', (_event, url) => /^https?:\/\//i.test(url) ? shell.openExternal(url) : false);

app.whenReady().then(() => {
  session.fromPartition('persist:aeroslate-providers').setPermissionRequestHandler((_contents, permission, callback) => callback(['clipboard-sanitized-write', 'fullscreen'].includes(permission)));
  app.on('web-contents-created', (_event, contents) => { if (contents.getType() === 'webview') configureWindowOpen(contents, BrowserWindow.fromWebContents(contents.hostWebContents) || mainWindow); });
  const appUrl = selectedAppUrl(); if (appUrl) createMainWindow(appUrl); else createSetupWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) { const url = selectedAppUrl(); if (url) createMainWindow(url); else createSetupWindow(); } });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
