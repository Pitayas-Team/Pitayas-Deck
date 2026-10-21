// ═══════ PITAYA DECK — DANE DECKA ═══════
// Profile → foldery → przyciski, urządzenia i ustawienia serwera.
// Wszystko w jednym pliku data/deck.json (zapis z opóźnieniem, przez plik tymczasowy).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const uid = (prefix) => `${prefix}_${crypto.randomBytes(5).toString('hex')}`;

function defaultDeck() {
    const root = uid('f');
    return {
        version: 1,
        profiles: [{ id: 'main', name: 'Główny', cols: 5, rows: 3, root }],
        folders: {
            [root]: {
                id: root,
                name: 'Start',
                parent: null,
                buttons: {
                    '0,0': { type: 'clock', w: 2, h: 1, bg: '#e6007e', color: '#ffffff', clock: { seconds: false, date: true }, actions: {} },
                    '2,0': { type: 'media', w: 2, h: 2, bg: '#23222a', media: { album: false, timeline: true }, actions: {} },
                    '4,0': { type: 'slider', w: 1, h: 2, label: 'Głośność', bg: '#23222a', slider: { preset: 'volume', orientation: 'vertical', showValue: true, min: 0, max: 100, step: 1 }, actions: {} },
                    '0,1': { label: 'Wycisz', icon: { type: 'lucide', value: 'volume-x' }, bg: '#23222a', labelShadow: true, stateVar: 'media.muted', on: { bg: '#ff5d73', label: 'Wyciszone' }, actions: { press: [{ plugin: 'media', action: 'volume', config: { mode: 'mute' } }] } },
                    '1,1': { label: 'Mikrofon', icon: { type: 'lucide', value: 'mic' }, bg: '#23222a', labelShadow: true, stateVar: 'media.micMuted', on: { bg: '#ff5d73', icon: { type: 'lucide', value: 'mic-off' }, label: 'Mikrofon wył.' }, actions: { press: [{ plugin: 'media', action: 'mic', config: { mode: 'toggle' } }] } },
                    '0,2': { label: 'Poprzedni', icon: { type: 'lucide', value: 'skip-back' }, bg: '#23222a', labelShadow: true, actions: { press: [{ plugin: 'media', action: 'media', config: { command: 'previous' } }] } },
                    '1,2': { label: 'Graj / pauza', icon: { type: 'lucide', value: 'play' }, bg: '#23222a', labelShadow: true, stateVar: 'media.playing', on: { icon: { type: 'lucide', value: 'pause' } }, actions: { press: [{ plugin: 'media', action: 'media', config: { command: 'play-pause' } }] } },
                    '2,2': { label: 'Następny', icon: { type: 'lucide', value: 'skip-forward' }, bg: '#23222a', labelShadow: true, actions: { press: [{ plugin: 'media', action: 'media', config: { command: 'next' } }] } },
                    '3,2': { type: 'gauge', w: 1, h: 1, bg: '#23222a', gaugeStyle: 'ring', gauges: [{ var: 'system.cpu', name: 'CPU', max: 100, unit: '%' }], actions: {} },
                    '4,2': { label: 'Zablokuj', icon: { type: 'lucide', value: 'lock' }, bg: '#2f2e38', labelShadow: true, actions: { press: [{ plugin: 'system', action: 'lock', config: {} }] } },
                },
            },
        },
        variables: {},
        devices: {},
        settings: { port: 8191, requireApproval: true, showClock: true },
    };
}

function createStore(dataDir, log = () => {}) {
    const file = path.join(dataDir, 'deck.json');
    const imagesDir = path.join(dataDir, 'images');
    fs.mkdirSync(imagesDir, { recursive: true });
    let deck;
    try {
        deck = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        deck = defaultDeck();
    }
    // Uzupełnienie brakujących pól po aktualizacjach
    const def = defaultDeck();
    for (const key of ['profiles', 'folders', 'variables', 'devices', 'settings']) if (!deck[key]) deck[key] = def[key];
    if (!deck.widgetStates) deck.widgetStates = {};
    if (!Array.isArray(deck.scripts)) deck.scripts = [];          // Skrypty: nazwane listy bloków do użycia w wielu przyciskach
    if (!Array.isArray(deck.automations)) deck.automations = [];  // Automatyzacje: bloki uruchamiane zdarzeniem, bez dotykania przycisku   // aktywny stan przycisków wielostanowych: "<folder>/<x,y>" → id stanu
    deck.settings = { ...def.settings, ...deck.settings };
    if (!deck.profiles.length) { deck.profiles = def.profiles; deck.folders = { ...deck.folders, ...def.folders }; }

    const listeners = new Set();
    let timer = null;
    function save() {
        clearTimeout(timer);
        timer = setTimeout(flush, 250);
    }
    function flush() {
        clearTimeout(timer);
        try {
            const tmp = `${file}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify(deck, null, 2));
            fs.renameSync(tmp, file);
        } catch (err) { log('Zapis deck.json nie powiódł się:', err.message); }
    }
    function changed(what, detail) {
        save();
        for (const fn of listeners) { try { fn(what, detail); } catch {} }
    }

    const api = {
        get deck() { return deck; },
        onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
        flush,
        imagesDir,

        profile: (id) => deck.profiles.find((p) => p.id === id) || deck.profiles[0],
        folder: (id) => deck.folders[id] || null,
        // Ścieżka od korzenia do folderu (dla „okruszków” w edytorze i przycisku Wstecz)
        folderPath(id) {
            const out = [];
            let f = deck.folders[id];
            while (f) { out.unshift(f); f = f.parent ? deck.folders[f.parent] : null; }
            return out;
        },
        profileOfFolder(id) {
            const root = api.folderPath(id)[0];
            return root ? deck.profiles.find((p) => p.root === root.id) : null;
        },

        addProfile(name) {
            const root = uid('f');
            deck.folders[root] = { id: root, name: 'Start', parent: null, buttons: {} };
            const p = { id: uid('p'), name: name || 'Nowy profil', cols: 5, rows: 3, root };
            deck.profiles.push(p);
            changed('profiles');
            return p;
        },
        updateProfile(id, patch) {
            const p = deck.profiles.find((x) => x.id === id);
            if (!p) return null;
            if (patch.name !== undefined) p.name = String(patch.name).slice(0, 60) || p.name;
            if (patch.cols !== undefined) p.cols = Math.max(1, Math.min(12, parseInt(patch.cols, 10) || p.cols));
            if (patch.rows !== undefined) p.rows = Math.max(1, Math.min(10, parseInt(patch.rows, 10) || p.rows));
            // Wygląd profilu: odstęp między przyciskami (% pola), zaokrąglenie (%), tło decka
            if (patch.spacing !== undefined) p.spacing = Math.max(0, Math.min(40, parseInt(patch.spacing, 10) || 0));
            if (patch.radius !== undefined) p.radius = Math.max(0, Math.min(50, parseInt(patch.radius, 10) || 0));
            if (patch.background !== undefined) p.background = String(patch.background || '');
            if (Array.isArray(patch.favorites)) p.favorites = patch.favorites.filter((id) => deck.folders[id]);
            if (patch.emptyCells !== undefined) p.emptyCells = patch.emptyCells === 'transparent' ? 'transparent' : 'visible';
            changed('profiles');
            return p;
        },
        // Własny rozmiar siatki folderu (puste = jak w profilu)
        folderGrid(id, cols, rows) {
            const f = deck.folders[id];
            if (!f) return null;
            f.cols = cols ? Math.max(1, Math.min(12, parseInt(cols, 10))) : undefined;
            f.rows = rows ? Math.max(1, Math.min(10, parseInt(rows, 10))) : undefined;
            changed('folders');
            return f;
        },
        gridOf(folderId) {
            const f = deck.folders[folderId];
            const p = api.profileOfFolder(folderId) || deck.profiles[0];
            return { cols: (f && f.cols) || p.cols, rows: (f && f.rows) || p.rows };
        },
        widgetState: (folderId, key) => deck.widgetStates[`${folderId}/${key}`],
        setWidgetState(folderId, key, stateId) {
            deck.widgetStates[`${folderId}/${key}`] = stateId;
            changed('states', { folderId, key });
        },
        deleteProfile(id) {
            if (deck.profiles.length <= 1) return false;
            const p = deck.profiles.find((x) => x.id === id);
            if (!p) return false;
            const remove = (fid) => {
                for (const f of Object.values(deck.folders)) if (f.parent === fid) remove(f.id);
                delete deck.folders[fid];
            };
            remove(p.root);
            deck.profiles = deck.profiles.filter((x) => x.id !== id);
            for (const d of Object.values(deck.devices)) if (d.profile === id) d.profile = deck.profiles[0].id;
            changed('profiles');
            return true;
        },

        addFolder(parentId, name) {
            if (!deck.folders[parentId]) return null;
            const f = { id: uid('f'), name: name || 'Nowy folder', parent: parentId, buttons: {} };
            deck.folders[f.id] = f;
            changed('folders');
            return f;
        },
        renameFolder(id, name) {
            const f = deck.folders[id];
            if (!f) return null;
            f.name = String(name).slice(0, 60) || f.name;
            changed('folders');
            return f;
        },
        deleteFolder(id) {
            const f = deck.folders[id];
            if (!f || !f.parent) return false;
            const remove = (fid) => {
                for (const x of Object.values(deck.folders)) if (x.parent === fid) remove(x.id);
                delete deck.folders[fid];
            };
            remove(id);
            // Przyciski „Otwórz folder” wskazujące usunięty folder zostają, ale nic nie robią
            changed('folders');
            return true;
        },

        setButton(folderId, key, button) {
            const f = deck.folders[folderId];
            if (!f) return null;
            if (button) f.buttons[key] = button;
            else delete f.buttons[key];
            changed('buttons', { folderId, key });
            return f.buttons[key] || null;
        },
        moveButton(folderId, from, to) {
            const f = deck.folders[folderId];
            if (!f || from === to) return;
            const a = f.buttons[from], b = f.buttons[to];
            if (a) f.buttons[to] = a; else delete f.buttons[to];
            if (b) f.buttons[from] = b; else delete f.buttons[from];
            changed('buttons', { folderId });
        },

        // Urządzenia (telefony, tablety, przeglądarki)
        // Skrypty i automatyzacje zapisujemy w całości (edytor wysyła całą listę)
        setScripts(list) { deck.scripts = Array.isArray(list) ? list : []; changed('scripts'); return deck.scripts; },
        setAutomations(list) { deck.automations = Array.isArray(list) ? list : []; changed('automations'); return deck.automations; },
        device: (id) => deck.devices[id] || null,
        upsertDevice(id, patch) {
            const d = deck.devices[id] || { id, name: 'Urządzenie', profile: deck.profiles[0].id, approved: !deck.settings.requireApproval, added: Date.now() };
            Object.assign(d, patch);
            deck.devices[id] = d;
            changed('devices');
            return d;
        },
        removeDevice(id) {
            delete deck.devices[id];
            changed('devices');
        },

        setSettings(patch) {
            deck.settings = { ...deck.settings, ...patch };
            changed('settings');
            return deck.settings;
        },

        // Obrazy przycisków: zapisujemy pod skrótem treści, żeby się nie dublowały
        saveImage(buffer, ext = 'png') {
            const hash = crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 16);
            const name = `${hash}.${ext.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png'}`;
            const target = path.join(imagesDir, name);
            if (!fs.existsSync(target)) fs.writeFileSync(target, buffer);
            return name;
        },

        exportDeck: () => JSON.parse(JSON.stringify({ ...deck, devices: {} })),
        importDeck(data) {
            if (!data || !Array.isArray(data.profiles) || typeof data.folders !== 'object') throw new Error('To nie jest plik Pitaya Deck.');
            deck = { ...defaultDeck(), ...data, devices: deck.devices, settings: { ...deck.settings, ...(data.settings || {}) } };
            changed('all');
        },
    };
    return api;
}

module.exports = { createStore, uid, defaultDeck };
