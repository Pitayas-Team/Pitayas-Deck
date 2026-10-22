// ═══════ PITAYA DECK — SERWER DLA TELEFONÓW I TABLETÓW ═══════
// HTTP: strona decka (client/), wspólny kod rysowania (shared/), obrazy (/img/…), okładki (/art?f=…).
// WebSocket: logowanie urządzenia, zatwierdzanie na komputerze, stan folderu, naciśnięcia, suwaki.
//
// Protokół (JSON):
//   telefon → serwer: { t: 'hello', deviceId, name } | { t: 'press', key, phase: 'press'|'long'|'release' }
//                     { t: 'slider', key, value } | { t: 'media', key, cmd: 'previous'|'play-pause'|'next' } | { t: 'nav', to: 'back'|'home' }
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

// Ikony Lucide (ISC) — wczytujemy raz, przy pierwszym użyciu
let lucide = null;
const GLYPH_TO_LUCIDE = { 'volume-up': 'volume-2', 'volume-down': 'volume-1', 'volume-off': 'volume-x', prev: 'skip-back', next: 'skip-forward', 'play-pause': 'circle-play', play: 'play', pause: 'pause', stop: 'square', mic: 'mic', 'mic-off': 'mic-off', record: 'circle-dot', folder: 'folder', chip: 'cpu', star: 'star', home: 'house', back: 'arrow-left', gear: 'settings', lock: 'lock', power: 'power', camera: 'camera', light: 'lightbulb', terminal: 'terminal', globe: 'globe', keyboard: 'keyboard', music: 'music', bolt: 'zap' };

function lucideSvg(appDir, name) {
    if (!lucide) {
        try { lucide = JSON.parse(fs.readFileSync(path.join(appDir, 'shared', 'lucide.json'), 'utf8')).icons; } catch { lucide = {}; }
    }
    return lucide[name] || '';
}

function truthy(v) {
    return v === true || v === 1 || v === 'true' || v === 'on' || v === 'Playing' || (typeof v === 'number' && v > 0);
}
// Reguła stanu: zmienna, operator, wartość
function ruleMatches(rule, get) {
    const left = get(rule.var);
    const right = rule.value;
    const num = (x) => (typeof x === 'number' ? x : parseFloat(String(x).replace(',', '.')));
    switch (rule.op || '==') {
        case 'on': return truthy(left);
        case 'off': return !truthy(left);
        case '==': return String(left) === String(right) || (typeof left === 'boolean' && String(left) === String(right).toLowerCase());
        case '!=': return String(left) !== String(right);
        case '>': return num(left) > num(right);
        case '<': return num(left) < num(right);
        case '>=': return num(left) >= num(right);
        case '<=': return num(left) <= num(right);
        case 'contains': return String(left ?? '').toLowerCase().includes(String(right ?? '').toLowerCase());
        default: return false;
    }
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
        // Okładka z lokalnego pliku odtwarzacza (file://…) — tylko obrazy i tylko gdy to aktualna okładka
        if (p === '/art') {
            const f = url.searchParams.get('f') || '';
            const current = String(runtime.getVariable('media.artUrl') || '');
            if (!current.startsWith('file://') || decodeURIComponent(current.slice(7)) !== f || !/\.(png|jpe?g|webp|gif)$/i.test(f)) { res.writeHead(404); res.end(); return; }
            return serveFile(res, f);
        }
        const plug = p.match(/^\/p\/([\w-]+)(\/.*)?$/);
        if (plug) return runtime.pluginHttp(plug[1], req, res, url);
        let file = null;
        if (p === '/' || p === '/index.html') file = path.join(appDir, 'client', 'index.html');
        else if (p.startsWith('/img/')) file = safe(store.imagesDir, p.slice(4));
        else if (p.startsWith('/shared/')) file = safe(path.join(appDir, 'shared'), p.slice(7));
        else if (p.startsWith('/icons/')) file = safe(path.join(appDir, 'build', 'icons'), p.slice(6));
        else file = safe(path.join(appDir, 'client'), p);
        if (!file) { res.writeHead(403); res.end(); return; }
        serveFile(res, file);
    }

    // ───── Stany przycisków ─────
    // Zwraca { index, state } aktywnego stanu (albo null dla zwykłego przycisku)
    function activeState(w, folderId, key) {
        if (Array.isArray(w.states) && w.states.length) {
            if (w.stateSource === 'variable') {
                for (const rule of w.stateRules || []) {
                    if (ruleMatches(rule, runtime.getVariable)) {
                        const i = w.states.findIndex((s) => s.id === rule.state);
                        if (i >= 0) return { index: i, state: w.states[i] };
                    }
                }
                return { index: 0, state: w.states[0] };
            }
            const id = store.widgetState(folderId, key);
            const i = Math.max(0, w.states.findIndex((s) => s.id === id));
            return { index: i, state: w.states[i] };
        }
        if (w.stateVar) {
            const on = truthy(runtime.getVariable(w.stateVar));
            return { index: on ? 1 : 0, state: on ? { id: 'on', look: w.on || {} } : { id: 'off', look: {} } };
        }
        return null;
    }
    function mergeLook(base, look) {
        const out = { ...base };
        for (const [k, v] of Object.entries(look || {})) if (v !== '' && v !== null && v !== undefined) out[k] = v;
        return out;
    }
    function renderIcon(icon) {
        if (!icon || !icon.type || icon.type === 'none') return { type: 'none' };
        const base = { fit: icon.fit || 'contain', zoom: icon.zoom || 100, opacity: icon.opacity === undefined ? 100 : icon.opacity, color: icon.color || '' };
        if (icon.type === 'image') return icon.value ? { ...base, type: 'image', value: `/img/${encodeURIComponent(icon.value)}`, fill: Boolean(icon.fill) } : { type: 'none' };
        // Stare ikony z wersji 0.1 → odpowiedniki Lucide
        if (icon.type === 'glyph' && GLYPH_TO_LUCIDE[icon.value]) icon = { ...icon, type: 'lucide', value: GLYPH_TO_LUCIDE[icon.value] };
        if (icon.type === 'lucide') return { ...base, type: 'lucide', value: icon.value, svg: lucideSvg(appDir, icon.value) };
        return { ...base, type: icon.type, value: icon.value };
    }
    function artUrl(u) {
        if (!u) return '';
        if (u.startsWith('file://')) return `/art?f=${encodeURIComponent(decodeURIComponent(u.slice(7)))}`;
        return /^https?:\/\//.test(u) ? u : '';
    }

    // Widżet gotowy do narysowania: zmienne podstawione, wygląd stanu nałożony
    function renderButton(w, folderId, key) {
        if (!w) return null;
        const st = folderId !== undefined ? activeState(w, folderId, key) : null;
        const look = st ? mergeLook(w, st.state.look) : w;
        const out = {
            type: w.type || 'button',
            w: Math.max(1, w.w || 1),
            h: Math.max(1, w.h || 1),
            label: runtime.render(look.label),
            labelPos: look.labelPos || 'bottom',
            textAlign: look.textAlign || 'center',
            icon: renderIcon(look.icon),
            bg: look.bg || '#23222a',
            color: look.color || '',
            fontSize: look.fontSize || 14,
            shadow: look.labelShadow !== false,
            outline: Boolean(look.labelOutline),
            border: look.border && look.border.width ? { width: look.border.width, color: look.border.color || '#ff4fa6' } : null,
            on: Boolean(st && st.index > 0),
            stateName: st && st.state && st.state.name ? st.state.name : '',
            hasLong: Boolean(w.actions && w.actions.longPress && w.actions.longPress.length),
            // Które wyzwalacze mają bloki — telefon wie, czy czekać na przytrzymanie / drugie dotknięcie
            triggers: Object.fromEntries(['longPress', 'doublePress', 'touchStart', 'release'].map((t) => [t, Boolean(w.actions && w.actions[t] && w.actions[t].length)])),
        };
        const num = (name) => { const v = parseFloat(runtime.getVariable(name)); return isNaN(v) ? 0 : v; };
        if (out.type === 'slider') {
            const s = w.slider || {};
            const varName = { volume: 'media.volume', mic: 'media.micVolume', player: 'media.playerVolume' }[s.preset] || s.var;
            out.slider = {
                value: varName ? num(varName) : (s.value || 0), min: s.min ?? 0, max: s.max ?? 100, step: s.step || 1,
                orientation: s.orientation || (out.h > out.w ? 'vertical' : 'horizontal'), showValue: s.showValue !== false, unit: s.unit ?? (s.preset ? '%' : ''),
            };
        }
        if (out.type === 'clock') out.clock = { seconds: Boolean((w.clock || {}).seconds), date: (w.clock || {}).date !== false, h12: Boolean((w.clock || {}).h12) };
        if (out.type === 'gauge') {
            out.gauges = (w.gauges || []).map((g) => {
                const v = num(g.var);
                const max = parseFloat(g.max) || 100;
                return { name: g.name || '', value: v, max, unit: g.unit ?? '%', pct: Math.max(0, Math.min(100, (v / max) * 100)) };
            });
            out.gaugeStyle = w.gaugeStyle || 'ring';
        }
        if (out.type === 'media') {
            const g = (n) => runtime.getVariable(`media.${n}`);
            out.media = {
                title: g('title') || '', artist: g('artist') || '', album: (w.media || {}).album === false ? '' : (g('album') || ''),
                art: artUrl(g('artUrl')), playing: truthy(g('playing')), position: num('media.position'), length: num('media.length'),
                timeline: (w.media || {}).timeline !== false, player: g('player') || '',
            };
        }
        return out;
    }

    function folderState(folderId, deviceId) {
        const folder = store.folder(folderId);
        const profile = store.profileOfFolder(folderId) || store.profile();
        const grid = store.gridOf(folderId);
        const buttons = {};
        for (const [key, b] of Object.entries((folder && folder.buttons) || {})) buttons[key] = renderButton(b, folderId, key);
        const device = deviceId ? store.device(deviceId) : null;
        return {
            t: 'state',
            profile: { id: profile.id, name: profile.name, cols: grid.cols, rows: grid.rows },
            style: { spacing: profile.spacing ?? 10, radius: profile.radius ?? 22, background: profile.background || '', emptyCells: profile.emptyCells || 'visible' },
            folder: { id: folder ? folder.id : null, name: folder ? folder.name : '', canBack: Boolean(folder && folder.parent) },
            buttons,
            device: device ? { id: device.id, name: device.name } : null,
            settings: { showClock: store.deck.settings.showClock },
        };
    }
    // Zmienne użyte przez widżety widocznego folderu
    function folderVariables(folderId) {
        const used = new Set();
        const folder = store.folder(folderId);
        for (const b of Object.values((folder && folder.buttons) || {})) {
            for (const n of runtime.variablesUsed(b.label)) used.add(n);
            if (b.on) for (const n of runtime.variablesUsed(b.on.label)) used.add(n);
            for (const s of b.states || []) for (const n of runtime.variablesUsed(s.look && s.look.label)) used.add(n);
            for (const r of b.stateRules || []) used.add(r.var);
            if (b.stateVar) used.add(b.stateVar);
            if (b.type === 'slider') ['media.volume', 'media.micVolume', 'media.playerVolume', b.slider && b.slider.var].forEach((n) => n && used.add(n));
            if (b.type === 'gauge') for (const g of b.gauges || []) used.add(g.var);
            if (b.type === 'media') ['title', 'artist', 'album', 'artUrl', 'playing', 'position', 'length', 'player'].forEach((n) => used.add(`media.${n}`));
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
    // Wyzwalacz „Zmiana stanu”: pamiętamy ostatni stan przycisków, które mają takie bloki
    const lastStates = new Map();
    let stateTimer = null;
    function checkStateChanges() {
        stateTimer = null;
        for (const f of Object.values(store.deck.folders)) {
            for (const [key, w] of Object.entries(f.buttons || {})) {
                const list = w.actions && w.actions.stateChange;
                if (!list || !list.length) continue;
                const st = activeState(w, f.id, key);
                const id = st ? st.state.id : null;
                const k = `${f.id}/${key}`;
                if (!lastStates.has(k)) { lastStates.set(k, id); continue; }
                if (lastStates.get(k) === id) continue;
                lastStates.set(k, id);
                runtime.runActions(list, { device: 'deck', button: w, folderId: f.id, key, locals: { state: st ? st.state.name || id : '', stateId: id } });
            }
        }
    }
    const scheduleStateCheck = () => { if (!stateTimer) stateTimer = setTimeout(checkStateChanges, 60); };
    setTimeout(checkStateChanges, 1500);
    runtime.onVariable((name) => {
        scheduleStateCheck();
        for (const [ws, s] of sessions) if (s.approved && s.vars && s.vars.has(name)) dirty.add(ws);
        if (dirty.size && !flushTimer) flushTimer = setTimeout(() => { flushTimer = null; for (const ws of dirty) pushState(ws); dirty.clear(); }, 80);
    });
    store.onChange((what) => {
        if (['buttons', 'folders', 'profiles', 'all', 'settings', 'states'].includes(what)) pushAll();
        if (what === 'states' || what === 'buttons') scheduleStateCheck();
    });

    // ───── API dla wtyczek (ctx.deck) ─────
    // Tryb testu w edytorze: przyciski folderów przełączają folder w edytorze (urządzenie 'editor')
    let editorFolder = null;
    const editorNav = (folderId) => { editorFolder = folderId; onEvent('editor-nav', folderId); };
    const deckApi = {
        openFolder(deviceId, folderId) {
            if (!store.folder(folderId)) throw new Error('Folder nie istnieje');
            if (deviceId === 'editor') return editorNav(folderId);
            for (const [ws, s] of sessionsOf(deviceId)) { s.folderId = folderId; pushState(ws); }
        },
        back(deviceId) {
            if (deviceId === 'editor') { const f = store.folder(editorFolder); if (f && f.parent) editorNav(f.parent); return; }
            for (const [ws, s] of sessionsOf(deviceId)) {
                const f = store.folder(s.folderId);
                if (f && f.parent) { s.folderId = f.parent; pushState(ws); }
            }
        },
        home(deviceId) {
            if (deviceId === 'editor') { const root = store.folderPath(editorFolder)[0]; if (root) editorNav(root.id); return; }
            const d = store.device(deviceId);
            for (const [ws, s] of sessionsOf(deviceId)) { s.folderId = store.profile(d && d.profile).root; pushState(ws); }
        },
        switchProfile(deviceId, profileId) {
            const p = store.profile(profileId);
            if (deviceId === 'editor') return editorNav(p.root);
            store.upsertDevice(deviceId, { profile: p.id });
            for (const [ws, s] of sessionsOf(deviceId)) { s.folderId = p.root; pushState(ws); }
        },
        toast(deviceId, text, kind = 'info') {
            for (const [ws] of deviceId && deviceId !== 'editor' ? sessionsOf(deviceId) : sessions) send(ws, { t: 'toast', text, kind });
        },
        // Stan przycisku wielostanowego: konkretny id albo 'next' / 'previous'
        setState(folderId, key, stateId) {
            const w = store.folder(folderId) && store.folder(folderId).buttons[key];
            if (!w || !Array.isArray(w.states) || !w.states.length) throw new Error('Ten przycisk nie ma stanów');
            const cur = Math.max(0, w.states.findIndex((s) => s.id === store.widgetState(folderId, key)));
            let next = w.states.findIndex((s) => s.id === stateId || s.name === stateId);
            if (stateId === 'next') next = (cur + 1) % w.states.length;
            if (stateId === 'previous') next = (cur - 1 + w.states.length) % w.states.length;
            if (next < 0) throw new Error(`Brak stanu „${stateId}”`);
            store.setWidgetState(folderId, key, w.states[next].id);
        },
        // Skrypty: wspólne listy bloków (strona „Skrypty” w edytorze)
        scripts: () => (store.deck.scripts || []).map((x) => ({ value: x.id, label: x.name || 'Skrypt' })),
        async runScript(id, extra = {}) {
            const sc = (store.deck.scripts || []).find((x) => x.id === id);
            if (!sc) throw new Error('Nie ma takiego skryptu');
            const depth = (extra.scriptDepth || 0) + 1;
            if (depth > 8) throw new Error('Za głębokie wywołania skryptów (skrypt wywołuje sam siebie?)');
            const errors = await runtime.runActions(sc.blocks || [], { ...extra, scriptDepth: depth });
            if (errors.length) throw new Error(`Skrypt „${sc.name}”: ${errors.join(' · ')}`);
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

    // Akcje widżetu (wspólne dla telefonu i przycisku „Testuj” w edytorze)
    async function trigger(deviceId, folderId, key, phase, locals = {}) {
        const folder = store.folder(folderId);
        const w = folder && folder.buttons[key];
        if (!w) return [];
        if (deviceId === 'editor') editorFolder = folderId;
        // Przycisk „przełączany naciśnięciem” zmienia stan przed wykonaniem akcji
        if (phase === 'press' && Array.isArray(w.states) && w.states.length > 1 && w.stateSource === 'cycle') deckApi.setState(folderId, key, 'next');
        const actions = (w.actions && w.actions[phase]) || [];
        if (!actions.length) return [];
        return runtime.runActions(actions, { device: deviceId, button: w, folderId, key, locals });
    }
    const sliderTimers = new Map();
    async function slider(deviceId, folderId, key, value) {
        const w = store.folder(folderId) && store.folder(folderId).buttons[key];
        if (!w || w.type !== 'slider') return;
        const s = w.slider || {};
        const v = Math.max(s.min ?? 0, Math.min(s.max ?? 100, Number(value) || 0));
        if (s.preset === 'volume') await runtime.runActions([{ plugin: 'media', action: 'volume', config: { mode: 'set', value: v } }], { device: deviceId });
        else if (s.preset === 'mic') await runtime.runActions([{ plugin: 'media', action: 'mic-volume', config: { value: v } }], { device: deviceId });
        else if (s.preset === 'player') await runtime.runActions([{ plugin: 'media', action: 'player-volume', config: { value: v, player: s.player || '' } }], { device: deviceId });
        else {
            if (s.var && !s.var.includes('.')) runtime.setUserVariable(s.var, v, 'number');
            await trigger(deviceId, folderId, key, 'change', { value: v });
        }
    }

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
            const phase = { press: 'press', long: 'longPress', double: 'doublePress', down: 'touchStart', release: 'release' }[msg.phase];
            if (phase) trigger(s.deviceId, s.folderId, String(msg.key), phase);
            return;
        }
        if (msg.t === 'slider') {
            // Suwak wysyła dużo zdarzeń — wykonujemy je po kolei, zawsze z ostatnią wartością
            const k = `${s.deviceId}/${msg.key}`;
            const job = sliderTimers.get(k) || { busy: false, latest: undefined };
            job.latest = msg.value;
            sliderTimers.set(k, job);
            if (!job.busy) {
                job.busy = true;
                (async () => {
                    while (job.latest !== undefined) {
                        const v = job.latest;
                        job.latest = undefined;
                        try { await slider(s.deviceId, s.folderId, String(msg.key), v); } catch {}
                        await new Promise((r) => setTimeout(r, 40));
                    }
                    job.busy = false;
                })();
            }
            return;
        }
        if (msg.t === 'media') {
            const cmd = { previous: 'previous', 'play-pause': 'play-pause', next: 'next' }[msg.cmd];
            if (cmd) runtime.runActions([{ plugin: 'media', action: 'media', config: { command: cmd } }], { device: s.deviceId });
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
        start, stop, approve, deckApi, folderState, renderButton, devicesList, trigger, slider,
        get port() { return port; },
        urls: () => localAddresses().map((a) => ({ ...a, url: `http://${a.address}:${port}` })),
        removeDevice(id) { for (const [ws] of sessionsOf(id)) ws.close(); store.removeDevice(id); emitDevices(); },
    };
}

module.exports = { createServer, localAddresses, ruleMatches };
