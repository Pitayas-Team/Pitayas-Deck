// Pitaya Deck na telefonie / tablecie / w przeglądarce.
// Łączy się przez WebSocket z komputerem, rysuje siatkę przycisków i wysyła naciśnięcia.
(function () {
    const $ = (id) => document.getElementById(id);
    const grid = $('grid');
    const wrap = $('wrap');
    const LONG_MS = 500;

    let ws = null;
    let state = null;
    let retry = 0;
    let toastTimer = null;

    // Stały identyfikator urządzenia — dzięki niemu komputer pamięta zatwierdzenie
    function deviceId() {
        try {
            let id = localStorage.getItem('pitaya-deck-id');
            if (!id) {
                id = 'd' + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
                localStorage.setItem('pitaya-deck-id', id);
            }
            return id;
        } catch {
            return 'd' + Math.random().toString(16).slice(2) + Date.now().toString(16);
        }
    }
    function deviceName() {
        const ua = navigator.userAgent;
        const os = /iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? ((ua.match(/Android[^;]*;\s*([^;)]+?)(?:\sBuild|\))/) || [])[1] || 'Android') : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Urządzenie';
        const browser = /Firefox\//.test(ua) ? 'Firefox' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'przeglądarka';
        return `${os.trim()} · ${browser}`;
    }

    function screen(title, text, spinner = true) {
        $('screen').classList.toggle('hidden', !title);
        if (!title) return;
        $('screenTitle').textContent = title;
        $('screenText').innerHTML = text;
        $('spinner').classList.toggle('hidden', !spinner);
    }
    function toast(text, kind) {
        const el = $('toast');
        el.textContent = text;
        el.className = `toast show ${kind || ''}`;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { el.className = 'toast'; }, 2600);
    }

    // ───── Połączenie ─────
    function connect() {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        ws = new WebSocket(`${proto}://${location.host}/ws`);
        ws.onopen = () => {
            retry = 0;
            ws.send(JSON.stringify({ t: 'hello', deviceId: deviceId(), name: deviceName() }));
        };
        ws.onmessage = (e) => {
            let msg;
            try { msg = JSON.parse(e.data); } catch { return; }
            if (msg.t === 'state') { state = msg; screen(null); render(); }
            else if (msg.t === 'pending') screen('Zatwierdź na komputerze', `To urządzenie (<b>${escapeHtml(msg.name)}</b>) czeka na zgodę w aplikacji Pitaya Deck na komputerze.`);
            else if (msg.t === 'denied') screen('Brak dostępu', 'Komputer odrzucił to urządzenie. Możesz je odblokować w Pitaya Deck → Urządzenia.', false);
            else if (msg.t === 'toast') toast(msg.text, msg.kind);
        };
        ws.onclose = () => {
            const delay = Math.min(8000, 500 * 2 ** retry++);
            if (!state || retry > 1) screen('Łączenie…', 'Nie ma połączenia z komputerem. Sprawdź, czy Pitaya Deck jest uruchomiony i telefon jest w tej samej sieci.');
            setTimeout(connect, delay);
        };
        ws.onerror = () => {};
    }
    function send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
    const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ───── Siatka ─────
    function layout() {
        if (!state) return;
        const { cols, rows } = state.profile;
        const box = wrap.getBoundingClientRect();
        // Pionowy telefon i szeroka siatka: podpowiadamy obrót (zabiera trochę miejsca na dole)
        const portraitHint = box.height > box.width * 1.25 && cols > rows;
        $('rotateHint').hidden = !portraitHint;
        const W = box.width - 24, H = box.height - 18 - (portraitHint ? 32 : 0);
        const gap = Math.max(6, Math.min(16, Math.min(W / cols, H / rows) * 0.1));
        const cell = Math.floor(Math.min((W - gap * (cols - 1)) / cols, (H - gap * (rows - 1)) / rows));
        grid.style.setProperty('--gap', `${gap}px`);
        grid.style.setProperty('--cell', `${cell}px`);
        grid.style.gridTemplateColumns = `repeat(${cols}, ${cell}px)`;
        grid.style.gridTemplateRows = `repeat(${rows}, ${cell}px)`;
        return cell;
    }
    function render() {
        const { cols, rows } = state.profile;
        $('folderName').textContent = state.folder.name || state.profile.name;
        $('profileName').textContent = state.folder.canBack ? state.profile.name : (state.device ? state.device.name : '');
        $('btnBack').hidden = !state.folder.canBack;
        $('clock').hidden = !state.settings.showClock;
        const cell = layout();
        const total = cols * rows;
        while (grid.children.length < total) grid.appendChild(makeCell());
        while (grid.children.length > total) grid.lastChild.remove();
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const el = grid.children[y * cols + x];
                const key = `${x},${y}`;
                el.dataset.key = key;
                PitayaDeckRender.paint(el, state.buttons[key] || null, cell);
            }
        }
    }

    // Krótkie dotknięcie = „press”, przytrzymanie = „long” (tylko gdy przycisk ma taką akcję), puszczenie = „release”
    function makeCell() {
        const el = document.createElement('div');
        let timer = null;
        let longSent = false;
        let active = false;
        const button = () => state && state.buttons[el.dataset.key];
        el.addEventListener('pointerdown', (e) => {
            const b = button();
            if (!b) return;
            e.preventDefault();
            active = true;
            longSent = false;
            el.classList.add('pressed');
            try { el.setPointerCapture(e.pointerId); } catch {}
            if (navigator.vibrate) navigator.vibrate(12);
            if (b.hasLong) {
                timer = setTimeout(() => {
                    longSent = true;
                    if (navigator.vibrate) navigator.vibrate([10, 40, 20]);
                    send({ t: 'press', key: el.dataset.key, phase: 'long' });
                }, LONG_MS);
            } else {
                send({ t: 'press', key: el.dataset.key, phase: 'press' });
            }
        });
        const up = (cancelled) => {
            if (!active) return;
            active = false;
            clearTimeout(timer);
            el.classList.remove('pressed');
            const b = button();
            if (!b) return;
            if (b.hasLong && !longSent && !cancelled) send({ t: 'press', key: el.dataset.key, phase: 'press' });
            send({ t: 'press', key: el.dataset.key, phase: 'release' });
        };
        el.addEventListener('pointerup', () => up(false));
        el.addEventListener('pointercancel', () => up(true));
        el.addEventListener('contextmenu', (e) => e.preventDefault());
        return el;
    }

    // ───── Pasek ─────
    $('btnBack').addEventListener('click', () => send({ t: 'nav', to: 'back' }));
    $('btnFull').addEventListener('click', () => {
        const d = document;
        if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
        else { const el = d.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); }
    });
    function clock() {
        const n = new Date();
        $('clock').textContent = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
    }
    setInterval(clock, 5000);
    clock();
    // Ekran nie gaśnie, póki deck jest otwarty (jeśli przeglądarka pozwala)
    async function wake() { try { if (navigator.wakeLock && document.visibilityState === 'visible') await navigator.wakeLock.request('screen'); } catch {} }
    document.addEventListener('visibilitychange', wake);
    wake();

    addEventListener('resize', () => state && render());
    connect();
})();
