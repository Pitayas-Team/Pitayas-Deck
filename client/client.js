// Pitaya Deck na telefonie / tablecie / w przeglądarce.
// Łączy się przez WebSocket z komputerem, rysuje siatkę przycisków i wysyła naciśnięcia.
(function () {
    const $ = (id) => document.getElementById(id);
    const grid = $('grid');
    const wrap = $('wrap');
    const LONG_MS = 500;
    const DOUBLE_MS = 280;

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
            if (msg.t === 'state') {
                const sliding = state && state.sliding;
                state = msg;
                screen(null);
                if (sliding) { state.sliding = sliding; return; }
                render();
            }
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
    let cellSize = 100;
    function layout() {
        if (!state) return 100;
        const { cols, rows } = state.profile;
        const sp = (state.style.spacing ?? 10) / 100;
        const box = wrap.getBoundingClientRect();
        // Pionowy telefon i szeroka siatka: podpowiadamy obrót (zabiera trochę miejsca na dole)
        const portraitHint = box.height > box.width * 1.25 && cols > rows;
        $('rotateHint').hidden = !portraitHint;
        const W = box.width - 24, H = box.height - 18 - (portraitHint ? 32 : 0);
        const cell = Math.floor(Math.min(W / (cols + (cols - 1) * sp), H / (rows + (rows - 1) * sp)));
        const gap = Math.round(cell * sp);
        grid.style.setProperty('--gap', `${gap}px`);
        grid.style.setProperty('--cell', `${cell}px`);
        grid.style.setProperty('--pd-radius', `${Math.round((cell * (state.style.radius ?? 22)) / 100)}px`);
        grid.style.gridTemplateColumns = `repeat(${cols}, ${cell}px)`;
        grid.style.gridTemplateRows = `repeat(${rows}, ${cell}px)`;
        // Tło decka: kolor profilu, z różowym gradientem albo bez (Ustawienia siatki → Gradient tła)
        const bg = state.style.background || 'var(--bg)';
        document.body.style.background = state.style.gradient === false ? bg : `radial-gradient(700px 400px at 100% -10%, rgba(255,60,160,0.16), transparent 70%), ${bg}`;
        grid.classList.toggle('empty-hidden', state.style.emptyCells === 'transparent');
        cellSize = cell;
        return cell;
    }
    function render() {
        const { cols, rows } = state.profile;
        $('folderName').textContent = state.folder.name || state.profile.name;
        $('profileName').textContent = state.folder.canBack ? state.profile.name : (state.device ? state.device.name : '');
        $('btnBack').hidden = !state.folder.canBack;
        $('clock').hidden = !state.settings.showClock;
        const cell = layout();
        // Widżet zajmuje w×h pól od swojego lewego górnego rogu; zajęte pola nie dostają pustych kafelków
        const covered = new Set();
        const items = [];
        for (const [key, b] of Object.entries(state.buttons)) {
            const [x, y] = key.split(',').map(Number);
            if (x >= cols || y >= rows) continue;
            const w = Math.min(b.w || 1, cols - x), h = Math.min(b.h || 1, rows - y);
            for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) covered.add(`${x + dx},${y + dy}`);
            items.push({ key, x, y, w, h, b });
        }
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!covered.has(`${x},${y}`)) items.push({ key: `${x},${y}`, x, y, w: 1, h: 1, b: null });
        grid.innerHTML = '';
        for (const it of items) {
            const el = makeCell(it.key);
            el.style.gridColumn = `${it.x + 1} / span ${it.w}`;
            el.style.gridRow = `${it.y + 1} / span ${it.h}`;
            PitayaDeckRender.paint(el, it.b, cell);
            if (it.b && it.b.type === 'media' && it.w < 2) el.classList.add('narrow');
            grid.appendChild(el);
        }
    }

    // Krótkie dotknięcie = „press”, przytrzymanie = „long” (tylko gdy przycisk ma taką akcję), puszczenie = „release”
    function makeCell(key) {
        const el = document.createElement('div');
        el.dataset.key = key;
        let timer = null;
        let longSent = false;
        let active = false;
        const button = () => state && state.buttons[key];
        el.addEventListener('pointerdown', (e) => {
            const b = button();
            if (!b) return;
            // Przyciski odtwarzacza w widżecie muzyki
            const mbtn = e.target.closest('[data-media]');
            if (b.type === 'media') {
                if (mbtn) { e.preventDefault(); if (navigator.vibrate) navigator.vibrate(12); send({ t: 'media', key, cmd: mbtn.dataset.media }); }
                return;
            }
            if (b.type === 'slider') return startSlider(e, el, key);
            if (b.type === 'clock' || b.type === 'gauge') { if (!b.hasActions) {} }
            e.preventDefault();
            active = true;
            longSent = false;
            el.classList.add('pressed');
            try { el.setPointerCapture(e.pointerId); } catch {}
            if (navigator.vibrate) navigator.vibrate(12);
            const tr = b.triggers || {};
            if (tr.touchStart) send({ t: 'press', key, phase: 'down' });
            if (b.hasLong || tr.longPress) {
                timer = setTimeout(() => {
                    longSent = true;
                    if (navigator.vibrate) navigator.vibrate([10, 40, 20]);
                    send({ t: 'press', key, phase: 'long' });
                }, LONG_MS);
            } else if (!tr.doublePress) {
                send({ t: 'press', key, phase: 'press' });
            }
        });
        // Krótkie naciśnięcie, a przy bloku „Podwójne naciśnięcie” — czekamy chwilę na drugie dotknięcie
        let tapTimer = null;
        const shortPress = (tr) => {
            if (!tr.doublePress) return send({ t: 'press', key, phase: 'press' });
            if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; if (navigator.vibrate) navigator.vibrate([10, 30, 10]); return send({ t: 'press', key, phase: 'double' }); }
            tapTimer = setTimeout(() => { tapTimer = null; send({ t: 'press', key, phase: 'press' }); }, DOUBLE_MS);
        };
        const up = (cancelled) => {
            if (!active) return;
            active = false;
            clearTimeout(timer);
            el.classList.remove('pressed');
            const b = button();
            if (!b) return;
            const tr = b.triggers || {};
            if ((b.hasLong || tr.longPress || tr.doublePress) && !longSent && !cancelled) shortPress(tr);
            if (tr.release !== false) send({ t: 'press', key, phase: 'release' });
        };
        el.addEventListener('pointerup', () => up(false));
        el.addEventListener('pointercancel', () => up(true));
        el.addEventListener('contextmenu', (e) => e.preventDefault());
        return el;
    }

    // Suwak: wartość z pozycji palca, wysyłana na bieżąco; rysujemy od razu, bez czekania na komputer
    function startSlider(e, el, key) {
        e.preventDefault();
        const box = el.querySelector('.pd-sl');
        const track = el.querySelector('.pd-sl-track');
        if (!box || !track) return;
        const vertical = box.classList.contains('vertical');
        const min = parseFloat(box.dataset.min), max = parseFloat(box.dataset.max), step = parseFloat(box.dataset.step) || 1;
        const fill = el.querySelector('.pd-sl-fill');
        const valueEl = el.querySelector('.pd-sl-value');
        let last = null;
        const apply = (ev) => {
            const r = track.getBoundingClientRect();
            const f = vertical ? 1 - (ev.clientY - r.top) / r.height : (ev.clientX - r.left) / r.width;
            const v = Math.round((min + Math.max(0, Math.min(1, f)) * (max - min)) / step) * step;
            if (v === last) return;
            last = v;
            fill.style.setProperty('--pct', `${((v - min) / (max - min)) * 100}%`);
            if (valueEl) valueEl.textContent = valueEl.textContent.replace(/^-?[\d.,]+/, String(Math.round(v)));
            send({ t: 'slider', key, value: v });
        };
        state.sliding = key;
        try { el.setPointerCapture(e.pointerId); } catch {}
        apply(e);
        const move = (ev) => apply(ev);
        const end = () => {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', end);
            el.removeEventListener('pointercancel', end);
            setTimeout(() => { if (state.sliding === key) state.sliding = null; }, 600);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
    }
    setInterval(() => PitayaDeckRender.tickClocks(grid), 1000);

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
