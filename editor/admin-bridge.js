// ═══════ PITAYA DECK — MOST DLA PANELU W PRZEGLĄDARCE (/admin) ═══════
// Zastępuje preload.js: te same window.deck i window.pitayaBridge, ale polecenia idą przez HTTP
// (POST /admin/api), a zdarzenia z aplikacji przychodzą przez SSE (/admin/events).
// Lista metod (nazwa → kanał IPC) przychodzi z serwera, który czyta ją z preload.js.
(function () {
    const { methods } = window.__PITAYA_ADMIN__ || { methods: {} };
    document.documentElement.classList.add('web-admin');

    async function rpc(channel, ...args) {
        const res = await fetch('/admin/api', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-Pitaya-Admin': '1' },
            body: JSON.stringify({ channel, args }),
        });
        if (res.status === 401) { location.href = '/admin'; throw new Error('Sesja wygasła'); }
        const msg = await res.json();
        if (!msg.ok) throw new Error(msg.error || 'Błąd panelu');
        return msg.result;
    }

    // ── Zdarzenia z aplikacji ──
    const listeners = new Map();
    const events = new EventSource('/admin/events');
    events.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        for (const cb of listeners.get(msg.channel) || []) { try { cb(...(msg.args || [])); } catch (err) { console.error(err); } }
    };

    // Wybór pliku z dysku przeglądarki
    function chooseFile(accept) {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            if (accept) input.accept = accept;
            input.onchange = () => resolve(input.files[0] || null);
            input.click();
        });
    }
    const readAs = (file, how) => new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r[how](file);
    });

    const deck = {};
    for (const [name, channel] of Object.entries(methods)) deck[name] = (...args) => rpc(channel, ...args);

    Object.assign(deck, {
        // Obraz: z dysku tego komputera (przeglądarki) prosto do decka; inne pliki — ścieżka na komputerze z deckiem
        async pickFile({ image } = {}) {
            if (image) {
                const file = await chooseFile('image/png,image/jpeg,image/gif,image/webp,image/svg+xml');
                if (!file) return null;
                if (file.size > 4 * 1024 * 1024) throw new Error('Obraz jest za duży (maks. 4 MB)');
                return rpc('deck:save-image-data', await readAs(file, 'readAsDataURL'));
            }
            const p = window.prompt('Ścieżka do pliku na komputerze z Pitaya Deck:');
            return p ? p.trim() : null;
        },
        async exportDeck() {
            const data = await rpc('deck:export-data');
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
            a.download = 'pitaya-deck.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 5000);
            return 'pitaya-deck.json (pobrany w przeglądarce)';
        },
        async importDeck() {
            const file = await chooseFile('application/json,.json');
            if (!file) return false;
            return rpc('deck:import-data', JSON.parse(await readAs(file, 'readAsText')));
        },
        async copyText(text) {
            try { await navigator.clipboard.writeText(String(text || '')); } catch {
                const t = document.createElement('textarea');
                t.value = String(text || '');
                document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
            }
            return true;
        },
        async openUrl(url) { window.open(url, '_blank', 'noopener'); },
        async openPluginsDir() { throw new Error('Folder wtyczek otworzysz w aplikacji na komputerze'); },
        maximize() {},
        quit() {},
        on(channel, cb) {
            const key = `deck:${channel}`;
            if (!listeners.has(key)) listeners.set(key, []);
            listeners.get(key).push(cb);
        },
        isWebAdmin: true,
    });
    window.deck = deck;

    // Pitaya Core (pasek okna, aktualizacje) — w przeglądarce tylko informacje
    window.pitayaBridge = {
        minimize() {},
        close() {},
        getAppInfo: () => rpc('deck:app-info'),
        getSettings: async () => ({}),
        setSettings: async () => ({}),
        openDataDir: async () => false,
        checkUpdate: async () => ({ error: 'Aktualizacje instalujesz w aplikacji na komputerze' }),
        applyUpdate: async () => ({ error: 'Aktualizacje instalujesz w aplikacji na komputerze' }),
        onUpdateProgress() {},
        restart() {},
        openExternal: async (url) => { window.open(url, '_blank', 'noopener'); },
    };
})();
