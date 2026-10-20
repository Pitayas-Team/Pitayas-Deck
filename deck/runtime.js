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
// Wtyczki wbudowane: ./plugins, wtyczki użytkownika: ~/.config/Pitayas/Deck/data/plugins/<nazwa>/index.js
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
    function render(text) {
        return String(text || '').replace(/\{([\w.\-]+)\}/g, (m, name) => (variables.has(name) ? formatValue(variables.get(name).value) : m));
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
            log: (...a) => log(`[${id}]`, ...a),
            notify: (text, type = 'info') => notify(text, type),
            deck: deckApi,
            ...services,
            ...extra,
        };
    }

    function loadDir(dir, builtin) {
        if (!fs.existsSync(dir)) return;
        for (const name of fs.readdirSync(dir)) {
            const main = path.join(dir, name, 'index.js');
            if (!fs.existsSync(main)) continue;
            try {
                delete require.cache[require.resolve(main)];
                const def = require(main);
                if (!def || !def.id || !Array.isArray(def.actions)) throw new Error('index.js musi eksportować { id, name, actions }');
                if (plugins.has(def.id)) throw new Error(`wtyczka „${def.id}” jest już załadowana`);
                plugins.set(def.id, { def, builtin, dir: path.join(dir, name) });
            } catch (err) {
                plugins.set(`błąd:${name}`, { def: { id: `błąd:${name}`, name, actions: [] }, builtin, dir: path.join(dir, name), error: err.message });
                log('Nie udało się wczytać wtyczki', name, err.message);
            }
        }
    }

    async function startAll() {
        loadUserVariables();
        loadDir(path.join(__dirname, 'plugins'), true);
        fs.mkdirSync(userPluginsDir, { recursive: true });
        loadDir(userPluginsDir, false);
        for (const [id, p] of plugins) {
            if (p.error || !p.def.start || isDisabled(id)) continue;
            try { await p.def.start(makeCtx(id)); } catch (err) { p.error = err.message; log('Start wtyczki', id, err.message); }
        }
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
            values: pluginSettings(id),
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
        for (const [k, v] of Object.entries(config)) if (typeof v === 'string') config[k] = render(v);
        await action.run(config, makeCtx(item.plugin, extra));
    }
    // Sekwencja akcji jednego przycisku: po kolei, błąd jednej nie zatrzymuje reszty
    async function runActions(list, extra = {}) {
        const errors = [];
        for (const item of list || []) {
            if (!item || item.enabled === false) continue;
            try { await runOne(item, extra); } catch (err) {
                errors.push(err.message);
                log('Akcja nie powiodła się:', item.plugin, item.action, err.message);
            }
        }
        if (errors.length) notify(errors.join(' · '), 'error');
        return errors;
    }

    return {
        startAll, stopAll, describe, fieldOptions, runActions, setPluginSettings, pluginSettings,
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
