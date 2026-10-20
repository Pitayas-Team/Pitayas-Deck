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
                    '0,0': { label: 'Witaj!', icon: { type: 'emoji', value: '🐉' }, bg: '#e6007e', color: '#ffffff', actions: { press: [] } },
                    '1,0': { label: '{system.time}', icon: { type: 'none' }, bg: '#23222a', color: '#ffffff', fontSize: 20, labelPos: 'center', actions: { press: [] } },
                    '2,0': { label: 'Głośniej', icon: { type: 'glyph', value: 'volume-up' }, bg: '#23222a', color: '#ffffff', actions: { press: [{ plugin: 'media', action: 'volume', config: { mode: 'up', step: 5 } }] } },
                    '3,0': { label: 'Ciszej', icon: { type: 'glyph', value: 'volume-down' }, bg: '#23222a', color: '#ffffff', actions: { press: [{ plugin: 'media', action: 'volume', config: { mode: 'down', step: 5 } }] } },
                    '4,0': { label: 'Wycisz', icon: { type: 'glyph', value: 'volume-off' }, bg: '#23222a', color: '#ffffff', stateVar: 'media.muted', on: { bg: '#ff5d73', label: 'Wyciszone' }, actions: { press: [{ plugin: 'media', action: 'volume', config: { mode: 'mute' } }] } },
                    '0,1': { label: 'Poprzedni', icon: { type: 'glyph', value: 'prev' }, bg: '#23222a', color: '#ffffff', actions: { press: [{ plugin: 'media', action: 'media', config: { command: 'previous' } }] } },
                    '1,1': { label: 'Graj / pauza', icon: { type: 'glyph', value: 'play-pause' }, bg: '#23222a', color: '#ffffff', actions: { press: [{ plugin: 'media', action: 'media', config: { command: 'play-pause' } }] } },
                    '2,1': { label: 'Następny', icon: { type: 'glyph', value: 'next' }, bg: '#23222a', color: '#ffffff', actions: { press: [{ plugin: 'media', action: 'media', config: { command: 'next' } }] } },
                    '3,1': { label: 'CPU {system.cpu}%', icon: { type: 'glyph', value: 'chip' }, bg: '#23222a', color: '#ffffff', actions: { press: [] } },
                    '4,1': { label: 'Mikrofon', icon: { type: 'glyph', value: 'mic' }, bg: '#23222a', color: '#ffffff', stateVar: 'media.micMuted', on: { bg: '#ff5d73', icon: { type: 'glyph', value: 'mic-off' }, label: 'Mikrofon wył.' }, actions: { press: [{ plugin: 'media', action: 'mic', config: { mode: 'toggle' } }] } },
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
            changed('profiles');
            return p;
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
