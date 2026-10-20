// ═══════ PITAYA DECK — SERWER DLA TELEFONÓW I TABLETÓW ═══════
// HTTP: strona decka (client/), wspólny kod rysowania (shared/), obrazy przycisków (/img/…).
// WebSocket: logowanie urządzenia, zatwierdzanie na komputerze, stan folderu, naciśnięcia.
//
// Protokół (JSON):
//   telefon → serwer: { t: 'hello', deviceId, name } | { t: 'press', key, phase: 'press'|'long'|'release' } | { t: 'nav', to: 'back'|'home' }
//   serwer → telefon: { t: 'pending' } | { t: 'denied' } | { t: 'state', … } | { t: 'toast', text, kind }
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WebSocketServer } = require('ws');

const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

function localAddresses() {
    const out = [];
    for (const [name, list] of Object.entries(os.networkInterfaces())) {
        if (/^(docker|veth|virbr|br-|lo)/.test(name)) continue;
        for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push({ name, address: i.address });
    }
    // Najpierw zwykłe sieci domowe, potem VPN (Tailscale itp.)
    return out.sort((a, b) => (/^(tailscale|tun|wg)/.test(a.name) ? 1 : 0) - (/^(tailscale|tun|wg)/.test(b.name) ? 1 : 0));
}

function createServer({ store, runtime, appDir, log, onEvent = () => {} }) {
    const sessions = new Map();   // ws → { deviceId, folderId, approved }
    let server = null;
    let wss = null;
    let port = null;

    // ───── HTTP ─────
    function serveFile(res, file) {
        fs.readFile(file, (err, data) => {
            if (err) { res.writeHead(404); res.end('Nie znaleziono'); return; }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
            res.end(data);
        });
    }
    function handle(req, res) {
        const url = new URL(req.url, 'http://x');
        const p = decodeURIComponent(url.pathname);
        const safe = (base, rel) => {
            const full = path.resolve(base, '.' + rel);
            return full.startsWith(path.resolve(base) + path.sep) ? full : null;
        };
        let file = null;
        if (p === '/' || p === '/index.html') file = path.join(appDir, 'client', 'index.html');
        else if (p.startsWith('/img/')) file = safe(store.imagesDir, p.slice(4));
        else if (p.startsWith('/shared/')) file = safe(path.join(appDir, 'shared'), p.slice(7));
        else if (p.startsWith('/icons/')) file = safe(path.join(appDir, 'build', 'icons'), p.slice(6));
        else file = safe(path.join(appDir, 'client'), p);
        if (!file) { res.writeHead(403); res.end(); return; }
        serveFile(res, file);
    }

    // ───── Stan przycisków ─────
    function isOn(button) {
        if (!button.stateVar) return false;
        const v = runtime.getVariable(button.stateVar);
        return v === true || v === 1 || v === 'true' || v === 'on' || (typeof v === 'number' && v > 0);
    }
    // Przycisk gotowy do narysowania: zmienne podstawione, wygląd „włączony” nałożony
    function renderButton(button) {
        if (!button) return null;
        const on = isOn(button);
        const look = on && button.on ? { ...button, ...Object.fromEntries(Object.entries(button.on).filter(([, v]) => v !== '' && v !== null && v !== undefined)) } : button;
        let icon = look.icon || { type: 'none' };
        if (icon.type === 'image' && icon.value) icon = { type: 'image', value: `/img/${encodeURIComponent(icon.value)}`, fill: Boolean(icon.fill) };
        return {
            label: runtime.render(look.label),
            labelPos: look.labelPos || 'bottom',
            icon,
            bg: look.bg || '#23222a',
            color: look.color || '#ffffff',
            fontSize: look.fontSize || 14,
            on,
            hasLong: Boolean(button.actions && button.actions.longPress && button.actions.longPress.length),
        };
    }
    function folderState(folderId, deviceId) {
        const folder = store.folder(folderId);
        const profile = store.profileOfFolder(folderId) || store.profile();
        const buttons = {};
        for (const [key, b] of Object.entries((folder && folder.buttons) || {})) buttons[key] = renderButton(b);
        const device = deviceId ? store.device(deviceId) : null;
        return {
            t: 'state',
            profile: { id: profile.id, name: profile.name, cols: profile.cols, rows: profile.rows },
            folder: { id: folder ? folder.id : null, name: folder ? folder.name : '', canBack: Boolean(folder && folder.parent) },
            buttons,
            device: device ? { id: device.id, name: device.name } : null,
            settings: { showClock: store.deck.settings.showClock },
        };
    }
    // Zmienne użyte przez przyciski widocznego folderu
    function folderVariables(folderId) {
        const used = new Set();
        const folder = store.folder(folderId);
        for (const b of Object.values((folder && folder.buttons) || {})) {
            for (const n of runtime.variablesUsed(b.label)) used.add(n);
            if (b.on) for (const n of runtime.variablesUsed(b.on.label)) used.add(n);
            if (b.stateVar) used.add(b.stateVar);
        }
        return used;
    }

    function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
    function pushState(ws) {
        const s = sessions.get(ws);
        if (!s || !s.approved) return;
        if (!store.folder(s.folderId)) s.folderId = store.profile(store.device(s.deviceId)?.profile).root;
        s.vars = folderVariables(s.folderId);
        send(ws, folderState(s.folderId, s.deviceId));
    }
    function pushAll() { for (const ws of sessions.keys()) pushState(ws); }
    function sessionsOf(deviceId) { return [...sessions.entries()].filter(([, s]) => s.deviceId === deviceId); }

    // Zmiana zmiennej odświeża tylko urządzenia, które ją pokazują (z ograniczeniem częstotliwości)
    const dirty = new Set();
    let flushTimer = null;
    runtime.onVariable((name) => {
        for (const [ws, s] of sessions) if (s.approved && s.vars && s.vars.has(name)) dirty.add(ws);
        if (dirty.size && !flushTimer) flushTimer = setTimeout(() => { flushTimer = null; for (const ws of dirty) pushState(ws); dirty.clear(); }, 80);
    });
    store.onChange((what) => { if (['buttons', 'folders', 'profiles', 'all', 'settings'].includes(what)) pushAll(); });

    // ───── Nawigacja dla wtyczek (ctx.deck) ─────
    const deckApi = {
        openFolder(deviceId, folderId) {
            if (!store.folder(folderId)) throw new Error('Folder nie istnieje');
            for (const [ws, s] of sessionsOf(deviceId)) { s.folderId = folderId; pushState(ws); }
        },
        back(deviceId) {
            for (const [ws, s] of sessionsOf(deviceId)) {
                const f = store.folder(s.folderId);
                if (f && f.parent) { s.folderId = f.parent; pushState(ws); }
            }
        },
        home(deviceId) {
            const d = store.device(deviceId);
            for (const [ws, s] of sessionsOf(deviceId)) { s.folderId = store.profile(d && d.profile).root; pushState(ws); }
        },
        switchProfile(deviceId, profileId) {
            const p = store.profile(profileId);
            store.upsertDevice(deviceId, { profile: p.id });
            for (const [ws, s] of sessionsOf(deviceId)) { s.folderId = p.root; pushState(ws); }
        },
        toast(deviceId, text, kind = 'info') {
            for (const [ws] of deviceId ? sessionsOf(deviceId) : sessions) send(ws, { t: 'toast', text, kind });
        },
        profiles: () => store.deck.profiles.map((p) => ({ value: p.id, label: p.name })),
        folders: () => Object.values(store.deck.folders).map((f) => ({ value: f.id, label: `${(store.profileOfFolder(f.id) || {}).name || '?'} › ${store.folderPath(f.id).map((x) => x.name).join(' › ')}` })),
    };
    runtime.setDeckApi(deckApi);

    // ───── WebSocket ─────
    function devicesList() {
        const online = new Set([...sessions.values()].map((s) => s.deviceId));
        return Object.values(store.deck.devices).map((d) => ({ ...d, online: online.has(d.id) }))
            .sort((a, b) => (b.online - a.online) || (b.lastSeen || 0) - (a.lastSeen || 0));
    }
    function emitDevices() { onEvent('devices', devicesList()); }

    function onMessage(ws, msg) {
        const s = sessions.get(ws);
        if (msg.t === 'hello') {
            const deviceId = String(msg.deviceId || '').slice(0, 64);
            if (!/^[\w-]{8,64}$/.test(deviceId)) return ws.close();
            const name = String(msg.name || 'Urządzenie').slice(0, 60);
            const known = store.device(deviceId);
            const d = store.upsertDevice(deviceId, { name: known && known.customName ? known.name : name, lastSeen: Date.now(), ip: s.ip });
            s.deviceId = deviceId;
            if (d.denied) { send(ws, { t: 'denied' }); emitDevices(); return; }
            s.approved = Boolean(d.approved) || !store.deck.settings.requireApproval;
            if (!s.approved) {
                send(ws, { t: 'pending', name: d.name });
                onEvent('pairing', d);
            } else {
                s.folderId = store.profile(d.profile).root;
                pushState(ws);
            }
            emitDevices();
            return;
        }
        if (!s || !s.approved) return;
        if (msg.t === 'press') {
            const folder = store.folder(s.folderId);
            const button = folder && folder.buttons[msg.key];
            if (!button) return;
            const phase = { press: 'press', long: 'longPress', release: 'release' }[msg.phase];
            if (!phase) return;
            const actions = (button.actions && button.actions[phase]) || [];
            if (!actions.length) return;
            runtime.runActions(actions, { device: s.deviceId, button, folderId: s.folderId });
            return;
        }
        if (msg.t === 'nav') {
            if (msg.to === 'back') deckApi.back(s.deviceId);
            if (msg.to === 'home') deckApi.home(s.deviceId);
        }
    }

    function approve(deviceId, approved) {
        store.upsertDevice(deviceId, { approved, denied: !approved });
        for (const [ws, s] of sessionsOf(deviceId)) {
            s.approved = approved;
            if (approved) { s.folderId = store.profile(store.device(deviceId).profile).root; pushState(ws); }
            else send(ws, { t: 'denied' });
        }
        emitDevices();
    }

    function start(p) {
        return new Promise((resolve, reject) => {
            server = http.createServer(handle);
            wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
            wss.on('connection', (ws, req) => {
                sessions.set(ws, { deviceId: null, folderId: null, approved: false, ip: req.socket.remoteAddress });
                ws.on('message', (data) => {
                    let msg;
                    try { msg = JSON.parse(data); } catch { return; }
                    try { onMessage(ws, msg); } catch (err) { log('Błąd wiadomości:', err.message); }
                });
                ws.on('close', () => { sessions.delete(ws); emitDevices(); });
                ws.on('error', () => {});
            });
            server.once('error', reject);
            server.listen(p, '0.0.0.0', () => { port = p; log(`Serwer decka na porcie ${p}`); resolve(p); });
        });
    }
    function stop() {
        return new Promise((resolve) => {
            for (const ws of sessions.keys()) { try { ws.terminate(); } catch {} }
            sessions.clear();
            if (wss) wss.close();
            if (server) server.close(() => resolve()); else resolve();
            server = null; wss = null;
        });
    }

    return {
        start, stop, approve, deckApi, folderState, renderButton, devicesList,
        get port() { return port; },
        urls: () => localAddresses().map((a) => ({ ...a, url: `http://${a.address}:${port}` })),
        removeDevice(id) { for (const [ws] of sessionsOf(id)) ws.close(); store.removeDevice(id); emitDevices(); },
    };
}

module.exports = { createServer, localAddresses };
