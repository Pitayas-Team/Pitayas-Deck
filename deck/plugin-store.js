// ═══════ PITAYA DECK — SKLEP Z DODATKAMI ═══════
// Katalog dodatków:
//   • z GitHuba (domyślnie): folder plugins/ w repozytorium Pitayas-Team/Pitayas-Deck
//       <adres>/index.json  { "version": 1, "plugins": [ { …plugin.json…, "files": [{ "path": "index.js", "sha256": "…" }] } ] }
//       pliki dodatku: <adres>/<id>/<plik>  (albo paczka .tgz: "package": { "url", "sha256" })
//   • zapas bez internetu: kopia tego samego folderu wbudowana w aplikację (plugins/<id>/)
// Zainstalowane dodatki trafiają do ~/.config/Pitayas/Deck/data/plugins/<id>/, a ich spis do data/store.json.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const DEFAULT_STORE = 'https://raw.githubusercontent.com/Pitayas-Team/Pitayas-Deck/main/plugins';

const CATEGORIES = [
    { id: 'music', name: 'Muzyka', icon: 'music' },
    { id: 'communication', name: 'Komunikacja', icon: 'message-circle' },
    { id: 'streaming', name: 'Streaming', icon: 'radio' },
    { id: 'smart-home', name: 'Inteligentny dom', icon: 'house' },
    { id: 'productivity', name: 'Produktywność', icon: 'timer' },
    { id: 'system', name: 'System', icon: 'cpu' },
    { id: 'gaming', name: 'Gry', icon: 'gamepad-2' },
];

function parseVersion(v) { return String(v || '0').replace(/^v/, '').split(/[.-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x)); }
function compareVersions(a, b) {
    const pa = parseVersion(a), pb = parseVersion(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] ?? 0, y = pb[i] ?? 0;
        if (x === y) continue;
        if (typeof x === 'number' && typeof y === 'number') return x > y ? 1 : -1;
        return String(x) > String(y) ? 1 : -1;
    }
    return 0;
}
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };

// Minimalne rozpakowanie .tgz (pliki i foldery), z ochroną przed wyjściem poza folder docelowy
function extractTgz(buffer, dest) {
    const tar = zlib.gunzipSync(buffer);
    const entries = [];
    let off = 0;
    while (off + 512 <= tar.length) {
        const head = tar.subarray(off, off + 512);
        if (head.every((b) => b === 0)) break;
        const str = (a, b) => head.subarray(a, b).toString('utf8').replace(/\0[\s\S]*$/, '');
        let name = str(0, 100);
        const prefix = str(345, 500);
        if (prefix) name = `${prefix}/${name}`;
        const size = parseInt(str(124, 136).trim() || '0', 8);
        const type = String.fromCharCode(head[156] || 48);
        off += 512;
        entries.push({ parts: name.split('/').filter((x) => x && x !== '.'), type, body: tar.subarray(off, off + size) });
        off += Math.ceil(size / 512) * 512;
    }
    // Paczka może mieć jeden wspólny folder główny (np. spotify/…) — wtedy go pomijamy
    const files = entries.filter((e) => e.parts.length);
    const first = files.length && files[0].parts[0];
    const strip = files.length > 1 && files.every((e) => e.parts[0] === first && (e.parts.length > 1 || e.type === '5'));
    const root = path.resolve(dest);
    for (const e of files) {
        const parts = strip ? e.parts.slice(1) : e.parts;
        if (!parts.length) continue;
        const full = path.resolve(root, ...parts);
        if (!full.startsWith(root + path.sep)) throw new Error(`Niebezpieczna ścieżka w paczce: ${e.parts.join('/')}`);
        if (e.type === '5') fs.mkdirSync(full, { recursive: true });
        else if (e.type === '0' || e.type === '\0' || e.type === '7') { fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, e.body); }
    }
}

// Kopiowanie folderu dodatku. Bez fs.cpSync: wbudowane dodatki leżą w app.asar, a cpSync (opendir) nie umie czytać z asar
function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
        const from = path.join(src, name), to = path.join(dest, name);
        if (fs.statSync(from).isDirectory()) copyDir(from, to);
        else fs.writeFileSync(to, fs.readFileSync(from));
    }
}

function createPluginStore({ appDir, pluginsDir, dataDir, runtime, settings, log = () => {} }) {
    const bundledDir = path.join(appDir, 'plugins');
    const stateFile = path.join(dataDir, 'store.json');
    let remoteCache = { url: null, time: 0, plugins: [] };

    const state = () => readJson(stateFile, { installed: {} });
    function saveState(s) {
        fs.mkdirSync(path.dirname(stateFile), { recursive: true });
        fs.writeFileSync(`${stateFile}.tmp`, JSON.stringify(s, null, 2));
        fs.renameSync(`${stateFile}.tmp`, stateFile);
    }

    function bundled() {
        const out = [];
        let names = [];
        try { names = fs.readdirSync(bundledDir); } catch {}
        for (const name of names) {
            const m = readJson(path.join(bundledDir, name, 'plugin.json'), null);
            if (m && m.id) out.push({ ...m, source: 'bundled', dir: path.join(bundledDir, name) });
        }
        return out;
    }
    async function remote(force) {
        // Puste pole = oficjalny sklep na GitHubie
        const url = String((settings().storeUrl || '') || DEFAULT_STORE).trim().replace(/\/+$/, '');
        if (!force && remoteCache.url === url && Date.now() - remoteCache.time < 10 * 60 * 1000) return remoteCache.plugins;
        try {
            const res = await fetch(`${url}/index.json?t=${Math.floor(Date.now() / 60000)}`, { headers: { 'User-Agent': 'Pitaya-Deck' }, signal: AbortSignal.timeout(10000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const idx = await res.json();
            const plugins = (idx.plugins || []).filter((p) => p && p.id && ((p.package && p.package.url) || Array.isArray(p.files))).map((p) => ({ ...p, source: 'remote', base: `${url}/${p.id}` }));
            remoteCache = { url, time: Date.now(), plugins };
        } catch (err) {
            log('Sklep: nie udało się pobrać katalogu', url, err.message);
            remoteCache = { url, time: Date.now(), plugins: remoteCache.url === url ? remoteCache.plugins : [], error: err.message };
        }
        return remoteCache.plugins;
    }

    // Katalog: z wbudowanego i zdalnego bierzemy nowszą wersję każdego dodatku
    async function catalog(force) {
        const map = new Map();
        for (const p of [...bundled(), ...(await remote(force))]) {
            const prev = map.get(p.id);
            // Ta sama wersja: bierzemy z GitHuba (wbudowana kopia jest tylko zapasem bez internetu)
            if (!prev || compareVersions(p.version, prev.version) > 0 || (compareVersions(p.version, prev.version) === 0 && p.source === 'remote')) map.set(p.id, p);
        }
        return map;
    }

    function installedInfo(id) {
        const dir = path.join(pluginsDir, id);
        const m = readJson(path.join(dir, 'plugin.json'), null);
        if (!m && !fs.existsSync(path.join(dir, 'index.js'))) return null;
        return { dir, version: (m && m.version) || (state().installed[id] || {}).version || '0', manifest: m };
    }

    // Wtyczki wgrane ręcznie do folderu wtyczek, których nie ma w katalogu — też je pokazujemy
    function localOnly(cat) {
        const out = [];
        let names = [];
        try { names = fs.readdirSync(pluginsDir); } catch {}
        for (const name of names) {
            if (name.startsWith('.')) continue;
            const m = readJson(path.join(pluginsDir, name, 'plugin.json'), null);
            if (m && m.id && !cat.has(m.id)) out.push({ ...m, source: 'local' });
        }
        return out;
    }

    async function list(force) {
        const cat = await catalog(force);
        for (const p of localOnly(cat)) cat.set(p.id, p);
        const plugins = runtime.describe();
        return {
            categories: CATEGORIES,
            remoteError: remoteCache.error || null,
            storeUrl: settings().storeUrl || '',
            defaultStore: DEFAULT_STORE,
            items: [...cat.values()].map((p) => {
                const inst = installedInfo(p.id);
                const live = plugins.find((x) => x.id === p.id);
                const { dir, package: pkg, ...pub } = p;
                return {
                    ...pub,
                    installed: Boolean(inst),
                    installedVersion: inst ? inst.version : null,
                    update: Boolean(inst && compareVersions(p.version, inst.version) > 0),
                    running: Boolean(live && !live.error && !live.disabled),
                    disabled: Boolean(live && live.disabled),
                    error: live ? live.error : null,
                    status: live ? live.status : null,
                    actionsCount: live ? live.actions.length : (p.features || []).length,
                    variablesCount: live ? live.variables.length : null,
                };
            }).sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || a.name.localeCompare(b.name, 'pl')),
        };
    }

    async function install(id) {
        const cat = await catalog();
        const p = cat.get(id);
        if (!p) throw new Error(`Nie ma takiego dodatku w sklepie: ${id}`);
        const dest = path.join(pluginsDir, id);
        const tmp = path.join(pluginsDir, `.${id}.installing`);
        fs.rmSync(tmp, { recursive: true, force: true });
        fs.mkdirSync(tmp, { recursive: true });
        try {
            let sha = null;
            if (p.source === 'bundled') {
                copyDir(p.dir, tmp);
            } else if (Array.isArray(p.files)) {
                // Pliki prosto z folderu na GitHubie, każdy sprawdzany sumą sha256
                for (const f of p.files) {
                    const rel = String(f.path || '');
                    if (!rel || rel.includes('..') || path.isAbsolute(rel)) throw new Error(`Niebezpieczna ścieżka w dodatku: ${rel}`);
                    const res = await fetch(`${p.base}/${rel.split('/').map(encodeURIComponent).join('/')}?v=${encodeURIComponent(p.version)}`, { headers: { 'User-Agent': 'Pitaya-Deck' }, signal: AbortSignal.timeout(20000) });
                    if (!res.ok) throw new Error(`Pobieranie ${rel} nie powiodło się (HTTP ${res.status})`);
                    const buf = Buffer.from(await res.arrayBuffer());
                    const fsha = crypto.createHash('sha256').update(buf).digest('hex');
                    if (f.sha256 && f.sha256.toLowerCase() !== fsha) throw new Error(`Plik ${rel} jest uszkodzony (zła suma kontrolna)`);
                    const out = path.join(tmp, rel);
                    fs.mkdirSync(path.dirname(out), { recursive: true });
                    fs.writeFileSync(out, buf);
                }
            } else {
                const res = await fetch(p.package.url, { headers: { 'User-Agent': 'Pitaya-Deck' } });
                if (!res.ok) throw new Error(`Pobieranie nie powiodło się (HTTP ${res.status})`);
                const buf = Buffer.from(await res.arrayBuffer());
                sha = crypto.createHash('sha256').update(buf).digest('hex');
                if (p.package.sha256 && p.package.sha256.toLowerCase() !== sha) throw new Error('Paczka jest uszkodzona (zła suma kontrolna)');
                extractTgz(buf, tmp);
            }
            const m = readJson(path.join(tmp, 'plugin.json'), null);
            if (!m || m.id !== id || !fs.existsSync(path.join(tmp, 'index.js'))) throw new Error('Paczka nie zawiera poprawnego dodatku');
            // Podmiana: zatrzymaj starą wersję, przenieś nową na miejsce, uruchom
            await runtime.removePlugin(id);
            fs.rmSync(dest, { recursive: true, force: true });
            fs.renameSync(tmp, dest);
            const loaded = await runtime.addPlugin(dest);
            const st = state();
            st.installed[id] = { version: m.version, source: p.source, sha256: sha, installedAt: new Date().toISOString() };
            saveState(st);
            log(`Sklep: zainstalowano ${m.name} ${m.version}`);
            const live = runtime.describe().find((x) => x.id === loaded);
            if (live && live.error) throw new Error(`Zainstalowano, ale dodatek zgłosił błąd: ${live.error}`);
            return { id, version: m.version, name: m.name };
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    }

    async function uninstall(id) {
        const dest = path.join(pluginsDir, id);
        if (!fs.existsSync(dest)) throw new Error('Ten dodatek nie jest zainstalowany');
        await runtime.removePlugin(id);
        fs.rmSync(dest, { recursive: true, force: true });
        const st = state();
        delete st.installed[id];
        saveState(st);
        log(`Sklep: odinstalowano ${id}`);
        return { id };
    }

    // Dodatki, których używają przyciski, a nie są zainstalowane (np. po aktualizacji, gdy Spotify
    // przestał być wbudowany) — instalujemy je same
    async function ensure(ids) {
        const cat = await catalog();
        const done = [];
        for (const id of ids) {
            if (runtime.has(id) || installedInfo(id) || !cat.has(id)) continue;
            try { const r = await install(id); done.push(r.name); } catch (err) { log('Sklep: automatyczna instalacja', id, err.message); }
        }
        return done;
    }
    async function updateAll() {
        const { items } = await list(true);
        const done = [];
        for (const it of items.filter((x) => x.update)) { await install(it.id); done.push(it.name); }
        return done;
    }

    return { list, install, uninstall, ensure, updateAll, compareVersions };
}

module.exports = { createPluginStore, extractTgz, compareVersions };
