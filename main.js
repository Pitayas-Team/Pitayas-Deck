const { app, BrowserWindow, ipcMain, dialog, nativeImage, Tray, Menu, shell, clipboard, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

// Pitaya Core: dane w ~/.config/Pitayas/Deck, ustawienia, logi, aktualizacje
const core = require('./core').create({
    id: 'deck',
    folder: 'Deck',
    name: 'Pitaya Deck',
    repo: 'MangoLabz/Pitayas-Deck',
    appDir: __dirname,
});
const { createStore } = require('./deck/store');
const { createRuntime } = require('./deck/runtime');
const { createServer } = require('./deck/server');
const { createPlatform } = require('./deck/platform');
const { importMacroDeck, macroDeckDir } = require('./deck/import-macrodeck');

const ICON = path.join(__dirname, 'build', 'icons', '512x512.png');
const log = (...a) => core.log.info(...a);

let win = null;
let tray = null;
let isQuitting = false;

const store = createStore(core.paths.data, log);
const platform = createPlatform({ clipboard, shell, log });
const toEditor = (channel, ...args) => { if (win && !win.isDestroyed()) win.webContents.send(channel, ...args); };
const runtime = createRuntime({
    store,
    userPluginsDir: path.join(core.paths.data, 'plugins'),
    log,
    notify: (text, kind) => toEditor('deck:notify', text, kind),
    services: {
        platform,
        getPort: () => (server ? server.port : 0),
        desktopNotify: (body) => new Notification({ title: 'Pitaya Deck', body: String(body || ''), icon: ICON }).show(),
    },
});
const server = createServer({
    store,
    runtime,
    appDir: __dirname,
    log,
    onEvent: (type, data) => {
        if (type === 'devices') { toEditor('deck:devices', data); updateTray(); }
        if (type === 'pairing') {
            toEditor('deck:pairing', data);
            const n = new Notification({ title: 'Pitaya Deck — nowe urządzenie', body: `${data.name} chce się połączyć. Kliknij, aby zatwierdzić.`, icon: ICON });
            n.on('click', showWindow);
            n.show();
        }
    },
});

// Port zajęty? Próbujemy kolejne
async function startServer() {
    const base = parseInt(store.deck.settings.port, 10) || 8191;
    for (let p = base; p < base + 20; p++) {
        try {
            await server.start(p);
            if (p !== base) toEditor('deck:notify', `Port ${base} był zajęty — deck działa na porcie ${p}.`, 'info');
            return p;
        } catch (err) {
            if (err.code !== 'EADDRINUSE') { core.log.error('Serwer:', err); break; }
        }
    }
    toEditor('deck:notify', 'Nie udało się uruchomić serwera decka.', 'error');
    return null;
}

function showWindow() {
    if (!win) return createWindow();
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
}

function createWindow() {
    win = new BrowserWindow({
        width: 1320,
        height: 840,
        minWidth: 1040,
        minHeight: 660,
        frame: false,
        title: 'Pitaya Deck',
        backgroundColor: '#121116',
        icon: ICON,
        webPreferences: {
            preload: path.join(__dirname, 'editor', 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false, // preload wczytuje core/bridge.js
        },
    });
    win.loadFile(path.join(__dirname, 'editor', 'index.html'));
    win.on('close', (e) => {
        // Deck działa dalej w tle — telefony nadal sterują komputerem
        if (!isQuitting) { e.preventDefault(); win.hide(); }
    });
}

function updateTray() {
    if (!tray) return;
    const online = server.devicesList().filter((d) => d.online).length;
    tray.setToolTip(`Pitaya Deck — ${online ? `połączone urządzenia: ${online}` : 'brak połączonych urządzeń'}`);
}
function createTray() {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'build', 'icons', '32x32.png')).resize({ width: 22, height: 22 }));
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Otwórz Pitaya Deck', click: showWindow },
        { type: 'separator' },
        { label: 'Zakończ Pitaya Deck', click: quit },
    ]));
    tray.on('click', showWindow);
    updateTray();
}

async function quit() {
    isQuitting = true;
    store.flush();
    await runtime.stopAll().catch(() => {});
    await server.stop().catch(() => {});
    platform.dispose();
    app.quit();
}

if (core.singleInstance(showWindow)) {
    core.registerIpc({ beforeRestart: async () => { isQuitting = true; store.flush(); await server.stop(); platform.dispose(); } });
    app.whenReady().then(async () => {
        createWindow();
        createTray();
        await runtime.startAll();
        await startServer();
        toEditor('deck:ready');
    });
    app.on('before-quit', () => { isQuitting = true; store.flush(); });
    app.on('window-all-closed', () => {});
}

// ───── Okno ─────
ipcMain.on('pitaya:win-minimize', () => win && win.minimize());
ipcMain.on('pitaya:win-close', () => win && win.hide());
ipcMain.on('deck:win-maximize', () => win && (win.isMaximized() ? win.unmaximize() : win.maximize()));
ipcMain.on('deck:quit', quit);

// ───── Dane decka ─────
const snapshot = () => ({
    deck: store.deck,
    plugins: runtime.describe(),
    variables: runtime.listVariables(),
    devices: server.devicesList(),
    server: { port: server.port, urls: server.port ? server.urls() : [] },
    imagesDir: store.imagesDir,
});
ipcMain.handle('deck:get', () => snapshot());
ipcMain.handle('deck:preview', (e, folderId) => server.folderState(folderId));
ipcMain.handle('deck:render', (e, button, folderId, key) => server.renderButton(button, folderId, key));
ipcMain.handle('deck:variables', () => runtime.listVariables());

ipcMain.handle('deck:set-button', (e, folderId, key, button) => store.setButton(folderId, key, button));
ipcMain.handle('deck:move-button', (e, folderId, from, to) => store.moveButton(folderId, from, to));
ipcMain.handle('deck:profile-add', (e, name) => store.addProfile(name));
ipcMain.handle('deck:profile-update', (e, id, patch) => store.updateProfile(id, patch));
ipcMain.handle('deck:profile-delete', (e, id) => store.deleteProfile(id));
ipcMain.handle('deck:folder-add', (e, parentId, name) => store.addFolder(parentId, name));
ipcMain.handle('deck:folder-rename', (e, id, name) => store.renameFolder(id, name));
ipcMain.handle('deck:folder-delete', (e, id) => store.deleteFolder(id));
ipcMain.handle('deck:folder-grid', (e, id, cols, rows) => store.folderGrid(id, cols, rows));
ipcMain.handle('deck:set-state', (e, folderId, key, stateId) => store.setWidgetState(folderId, key, stateId));

// Ikony Lucide (ISC) dla wyszukiwarki w edytorze
let lucideCache = null;
ipcMain.handle('deck:lucide', () => {
    if (!lucideCache) lucideCache = JSON.parse(fs.readFileSync(path.join(__dirname, 'shared', 'lucide.json'), 'utf8'));
    return lucideCache;
});

// Import z Macro Deck
ipcMain.handle('deck:macrodeck-available', () => Boolean(macroDeckDir()));
ipcMain.handle('deck:import-macrodeck', () => importMacroDeck(store, { log }));

ipcMain.handle('deck:settings', async (e, patch) => {
    const s = store.setSettings(patch);
    // Zmiana portu: serwer startuje od nowa (telefony połączą się same po odświeżeniu adresu)
    if (patch.port && parseInt(patch.port, 10) !== server.port) {
        await server.stop();
        await startServer();
    }
    return { settings: s, server: { port: server.port, urls: server.port ? server.urls() : [] } };
});

// ───── Wtyczki i zmienne ─────
ipcMain.handle('deck:plugin-settings', (e, id, patch) => runtime.setPluginSettings(id, patch));
ipcMain.handle('deck:plugin-command', async (e, id, key) => { const r = await runtime.pluginCommand(id, key); return { result: r === undefined ? null : r, plugins: runtime.describe() }; });
runtime.onStatus(() => toEditor('deck:plugins', runtime.describe()));
ipcMain.handle('deck:plugin-toggle', (e, id, disabled) => { runtime.setDisabled(id, disabled); return runtime.describe(); });
ipcMain.handle('deck:field-options', (e, pluginId, actionId, key) => runtime.fieldOptions(pluginId, actionId, key));
ipcMain.handle('deck:test-actions', async (e, actions) => {
    const errors = await runtime.runActions(actions, { device: 'editor', button: null, folderId: null });
    return { ok: !errors.length, errors };
});
// „Testuj” w edytorze: jak naciśnięcie na telefonie (ze zmianą stanu i kontekstem przycisku)
ipcMain.handle('deck:test-button', async (e, folderId, key, phase = 'press') => {
    const errors = await server.trigger('editor', folderId, key, phase);
    return { ok: !errors.length, errors };
});
ipcMain.handle('deck:test-slider', (e, folderId, key, value) => server.slider('editor', folderId, key, value));
ipcMain.handle('deck:variable-set', (e, name, value, type) => runtime.setUserVariable(name, value, type));
ipcMain.handle('deck:variable-delete', (e, name) => runtime.deleteUserVariable(name));
ipcMain.handle('deck:open-plugins-dir', () => {
    const dir = path.join(core.paths.data, 'plugins');
    fs.mkdirSync(dir, { recursive: true });
    return shell.openPath(dir);
});
ipcMain.handle('deck:keyboard-status', async () => {
    try { return { ok: true, backend: await platform.keyboardBackend() }; } catch (err) { return { ok: false, error: err.message }; }
});

// Odświeżanie podglądu w edytorze, gdy zmieniają się zmienne (najwyżej 2× na sekundę)
let varsTimer = null;
runtime.onVariable(() => {
    if (varsTimer) return;
    varsTimer = setTimeout(() => { varsTimer = null; toEditor('deck:vars-changed'); }, 500);
});

// ───── Pliki i obrazy ─────
ipcMain.handle('deck:pick-file', async (e, { filters, image } = {}) => {
    const res = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: image ? [{ name: 'Obrazy', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }] : filters ? [{ name: 'Pliki', extensions: filters }, { name: 'Wszystkie', extensions: ['*'] }] : [],
    });
    if (res.canceled || !res.filePaths.length) return null;
    const file = res.filePaths[0];
    if (!image) return file;
    const buf = fs.readFileSync(file);
    if (buf.length > 4 * 1024 * 1024) throw new Error('Obraz jest za duży (maks. 4 MB)');
    return store.saveImage(buf, path.extname(file).slice(1));
});
ipcMain.handle('deck:save-image-data', (e, dataUrl) => {
    const m = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl || '');
    if (!m) throw new Error('Niepoprawny obraz');
    return store.saveImage(Buffer.from(m[2], 'base64'), m[1] === 'jpeg' ? 'jpg' : m[1]);
});
ipcMain.handle('deck:export', async () => {
    const res = await dialog.showSaveDialog(win, { defaultPath: 'pitaya-deck.json', filters: [{ name: 'Pitaya Deck', extensions: ['json'] }] });
    if (res.canceled || !res.filePath) return false;
    fs.writeFileSync(res.filePath, JSON.stringify(store.exportDeck(), null, 2));
    return res.filePath;
});
ipcMain.handle('deck:import', async () => {
    const res = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Pitaya Deck', extensions: ['json'] }] });
    if (res.canceled || !res.filePaths.length) return false;
    store.importDeck(JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8')));
    return snapshot();
});

// ───── Urządzenia ─────
ipcMain.handle('deck:approve', (e, id, approved) => server.approve(id, approved));
ipcMain.handle('deck:device-update', (e, id, patch) => {
    const clean = {};
    if (patch.name) { clean.name = String(patch.name).slice(0, 60); clean.customName = true; }
    if (patch.profile) clean.profile = patch.profile;
    store.upsertDevice(id, clean);
    if (clean.profile) server.deckApi.switchProfile(id, clean.profile);
    return server.devicesList();
});
ipcMain.handle('deck:device-remove', (e, id) => { server.removeDevice(id); return server.devicesList(); });
ipcMain.handle('deck:qr', async (e, text) => require('qrcode').toDataURL(text, { margin: 1, width: 360, color: { dark: '#17161c', light: '#ffffff' } }));
ipcMain.handle('deck:open-url', (e, url) => { if (/^http:\/\/[\d.]+:\d+\/?$/.test(url)) shell.openExternal(url); });
