// ═══════ PITAYA DECK — WTYCZKI, AKCJE I ZMIENNE ═══════
//
// Wtyczka to folder z plikiem index.js, który eksportuje obiekt:
//   {
//     id: 'obs', name: 'OBS Studio', description: '…',
//     settings: [{ key, label, type: 'text'|'password'|'number'|'bool', default }],   // ustawienia wtyczki
//     variables: [{ id, label }],                                                       // zmienne: <id wtyczki>.<id>
//     actions: [{
//       id, name, description,
//       fields: [{ key, label, type: 'text'|'textarea'|'number'|'select'|'bool'|'file'|'folder'|'variable',
//                  options: [{ value, label }] | async (ctx) => [...], default, placeholder }],
//       run: async (config, ctx) => {}
//     }],
//     start: async (ctx) => {}, stop: async () => {}, settingsChanged: async (ctx) => {}
//   }
// ctx: { settings, setVariable(id, value), getVariable(name), log, notify(text, type), deck, device, button }
//
// Wtyczki wbudowane: ./plugins, wtyczki ze sklepu i użytkownika: ~/.config/Pitayas/Deck/data/plugins/<nazwa>/index.js
// (obok może leżeć plugin.json z opisem dla sklepu: wersja, autor, ikona, kategoria)
const fs = require('fs');
const path = require('path');

function formatValue(v) {
    if (v === undefined || v === null) return '';
    if (typeof v === 'boolean') return v ? 'wł.' : 'wył.';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(1);
    return String(v);
}

function createRuntime({ store, userPluginsDir, log, notify, services = {} }) {
    const plugins = new Map();       // id → { def, builtin, dir, error }
    const variables = new Map();     // nazwa → { value, label, plugin }
    const varListeners = new Set();
    let deckApi = null;              // nawigacja itp. — podaje serwer

    // ───── Zmienne ─────
    function setVariable(name, value, meta = {}) {
        const prev = variables.get(name);
        if (prev && prev.value === value) return;
        variables.set(name, { value, label: meta.label || (prev && prev.label) || name, plugin: meta.plugin || (prev && prev.plugin) || null });
        for (const fn of varListeners) { try { fn(name, value); } catch {} }
    }
    function getVariable(name) {
        const v = variables.get(name);
        return v ? v.value : undefined;
    }
    // Zmienne użytkownika są zapisywane w deck.json
    function loadUserVariables() {
        for (const [name, v] of Object.entries(store.deck.variables || {})) setVariable(name, v.value, { label: name, plugin: 'user' });
    }
    function setUserVariable(name, value, type) {
        const vars = store.deck.variables;
        const prev = vars[name];
        vars[name] = { type: type || (prev && prev.type) || typeof value, value };
        store.setSettings({});   // zapis
        setVariable(name, value, { label: name, plugin: 'user' });
    }
    function deleteUserVariable(name) {
        delete store.deck.variables[name];
        store.setSettings({});
        variables.delete(name);
        for (const fn of varListeners) { try { fn(name, undefined); } catch {} }
    }
    // locals: wartości dostępne tylko w danej akcji, np. {value} z suwaka
    function render(text, locals) {
        return String(text || '').replace(/\{([\w.\-]+)\}/g, (m, name) => {
            if (locals && name in locals) return formatValue(locals[name]);
            return variables.has(name) ? formatValue(variables.get(name).value) : m;
        });
    }
    function variablesUsed(text) {
        return [...String(text || '').matchAll(/\{([\w.\-]+)\}/g)].map((m) => m[1]);
    }

    // ───── Wtyczki ─────
    function pluginSettings(id) {
        const all = store.deck.settings.plugins || {};
        const def = plugins.get(id);
        const defaults = {};
        for (const s of (def && def.def.settings) || []) if (s.default !== undefined) defaults[s.key] = s.default;
        return { ...defaults, ...(all[id] || {}) };
    }
    const statusListeners = new Set();
    function makeCtx(id, extra = {}) {
        return {
            plugin: id,
            get settings() { return pluginSettings(id); },
            setVariable: (varId, value) => {
                const p = plugins.get(id);
                const meta = ((p && p.def.variables) || []).find((v) => v.id === varId);
                setVariable(`${id}.${varId}`, value, { label: meta ? meta.label : varId, plugin: id });
            },
            getVariable,
            setUserVariable,
            // Zapis ustawień bez wywoływania settingsChanged (np. tokeny logowania)
            saveSettings: (patch) => {
                const all = { ...(store.deck.settings.plugins || {}) };
                all[id] = { ...(all[id] || {}), ...patch };
                store.setSettings({ plugins: all });
            },
            // Krótki opis stanu w ustawieniach wtyczki, np. „Zalogowano jako …”
            setStatus: (text, ok = true) => {
                const p = plugins.get(id);
                if (!p || (p.status && p.status.text === text && p.status.ok === ok)) return;
                p.status = text ? { text: String(text), ok: Boolean(ok) } : null;
                for (const fn of statusListeners) { try { fn(id); } catch {} }
            },
            serverPort: () => (services.getPort ? services.getPort() : 0),
            log: (...a) => log(`[${id}]`, ...a),
            notify: (text, type = 'info') => notify(text, type),
            deck: deckApi,
            ...services,
            ...extra,
        };
    }

    // Wtyczki z folderu danych mogą używać bibliotek aplikacji (np. ws) — dokładamy node_modules aplikacji do ścieżek
    const appModules = path.join(__dirname, '..', 'node_modules');
    function withAppModules(mod) {
        try { if (mod && Array.isArray(mod.paths) && !mod.paths.includes(appModules)) mod.paths.push(appModules); } catch {}
    }
    const Module = require('module');
    const origResolve = Module._resolveFilename;
    if (!Module.__pitayaDeckPatched) {
        Module.__pitayaDeckPatched = true;
        Module._resolveFilename = function (request, parent, ...rest) {
            try { return origResolve.call(this, request, parent, ...rest); } catch (err) {
                if (parent && parent.filename && parent.filename.startsWith(userPluginsDir)) {
                    withAppModules(parent);
                    return origResolve.call(this, request, parent, ...rest);
                }
                throw err;
            }
        };
    }

    function readManifest(dir) {
        try { return JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8')); } catch { return null; }
    }
    function clearCache(dir) {
        for (const key of Object.keys(require.cache)) if (key.startsWith(dir + path.sep)) delete require.cache[key];
    }
    // Jedna wtyczka z folderu; zwraca jej id
    function loadOne(dir, builtin) {
        const main = path.join(dir, 'index.js');
        if (!fs.existsSync(main)) return null;
        const name = path.basename(dir);
        try {
            clearCache(dir);
            const def = require(main);
            if (!def || !def.id || !Array.isArray(def.actions)) throw new Error('index.js musi eksportować { id, name, actions }');
            if (plugins.has(def.id)) throw new Error(`wtyczka „${def.id}” jest już załadowana`);
            plugins.set(def.id, { def, builtin, dir, manifest: readManifest(dir) });
            return def.id;
        } catch (err) {
            plugins.set(`błąd:${name}`, { def: { id: `błąd:${name}`, name, actions: [] }, builtin, dir, error: err.message, manifest: readManifest(dir) });
            log('Nie udało się wczytać wtyczki', name, err.message);
            return `błąd:${name}`;
        }
    }
    function loadDir(dir, builtin) {
        if (!fs.existsSync(dir)) return;
        for (const name of fs.readdirSync(dir)) {
            if (name.startsWith('.')) continue;
            loadOne(path.join(dir, name), builtin);
        }
    }
    async function startPlugin(id) {
        const p = plugins.get(id);
        if (!p || p.error || !p.def.start || isDisabled(id)) return;
        try { await p.def.start(makeCtx(id)); } catch (err) { p.error = err.message; log('Start wtyczki', id, err.message); }
    }
    // Instalacja ze sklepu w trakcie działania: wczytaj i uruchom
    async function addPlugin(dir) {
        const id = loadOne(dir, false);
        if (id) await startPlugin(id);
        return id;
    }
    // Odinstalowanie / aktualizacja: zatrzymaj i zapomnij (zmienne wtyczki znikają)
    async function removePlugin(id) {
        const p = plugins.get(id) || [...plugins.values()].find((x) => x.manifest && x.manifest.id === id);
        if (!p) return null;
        const key = p.def.id;
        try { if (p.def.stop) await p.def.stop(); } catch {}
        plugins.delete(key);
        clearCache(p.dir);
        for (const name of [...variables.keys()]) {
            if (name.startsWith(`${key}.`)) { variables.delete(name); for (const fn of varListeners) { try { fn(name, undefined); } catch {} } }
        }
        return p.dir;
    }

    async function startAll() {
        loadUserVariables();
        loadDir(path.join(__dirname, 'plugins'), true);
        fs.mkdirSync(userPluginsDir, { recursive: true });
        loadDir(userPluginsDir, false);
        for (const id of [...plugins.keys()]) await startPlugin(id);
    }
    async function stopAll() {
        for (const [, p] of plugins) { try { if (p.def.stop) await p.def.stop(); } catch {} }
    }
    function isDisabled(id) {
        return ((store.deck.settings.disabledPlugins) || []).includes(id);
    }
    async function setPluginSettings(id, patch) {
        const all = { ...(store.deck.settings.plugins || {}) };
        all[id] = { ...(all[id] || {}), ...patch };
        store.setSettings({ plugins: all });
        const p = plugins.get(id);
        if (p && p.def.settingsChanged) {
            try { await p.def.settingsChanged(makeCtx(id)); p.error = null; } catch (err) { p.error = err.message; }
        }
        return pluginSettings(id);
    }

    // Opis wtyczek dla edytora (bez funkcji)
    function describe() {
        return [...plugins.entries()].map(([id, p]) => ({
            id,
            name: p.def.name || id,
            description: p.def.description || '',
            builtin: p.builtin,
            error: p.error || null,
            disabled: isDisabled(id),
            settings: (p.def.settings || []).map(({ key, label, type, default: d, placeholder, help }) => ({ key, label, type, default: d, placeholder, help })),
            // Tylko zadeklarowane pola — tokeny logowania zostają w procesie głównym
            values: Object.fromEntries((p.def.settings || []).filter((x) => x.type !== 'button' && x.type !== 'info').map((x) => [x.key, pluginSettings(id)[x.key]])),
            status: p.status || null,
            version: (p.manifest && p.manifest.version) || null,
            author: (p.manifest && p.manifest.author) || (p.builtin ? 'Pitayas' : null),
            icon: (p.manifest && p.manifest.icon) || null,
            color: (p.manifest && p.manifest.color) || null,
            fromStore: Boolean(p.manifest && p.manifest.store !== false && !p.builtin),
            variables: (p.def.variables || []).map(({ id: vid, label }) => ({ id: `${id}.${vid}`, label })),
            actions: p.def.actions.map((a) => ({
                id: a.id,
                name: a.name,
                description: a.description || '',
                fields: (a.fields || []).map((f) => ({
                    key: f.key, label: f.label, type: f.type || 'text', default: f.default, placeholder: f.placeholder, help: f.help,
                    options: Array.isArray(f.options) ? f.options : undefined,
                    dynamic: typeof f.options === 'function',
                })),
            })),
        }));
    }
    async function fieldOptions(pluginId, actionId, key) {
        const p = plugins.get(pluginId);
        const a = p && p.def.actions.find((x) => x.id === actionId);
        const f = a && (a.fields || []).find((x) => x.key === key);
        if (!f || typeof f.options !== 'function') return [];
        try { return await f.options(makeCtx(pluginId)); } catch (err) { return [{ value: '', label: `Błąd: ${err.message}` }]; }
    }

    // Przycisk w ustawieniach wtyczki (np. „Zaloguj do Spotify”)
    async function pluginCommand(id, key) {
        const p = plugins.get(id);
        const fn = p && p.def.commands && p.def.commands[key];
        if (!fn) throw new Error('Nieznane polecenie wtyczki');
        if (isDisabled(id)) throw new Error('Wtyczka jest wyłączona');
        return fn(makeCtx(id));
    }
    // Adresy /p/<wtyczka>/… na serwerze decka (np. powrót z logowania OAuth)
    async function pluginHttp(id, req, res, url) {
        const p = plugins.get(id);
        if (!p || !p.def.http || isDisabled(id)) { res.writeHead(404); res.end(); return; }
        try { await p.def.http(req, res, url, makeCtx(id)); } catch (err) {
            if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`Błąd: ${err.message}`);
        }
    }

    // ───── Akcje ─────
    async function runOne(item, extra) {
        const p = plugins.get(item.plugin);
        if (!p) throw new Error(`Brak wtyczki „${item.plugin}”`);
        if (isDisabled(item.plugin)) throw new Error(`Wtyczka „${p.def.name}” jest wyłączona`);
        const action = p.def.actions.find((a) => a.id === item.action);
        if (!action) throw new Error(`Wtyczka „${p.def.name}” nie ma akcji „${item.action}”`);
        const config = {};
        for (const f of action.fields || []) config[f.key] = f.default;
        Object.assign(config, item.config || {});
        // W polach tekstowych można używać zmiennych: {system.time}
        for (const [k, v] of Object.entries(config)) if (typeof v === 'string') config[k] = render(v, extra.locals);
        await action.run(config, makeCtx(item.plugin, extra));
    }
    // ───── Bloki (jak w Macro Deck 3) ─────
    // Lista bloków wykonuje się po kolei. Blok bez „kind” to akcja wtyczki { plugin, action, config }.
    //   { kind: 'if', branches: [{ cond, blocks }], else: [...] }        Jeśli / W przeciwnym razie jeśli / W przeciwnym razie
    //   { kind: 'switch', subject: '{zmienna}', cases: [{ value, blocks }], otherwise: [...] }
    //   { kind: 'repeat', times: 3, blocks }     { kind: 'while', cond, blocks }
    //   { kind: 'wait', ms }     { kind: 'break' } (wyjdź z pętli)     { kind: 'stop' } (zakończ całość)
    // cond: { join: 'and'|'or', rules: [{ left: 'spotify.playing', op: 'isOn', right: '' }] }
    // Każdy blok może mieć enabled: false (pominięty) i comment.
    const num = (v) => (typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : String(v ?? '').trim() !== '' && !isNaN(Number(String(v).replace(',', '.'))) ? Number(String(v).replace(',', '.')) : null);
    const truthyValue = (v) => v === true || v === 1 || /^(true|on|wł\.?|1|yes|tak|playing)$/i.test(String(v ?? '').trim());
    function ruleOk(r, extra) {
        const name = String(r.left || '').replace(/^\{|\}$/g, '');
        const has = Boolean(extra.locals && name in extra.locals) || variables.has(name);
        const left = extra.locals && name in extra.locals ? extra.locals[name] : getVariable(name);
        const right = render(r.right ?? '', extra.locals);
        const ln = num(left), rn = num(right);
        const ls = formatValue(left).toLowerCase(), rs = String(right).toLowerCase();
        switch (r.op || 'is') {
            case 'is': return ln !== null && rn !== null ? ln === rn : ls === rs || String(left ?? '').toLowerCase() === rs;
            case 'isNot': return !(ln !== null && rn !== null ? ln === rn : ls === rs || String(left ?? '').toLowerCase() === rs);
            case 'gt': return ln !== null && rn !== null && ln > rn;
            case 'gte': return ln !== null && rn !== null && ln >= rn;
            case 'lt': return ln !== null && rn !== null && ln < rn;
            case 'lte': return ln !== null && rn !== null && ln <= rn;
            case 'contains': return String(left ?? '').toLowerCase().includes(rs);
            case 'startsWith': return String(left ?? '').toLowerCase().startsWith(rs);
            case 'isEmpty': return String(left ?? '').trim() === '';
            case 'isNotEmpty': return String(left ?? '').trim() !== '';
            case 'isOn': return truthyValue(left);
            case 'isOff': return !truthyValue(left);
            case 'isAvailable': return has;
            case 'isNotAvailable': return !has;
            default: return false;
        }
    }
    function condOk(cond, extra) {
        const rules = (cond && cond.rules) || [];
        if (!rules.length) return true;
        return cond.join === 'or' ? rules.some((r) => ruleOk(r, extra)) : rules.every((r) => ruleOk(r, extra));
    }
    const LOOP_MAX = 1000;
    async function runBlocks(list, extra, ctl) {
        for (const b of list || []) {
            if (ctl.stop || ctl.break) return;
            if (!b || b.enabled === false) continue;
            if (++ctl.steps > 20000) { ctl.errors.push('Za dużo kroków — przerwano (sprawdź pętle)'); ctl.stop = true; return; }
            const kind = b.kind || 'action';
            try {
                if (kind === 'action') await runOne(b, extra);
                else if (kind === 'wait') await new Promise((r) => setTimeout(r, Math.max(0, Math.min(3600000, Number(render(String(b.ms ?? 0), extra.locals)) || 0))));
                else if (kind === 'if') {
                    const branch = (b.branches || []).find((br) => condOk(br.cond, extra));
                    await runBlocks(branch ? branch.blocks : b.else, extra, ctl);
                } else if (kind === 'switch') {
                    const subject = String(render(b.subject || '', extra.locals)).trim().toLowerCase();
                    const hit = (b.cases || []).find((c) => String(render(String(c.value ?? ''), extra.locals)).trim().toLowerCase() === subject);
                    await runBlocks(hit ? hit.blocks : b.otherwise, extra, ctl);
                } else if (kind === 'repeat') {
                    const times = Math.max(0, Math.min(LOOP_MAX, Math.round(Number(render(String(b.times ?? 1), extra.locals)) || 0)));
                    for (let i = 0; i < times && !ctl.stop; i++) {
                        await runBlocks(b.blocks, { ...extra, locals: { ...(extra.locals || {}), index: i + 1 } }, ctl);
                        if (ctl.break) { ctl.break = false; break; }
                    }
                } else if (kind === 'while') {
                    let i = 0;
                    while (!ctl.stop && condOk(b.cond, extra) && i++ < LOOP_MAX) {
                        await runBlocks(b.blocks, { ...extra, locals: { ...(extra.locals || {}), index: i } }, ctl);
                        if (ctl.break) { ctl.break = false; break; }
                        await new Promise((r) => setImmediate(r));   // nie blokuj aplikacji
                    }
                } else if (kind === 'break') ctl.break = true;
                else if (kind === 'stop') ctl.stop = true;
            } catch (err) {
                ctl.errors.push(err.message);
                log('Akcja nie powiodła się:', b.plugin || kind, b.action || '', err.message);
            }
        }
    }
    // Sekwencja bloków jednego wyzwalacza: po kolei, błąd jednej akcji nie zatrzymuje reszty
    async function runActions(list, extra = {}) {
        const ctl = { stop: false, break: false, steps: 0, errors: [] };
        await runBlocks(list, extra, ctl);
        if (ctl.errors.length) notify(ctl.errors.join(' · '), 'error');
        return ctl.errors;
    }

    return {
        condOk, startAll, stopAll, describe, addPlugin, removePlugin, has: (id) => plugins.has(id), fieldOptions, runActions, pluginCommand, pluginHttp,
        onStatus: (fn) => { statusListeners.add(fn); return () => statusListeners.delete(fn); }, setPluginSettings, pluginSettings,
        setVariable, getVariable, setUserVariable, deleteUserVariable, render, variablesUsed, formatValue,
        listVariables: () => [...variables.entries()].map(([name, v]) => ({ name, label: v.label, plugin: v.plugin, value: v.value, text: formatValue(v.value) })),
        onVariable: (fn) => { varListeners.add(fn); return () => varListeners.delete(fn); },
        setDeckApi: (api) => { deckApi = api; },
        setDisabled(id, disabled) {
            const list = new Set(store.deck.settings.disabledPlugins || []);
            if (disabled) list.add(id); else list.delete(id);
            store.setSettings({ disabledPlugins: [...list] });
        },
    };
}

module.exports = { createRuntime, formatValue };
