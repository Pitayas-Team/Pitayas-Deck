// ═══════ PITAYA DECK — EDYTOR ═══════
(function () {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const R = window.PitayaDeckRender;
    const toast = (t, k) => window.PitayaUI && PitayaUI.showToast(t, k === 'error' ? 'error' : k || 'info');
    const clone = (x) => JSON.parse(JSON.stringify(x));

    const PALETTE = ['transparent', '#23222a', '#2f2e38', '#e6007e', '#ff4fa6', '#ff5d73', '#ef4444', '#ff7a3d', '#ffb52e', '#ffd166', '#16a34a', '#4cc38a', '#2dd4bf', '#4ea8ff', '#3b82f6', '#6c5ce7', '#c77dff', '#ffffff', '#000000'];
    const TEXT_COLORS = ['', '#ffffff', '#17161c', '#ff4fa6', '#ffd166', '#4cc38a', '#4ea8ff'];
    const ICON_COLORS = ['', '#ffffff', '#ff4fa6', '#ffd166', '#4cc38a', '#4ea8ff', '#c77dff', '#17161c'];
    const EMOJIS = ['🎮', '🎙️', '🎧', '🔴', '🎬', '📷', '💡', '🔊', '🔇', '⏯️', '⏭️', '⏮️', '📁', '🏠', '⭐', '❤️', '🔥', '✅', '❌', '⚡', '💬', '🎵', '🌐', '🔒', '☕', '🎉', '👋', '😂', '🐉', '🍓', '🌙', '⚙️'];
    const TYPES = { button: 'Przycisk', slider: 'Suwak', clock: 'Zegar', gauge: 'Wskaźniki', media: 'Odtwarzacz' };
    const PHASES = {
        press: ['Krótkie naciśnięcie', 'Wykonuje się po dotknięciu przycisku.'],
        longPress: ['Przytrzymanie', 'Po przytrzymaniu przez pół sekundy. Gdy są tu bloki, krótkie naciśnięcie czeka na puszczenie.'],
        doublePress: ['Podwójne naciśnięcie', 'Dwa szybkie dotknięcia. Krótkie naciśnięcie czeka wtedy chwilę na drugie.'],
        touchStart: ['Dotknięcie', 'Od razu, gdy palec dotknie przycisku — np. „naciśnij i trzymaj, żeby mówić”.'],
        release: ['Puszczenie', 'Gdy palec puści przycisk.'],
        change: ['Zmiana wartości', 'Przy każdym ruchu suwaka. W polach akcji wpisz {value}, żeby użyć wartości.'],
        stateChange: ['Zmiana stanu', 'Gdy przycisk zmieni stan (np. zmienna przełączy go na Wł.). Nazwa stanu: {state}.'],
    };
    // Polskie słowa → angielskie nazwy ikon Lucide (wyszukiwarka)
    const PL = {
        mikrofon: 'mic', głośność: 'volume', glosnosc: 'volume', głośniej: 'volume-2', ciszej: 'volume-1', wycisz: 'volume-x', dźwięk: 'volume', muzyka: 'music', graj: 'play', pauza: 'pause',
        następny: 'skip-forward', nastepny: 'skip-forward', poprzedni: 'skip-back', losowo: 'shuffle', powtarzaj: 'repeat', folder: 'folder', start: 'house', dom: 'house', wstecz: 'arrow-left', ustawienia: 'settings',
        kamera: 'camera', wideo: 'video', nagrywanie: 'circle-dot', transmisja: 'radio', scena: 'clapperboard', światło: 'lightbulb', swiatlo: 'lightbulb', żarówka: 'lightbulb', klawiatura: 'keyboard',
        terminal: 'terminal', polecenie: 'terminal', komenda: 'square-terminal', internet: 'globe', zasilanie: 'power', wyłącz: 'power', blokada: 'lock', kłódka: 'lock', procesor: 'cpu', pamięć: 'memory-stick',
        czat: 'message-circle', wiadomość: 'message-square', gwiazdka: 'star', serce: 'heart', błyskawica: 'zap', minutnik: 'timer', zegar: 'clock', ok: 'check', zamknij: 'x', gra: 'gamepad', gry: 'gamepad',
        pogoda: 'cloud-sun', słońce: 'sun', deszcz: 'cloud-rain', bateria: 'battery', telefon: 'smartphone', komputer: 'monitor', ekran: 'monitor', serwer: 'server', baza: 'database', kod: 'code',
        hasło: 'key-round', haslo: 'key-round', klucz: 'key', użytkownik: 'user', osoba: 'user', kosz: 'trash', pobierz: 'download', wyślij: 'send', link: 'link', kopiuj: 'copy', schowek: 'clipboard',
        notatka: 'sticky-note', kalendarz: 'calendar', alarm: 'alarm-clock', dzwonek: 'bell', mapa: 'map', szukaj: 'search', zdjęcie: 'image', obraz: 'image', film: 'film', słuchawki: 'headphones', głośnik: 'speaker',
        plik: 'file', dokument: 'file-text', chmura: 'cloud', sieć: 'network', wifi: 'wifi', samochód: 'car', kot: 'cat', pies: 'dog', rakieta: 'rocket', prezent: 'gift', koszyk: 'shopping-cart', pieniądze: 'wallet',
        statystyki: 'chart', wykres: 'chart', strzałka: 'arrow', plus: 'plus', minus: 'minus', edytuj: 'pencil', ołówek: 'pencil', kłódka_otwarta: 'lock-open', oko: 'eye', ukryj: 'eye-off', flaga: 'flag', puchar: 'trophy',
    };

    let data = null;
    let profileId = null;
    let folderId = null;
    let selected = null;
    let phase = 'press';
    let copied = null;
    let saveTimer = null;
    let pendingSave = null;
    let optionsCache = {};
    let pairingQueue = [];
    let qrUrl = null;
    let lucideData = null;
    let lookState = null;       // indeks stanu, którego wygląd edytujemy (null = wygląd podstawowy)
    let addAt = null;           // pole, do którego dodajemy widżet

    // ───── Pomocnicze ─────
    const profile = () => data.deck.profiles.find((p) => p.id === profileId) || data.deck.profiles[0];
    const folder = () => data.deck.folders[folderId];
    const rawButton = (key = selected) => (folder() && folder().buttons[key]) || null;
    const gridSize = () => ({ cols: (folder() && folder().cols) || profile().cols, rows: (folder() && folder().rows) || profile().rows });
    const imgBase = () => (data.server.port ? `http://127.0.0.1:${data.server.port}` : '');
    const plugin = (id) => data.plugins.find((p) => p.id === id);
    const actionDef = (item) => { const p = plugin(item.plugin); return p && p.actions.find((a) => a.id === item.action); };
    const fixImage = (b) => {
        if (!b) return b;
        const out = { ...b };
        if (out.icon && out.icon.type === 'image' && out.icon.value && out.icon.value.startsWith('/img/')) out.icon = { ...out.icon, value: imgBase() + out.icon.value };
        if (out.media && out.media.art && out.media.art.startsWith('/')) out.media = { ...out.media, art: imgBase() + out.media.art };
        return out;
    };
    const keyXY = (key) => key.split(',').map(Number);
    const keyLabel = (key, b) => { const [x, y] = keyXY(key); return `Kolumna ${x + 1}, wiersz ${y + 1}${b && (b.w > 1 || b.h > 1) ? ` · ${b.w || 1}×${b.h || 1} pola` : ''}`; };

    // Pola zajęte przez widżety (poza pominiętym)
    function occupancy(skipKey) {
        const occ = new Map();
        for (const [key, b] of Object.entries(folder().buttons || {})) {
            if (key === skipKey) continue;
            const [x, y] = keyXY(key);
            for (let dx = 0; dx < (b.w || 1); dx++) for (let dy = 0; dy < (b.h || 1); dy++) occ.set(`${x + dx},${y + dy}`, key);
        }
        return occ;
    }
    function canPlace(key, w, h, skipKey) {
        const [x, y] = keyXY(key);
        const { cols, rows } = gridSize();
        if (x + w > cols || y + h > rows) return false;
        const occ = occupancy(skipKey);
        for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) if (occ.has(`${x + dx},${y + dy}`)) return false;
        return true;
    }

    // Okno dialogowe z polem tekstowym (window.prompt nie działa w Electronie)
    function ask(title, value = '', placeholder = '') {
        return new Promise((resolve) => {
            const el = document.createElement('div');
            el.className = 'm-modal-overlay active';
            el.innerHTML = `<div class="m-modal"><div class="m-modal-header"><span class="m-modal-title">${esc(title)}</span></div>
                <div class="m-modal-body"><input class="m-input" value="${esc(value)}" placeholder="${esc(placeholder)}"></div>
                <div class="m-modal-footer"><button class="m-btn small" data-r="0">Anuluj</button><button class="m-btn small accent" data-r="1">OK</button></div></div>`;
            document.body.appendChild(el);
            const input = el.querySelector('input');
            const done = (ok) => { el.remove(); resolve(ok ? input.value.trim() : null); };
            el.querySelector('[data-r="1"]').onclick = () => done(true);
            el.querySelector('[data-r="0"]').onclick = () => done(false);
            input.onkeydown = (e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
            setTimeout(() => { input.focus(); input.select(); }, 30);
        });
    }

    // ───── Wczytanie ─────
    async function load() {
        if (!lucideData) lucideData = await deck.lucide();
        data = await deck.get();
        if (!data.deck.profiles.some((p) => p.id === profileId)) profileId = data.deck.profiles[0].id;
        if (!data.deck.folders[folderId] || !inProfile(folderId)) folderId = profile().root;
        if (selected && !rawButton()) selected = null;
        renderSide();
        await renderGrid();
        renderInspector();
        renderConnection();
    }
    function inProfile(fid) {
        let f = data.deck.folders[fid];
        while (f && f.parent) f = data.deck.folders[f.parent];
        return f && f.id === profile().root;
    }

    // ───── Lewy panel ─────
    function renderSide() {
        $('profileSelect').innerHTML = data.deck.profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
        $('profileSelect').value = profileId;
        const p = profile();
        $('colsInput').value = p.cols;
        $('rowsInput').value = p.rows;
        $('spacingInput').value = p.spacing ?? 10;
        $('spacingVal').textContent = `${p.spacing ?? 10}%`;
        $('radiusInput').value = p.radius ?? 22;
        $('radiusVal').textContent = `${p.radius ?? 22}%`;
        colorRow('deckBgColors', ['', '#121116', '#000000', '#17161c', '#1e1b2e', '#2a0f1f', '#0f1d2a'], p.background || '', async (c) => { await deck.updateProfile(profileId, { background: c }); p.background = c; });
        $('fColsInput').value = folder().cols || '';
        $('fRowsInput').value = folder().rows || '';
        $('fColsInput').placeholder = String(p.cols);
        $('fRowsInput').placeholder = String(p.rows);
        renderTree();
        renderDevices();
    }
    function renderTree() {
        const out = [];
        const walk = (fid, depth) => {
            const f = data.deck.folders[fid];
            if (!f) return;
            const n = Object.keys(f.buttons || {}).length;
            out.push(`<div class="tree-item${fid === folderId ? ' active' : ''}" data-folder="${esc(fid)}" style="padding-left:${10 + depth * 16}px">
                <span class="ti-icon">${depth ? '▸' : '⌂'}</span><span>${esc(f.name)}</span><span class="ti-count">${n}</span></div>`);
            Object.values(data.deck.folders).filter((x) => x.parent === fid).sort((a, b) => a.name.localeCompare(b.name, 'pl')).forEach((c) => walk(c.id, depth + 1));
        };
        walk(profile().root, 0);
        $('tree').innerHTML = out.join('');
    }
    $('tree').addEventListener('click', (e) => { const el = e.target.closest('[data-folder]'); if (el) openFolder(el.dataset.folder); });
    $('tree').addEventListener('dblclick', (e) => { const el = e.target.closest('[data-folder]'); if (el) renameFolder(el.dataset.folder); });
    async function openFolder(fid) {
        await flushSave();
        folderId = fid;
        selected = null;
        lookState = null;
        renderSide();
        await renderGrid();
        renderInspector();
    }
    $('profileSelect').addEventListener('change', async () => {
        await flushSave();
        profileId = $('profileSelect').value;
        folderId = profile().root;
        selected = null;
        await load();
    });
    const resizeProfile = async () => { await deck.updateProfile(profileId, { cols: $('colsInput').value, rows: $('rowsInput').value }); await load(); };
    $('colsInput').addEventListener('change', resizeProfile);
    $('rowsInput').addEventListener('change', resizeProfile);
    let styleTimer = null;
    const profileStyle = () => {
        $('spacingVal').textContent = `${$('spacingInput').value}%`;
        $('radiusVal').textContent = `${$('radiusInput').value}%`;
        clearTimeout(styleTimer);
        styleTimer = setTimeout(async () => {
            await deck.updateProfile(profileId, { spacing: $('spacingInput').value, radius: $('radiusInput').value });
            Object.assign(profile(), { spacing: +$('spacingInput').value, radius: +$('radiusInput').value });
            renderGrid();
        }, 120);
    };
    $('spacingInput').addEventListener('input', profileStyle);
    $('radiusInput').addEventListener('input', profileStyle);
    const resizeFolder = async () => { await deck.folderGrid(folderId, $('fColsInput').value, $('fRowsInput').value); await load(); };
    $('fColsInput').addEventListener('change', resizeFolder);
    $('fRowsInput').addEventListener('change', resizeFolder);

    $('btnProfileAdd').onclick = async () => {
        const name = await ask('Nowy profil', '', 'np. Gry, Stream, Praca');
        if (!name) return;
        const p = await deck.addProfile(name);
        profileId = p.id; folderId = p.root; selected = null;
        await load();
    };
    $('btnProfileRename').onclick = async () => {
        const name = await ask('Nazwa profilu', profile().name);
        if (name) { await deck.updateProfile(profileId, { name }); await load(); }
    };
    $('btnProfileDelete').onclick = async () => {
        if (data.deck.profiles.length <= 1) return toast('To jedyny profil — nie można go usunąć.', 'error');
        if (!confirm(`Usunąć profil „${profile().name}” razem z jego folderami i przyciskami?`)) return;
        await deck.deleteProfile(profileId);
        profileId = null;
        await load();
    };
    $('btnFolderAdd').onclick = async () => {
        const name = await ask('Nowy folder', '', 'np. Sceny OBS');
        if (!name) return;
        const f = await deck.addFolder(folderId, name);
        await load();
        openFolder(f.id);
    };
    async function renameFolder(fid) {
        const f = data.deck.folders[fid];
        const name = await ask('Nazwa folderu', f.name);
        if (name) { await deck.renameFolder(fid, name); await load(); }
    }
    $('btnFolderRename').onclick = () => renameFolder(folderId);
    $('btnFolderDelete').onclick = async () => {
        const f = folder();
        if (!f.parent) return toast('Folderu startowego profilu nie można usunąć.', 'error');
        if (!confirm(`Usunąć folder „${f.name}” i wszystko, co jest w środku?`)) return;
        folderId = f.parent;
        await deck.deleteFolder(f.id);
        await load();
    };

    // ───── Urządzenia ─────
    function renderDevices() {
        const list = data.devices || [];
        if (!list.length) {
            $('devices').innerHTML = '<div class="dev-empty">Brak urządzeń. Kliknij „Połącz telefon” u góry.</div>';
            return;
        }
        const profiles = data.deck.profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
        $('devices').innerHTML = list.map((d) => {
            const pending = !d.approved && !d.denied;
            return `<div class="dev" data-dev="${esc(d.id)}">
                <div class="dev-top"><span class="m-status-dot${d.online ? ' active' : ''}"></span>
                  <span class="dev-name" title="Kliknij dwa razy, żeby zmienić nazwę">${esc(d.name)}</span>
                  <button class="tool" data-act="remove" title="Usuń urządzenie">✕</button></div>
                ${pending ? `<div class="row-btns"><button class="m-btn small accent" data-act="ok">Zezwól</button><button class="m-btn small" data-act="deny">Odrzuć</button></div>`
                    : d.denied ? `<div class="row-btns"><span class="m-small">Zablokowane</span><button class="m-btn small" data-act="ok">Odblokuj</button></div>`
                    : `<select class="m-select" data-act="profile">${profiles}</select>`}
            </div>`;
        }).join('');
        for (const d of list) {
            const sel = $('devices').querySelector(`[data-dev="${CSS.escape(d.id)}"] select`);
            if (sel) sel.value = d.profile;
        }
    }
    $('devices').addEventListener('click', async (e) => {
        const box = e.target.closest('[data-dev]');
        const act = e.target.dataset.act;
        if (!box || !act || act === 'profile') return;
        const id = box.dataset.dev;
        if (act === 'ok') await deck.approve(id, true);
        if (act === 'deny') await deck.approve(id, false);
        if (act === 'remove' && confirm('Usunąć to urządzenie? Przy następnym połączeniu trzeba je będzie zatwierdzić ponownie.')) data.devices = await deck.removeDevice(id);
    });
    $('devices').addEventListener('change', async (e) => {
        if (e.target.dataset.act !== 'profile') return;
        data.devices = await deck.updateDevice(e.target.closest('[data-dev]').dataset.dev, { profile: e.target.value });
    });
    $('devices').addEventListener('dblclick', async (e) => {
        if (!e.target.classList.contains('dev-name')) return;
        const id = e.target.closest('[data-dev]').dataset.dev;
        const name = await ask('Nazwa urządzenia', e.target.textContent);
        if (name) { data.devices = await deck.updateDevice(id, { name }); renderDevices(); }
    });

    // ───── Siatka ─────
    let cellPx = 100;
    async function renderGrid() {
        const state = await deck.preview(folderId);
        const { cols, rows } = state.profile;
        const sp = (state.style.spacing ?? 10) / 100;
        const stage = $('stage').getBoundingClientRect();
        const cell = Math.floor(Math.max(44, Math.min(150, Math.min((stage.width - 48) / (cols + (cols - 1) * sp), (stage.height - 48) / (rows + (rows - 1) * sp)))));
        cellPx = cell;
        const grid = $('grid');
        grid.style.setProperty('--cell', `${cell}px`);
        grid.style.setProperty('--gap', `${Math.round(cell * sp)}px`);
        grid.style.setProperty('--pd-radius', `${Math.round((cell * (state.style.radius ?? 22)) / 100)}px`);
        grid.style.gridTemplateColumns = `repeat(${cols}, ${cell}px)`;
        grid.style.gridTemplateRows = `repeat(${rows}, ${cell}px)`;
        $('stage').style.background = state.style.background || '';
        grid.innerHTML = '';
        const covered = new Set();
        const items = [];
        for (const [key, b] of Object.entries(state.buttons)) {
            const [x, y] = keyXY(key);
            if (x >= cols || y >= rows) continue;
            const w = Math.min(b.w || 1, cols - x), h = Math.min(b.h || 1, rows - y);
            for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) covered.add(`${x + dx},${y + dy}`);
            items.push({ key, x, y, w, h, b });
        }
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!covered.has(`${x},${y}`)) items.push({ key: `${x},${y}`, x, y, w: 1, h: 1, b: null });
        for (const it of items) {
            const el = document.createElement('div');
            el.style.gridColumn = `${it.x + 1} / span ${it.w}`;
            el.style.gridRow = `${it.y + 1} / span ${it.h}`;
            R.paint(el, fixImage(it.b), cell);
            if (it.b && it.b.type === 'media' && it.w < 2) el.classList.add('narrow');
            el.dataset.key = it.key;
            el.draggable = Boolean(it.b);
            if (it.key === selected) el.classList.add('selected');
            grid.appendChild(el);
        }
        // Okruszki: profil › folder › podfolder
        const path = [];
        let f = folder();
        while (f) { path.unshift(f); f = f.parent ? data.deck.folders[f.parent] : null; }
        $('crumbs').innerHTML = `<span>${esc(profile().name)}</span>` + path.map((p) => `<span>›</span><button data-folder="${esc(p.id)}" class="${p.id === folderId ? 'cur' : ''}">${esc(p.name)}</button>`).join('') +
            `<span class="m-small" style="margin-left:auto">${cols}×${rows}</span>`;
    }
    $('crumbs').addEventListener('click', (e) => { const b = e.target.closest('[data-folder]'); if (b) openFolder(b.dataset.folder); });
    addEventListener('resize', () => { clearTimeout(window.__rz); window.__rz = setTimeout(renderGrid, 120); });
    setInterval(() => R.tickClocks($('grid')), 1000);

    $('grid').addEventListener('click', async (e) => {
        const el = e.target.closest('[data-key]');
        if (!el) return;
        await flushSave();
        if (!rawButton(el.dataset.key)) return openAddMenu(el.dataset.key, e.clientX, e.clientY);
        selected = el.dataset.key;
        lookState = null;
        await renderGrid();
        renderInspector();
    });

    // Menu „dodaj widżet” na pustym polu
    function openAddMenu(key, x, y) {
        addAt = key;
        const menu = $('addMenu');
        menu.hidden = false;
        menu.style.left = `${Math.min(x, innerWidth - 300)}px`;
        menu.style.top = `${Math.min(y, innerHeight - 330)}px`;
    }
    $('addMenu').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-add]');
        if (!b) return;
        e.stopPropagation();
        $('addMenu').hidden = true;
        await addWidget(addAt, b.dataset.add);
    });
    function fitSize(key, w, h) {
        for (const [ww, hh] of [[w, h], [w, 1], [1, h], [1, 1]]) if (canPlace(key, ww, hh, key)) return [ww, hh];
        return [1, 1];
    }
    async function addWidget(key, type) {
        const base = { bg: '#23222a', color: '', fontSize: 14, labelPos: 'bottom', textAlign: 'center', labelShadow: true, actions: { press: [] } };
        let w;
        if (type === 'button') w = { ...base, type: 'button', label: '', icon: { type: 'lucide', value: 'star' } };
        if (type === 'folder') {
            const name = await ask('Nowy folder', '', 'np. Sceny OBS');
            if (!name) return;
            const f = await deck.addFolder(folderId, name);
            w = { ...base, type: 'button', label: name, icon: { type: 'lucide', value: 'folder' }, bg: '#2f2e38', actions: { press: [{ plugin: 'deck', action: 'open-folder', config: { folder: f.id } }] } };
        }
        if (type === 'slider') { const [ww, hh] = fitSize(key, 1, 2); w = { ...base, type: 'slider', w: ww, h: hh, label: 'Głośność', slider: { preset: 'volume', orientation: hh > ww ? 'vertical' : 'horizontal', showValue: true, min: 0, max: 100, step: 1 }, actions: {} }; }
        if (type === 'media') { const [ww, hh] = fitSize(key, 2, 2); w = { ...base, type: 'media', w: ww, h: hh, media: { album: false, timeline: true }, actions: {} }; }
        if (type === 'gauge') { const [ww, hh] = fitSize(key, 2, 2); w = { ...base, type: 'gauge', w: ww, h: hh, gaugeStyle: 'ring', gauges: [{ var: 'system.cpu', name: 'CPU', max: 100, unit: '%' }, { var: 'system.gpu', name: 'GPU', max: 100, unit: '%' }, { var: 'system.ram', name: 'RAM', max: 100, unit: '%' }] }; }
        if (type === 'clock') { const [ww, hh] = fitSize(key, 2, 1); w = { ...base, type: 'clock', w: ww, h: hh, clock: { seconds: false, date: true } }; }
        if (!w) return;
        selected = key;
        lookState = null;
        await saveNow(w);
        await load();
    }
    addEventListener('click', (e) => {
        if (!e.target.closest('#addMenu') && !e.target.closest('#grid')) $('addMenu').hidden = true;
        if (!e.target.closest('#ctxMenu')) $('ctxMenu').hidden = true;
    });
    addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { $('addMenu').hidden = true; $('ctxMenu').hidden = true; }
        // Delete usuwa zaznaczony widżet (gdy nie piszemy w polu)
        if ((e.key === 'Delete') && selected && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) $('btnDelete').click();
    });

    // Przeciąganie: przenoszenie widżetów oraz upuszczanie obrazów z dysku
    let dragFrom = null;
    $('grid').addEventListener('dragstart', (e) => { dragFrom = e.target.closest('[data-key]')?.dataset.key; e.dataTransfer.effectAllowed = 'move'; });
    $('grid').addEventListener('dragover', (e) => { const el = e.target.closest('[data-key]'); if (!el) return; e.preventDefault(); el.classList.add('drop'); });
    $('grid').addEventListener('dragleave', (e) => { const el = e.target.closest('[data-key]'); if (el) el.classList.remove('drop'); });
    $('grid').addEventListener('drop', async (e) => {
        e.preventDefault();
        const el = e.target.closest('[data-key]');
        if (!el) return;
        el.classList.remove('drop');
        const to = el.dataset.key;
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file && /^image\//.test(file.type)) {
            const url = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
            try {
                const name = await deck.saveImageData(url);
                selected = to;
                const b = rawButton() || { type: 'button', label: '', bg: '#23222a', fontSize: 14, labelPos: 'bottom', actions: { press: [] } };
                await saveNow({ ...b, icon: { type: 'image', value: name, fit: 'contain' } });
                await load();
            } catch (err) { toast(err.message, 'error'); }
            return;
        }
        if (dragFrom && dragFrom !== to) {
            await flushSave();
            const src = rawButton(dragFrom);
            const target = rawButton(to);
            // Duży widżet przenosimy tylko na wolne miejsce; zwykłe przyciski można zamieniać miejscami
            const big = (src.w || 1) > 1 || (src.h || 1) > 1 || (target && ((target.w || 1) > 1 || (target.h || 1) > 1));
            if (big && (target || !canPlace(to, src.w || 1, src.h || 1, dragFrom))) { toast('Tu się nie zmieści — przeciągnij na wolne miejsce.', 'error'); return; }
            await deck.moveButton(folderId, dragFrom, to);
            selected = to;
            await load();
        }
        dragFrom = null;
    });

    // Menu kontekstowe
    let ctxKey = null;
    $('grid').addEventListener('contextmenu', (e) => {
        const el = e.target.closest('[data-key]');
        if (!el) return;
        e.preventDefault();
        ctxKey = el.dataset.key;
        const menu = $('ctxMenu');
        const has = Boolean(rawButton(ctxKey));
        menu.querySelector('[data-cmd="copy"]').disabled = !has;
        menu.querySelector('[data-cmd="duplicate"]').disabled = !has;
        menu.querySelector('[data-cmd="delete"]').disabled = !has;
        menu.querySelector('[data-cmd="paste"]').disabled = !copied;
        menu.hidden = false;
        menu.style.left = `${Math.min(e.clientX, innerWidth - 250)}px`;
        menu.style.top = `${Math.min(e.clientY, innerHeight - 200)}px`;
    });
    $('ctxMenu').addEventListener('click', async (e) => {
        const cmd = e.target.dataset.cmd;
        if (!cmd) return;
        $('ctxMenu').hidden = true;
        await flushSave();
        const b = rawButton(ctxKey);
        if (cmd === 'copy') { copied = clone(b); toast('Skopiowano'); return; }
        if (cmd === 'paste' && copied) {
            if (!canPlace(ctxKey, copied.w || 1, copied.h || 1, ctxKey)) return toast('Tu się nie zmieści.', 'error');
            await deck.setButton(folderId, ctxKey, clone(copied));
            selected = ctxKey;
        }
        if (cmd === 'delete') { await deck.setButton(folderId, ctxKey, null); if (selected === ctxKey) selected = null; }
        if (cmd === 'duplicate') return duplicate(ctxKey);
        await load();
    });
    async function duplicate(key) {
        const src = rawButton(key);
        const { cols, rows } = gridSize();
        for (let i = 0; i < cols * rows; i++) {
            const k = `${i % cols},${Math.floor(i / cols)}`;
            if (canPlace(k, src.w || 1, src.h || 1, null)) {
                await deck.setButton(folderId, k, clone(src));
                selected = k;
                return load();
            }
        }
        toast('Brak wolnego miejsca w tym folderze.', 'error');
    }

    // ───── Zapis ─────
    function update(mutator, { rerender = false } = {}) {
        const b = clone(rawButton() || {});
        mutator(b);
        folder().buttons[selected] = b;
        pendingSave = { folderId, key: selected, button: b };
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flushSave, 250);
        refreshPreviews();
        if (rerender) renderInspector();
    }
    async function flushSave() {
        clearTimeout(saveTimer);
        if (!pendingSave) return;
        const p = pendingSave;
        pendingSave = null;
        await deck.setButton(p.folderId, p.key, p.button);
    }
    async function saveNow(button) {
        folder().buttons[selected] = button;
        await deck.setButton(folderId, selected, button);
    }
    // Wygląd: pole podstawowe albo pole edytowanego stanu
    function getLook(field) {
        const b = rawButton();
        if (lookState !== null && b.states && b.states[lookState]) {
            const v = (b.states[lookState].look || {})[field];
            if (v !== undefined && v !== '') return v;
        }
        return b[field];
    }
    function setLook(field, value, opts) {
        update((x) => {
            if (lookState !== null && x.states && x.states[lookState]) {
                x.states[lookState].look = { ...(x.states[lookState].look || {}), [field]: value };
            } else x[field] = value;
        }, opts);
    }
    function previewButton() {
        const b = rawButton();
        if (lookState === null || !b.states || !b.states[lookState]) return b;
        const look = b.states[lookState].look || {};
        const merged = { ...b, states: undefined, stateSource: undefined, stateRules: undefined, stateVar: undefined };
        for (const [k, v] of Object.entries(look)) if (v !== '' && v !== undefined) merged[k] = v;
        return merged;
    }
    let previewTimer = null;
    function refreshPreviews() {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(async () => {
            const b = rawButton();
            if (!b) return;
            const rendered = fixImage(await deck.render(previewButton(), lookState === null ? folderId : undefined, selected));
            const el = $('grid').querySelector(`[data-key="${selected}"]`);
            if (el) {
                const col = el.style.gridColumn, row = el.style.gridRow;
                R.paint(el, rendered, cellPx);
                el.style.gridColumn = col; el.style.gridRow = row;
                el.classList.add('selected');
                el.dataset.key = selected;
            }
            paintInspPreview(rendered);
        }, 60);
    }
    function paintInspPreview(rendered) {
        const box = $('inspPreview');
        box.innerHTML = '<div></div>';
        const w = Math.max(1, rendered ? rendered.w : 1), h = Math.max(1, rendered ? rendered.h : 1);
        const scale = 64 / Math.max(w, h);
        box.firstChild.style.width = `${Math.round(w * scale)}px`;
        box.firstChild.style.height = `${Math.round(h * scale)}px`;
        box.firstChild.style.setProperty('--pd-radius', '14px');
        R.paint(box.firstChild, rendered, scale);
        const type = (rendered && rendered.type) || 'button';
        $('inspTitle').textContent = rendered && rendered.label ? rendered.label.split('\n')[0] : TYPES[type];
    }

    // ───── Inspektor ─────
    function renderInspector() {
        const b = rawButton();
        $('inspEmpty').hidden = Boolean(b);
        $('insp').hidden = !b;
        if (!b) return;
        const type = b.type || 'button';
        $('inspPos').textContent = keyLabel(selected, b);
        $('typeChip').textContent = TYPES[type];
        refreshPreviews();
        $('tabWidget').hidden = type === 'button';
        $('tabState').hidden = type !== 'button';
        if (($('tabWidget').hidden && activeTab() === 'widget') || ($('tabState').hidden && activeTab() === 'state')) switchTab('look');

        // Wygląd
        $('fW').value = b.w || 1;
        $('fH').value = b.h || 1;
        const showLabel = type === 'button' || type === 'slider';
        $('labelField').hidden = !showLabel;
        $('labelStyle').hidden = type !== 'button';
        $('iconField').hidden = type !== 'button';
        $('fLabel').value = getLook('label') || '';
        $('fLabelPos').value = getLook('labelPos') || 'bottom';
        document.querySelectorAll('#fAlign button').forEach((x) => x.classList.toggle('active', x.dataset.v === (getLook('textAlign') || 'center')));
        $('fFont').value = getLook('fontSize') || 14;
        $('fFontVal').textContent = `${getLook('fontSize') || 14}px`;
        $('fShadow').checked = getLook('labelShadow') !== false;
        $('fOutline').checked = Boolean(getLook('labelOutline'));
        const icon = getLook('icon') || { type: 'none' };
        const iconType = icon.type === 'glyph' ? 'lucide' : icon.type;
        document.querySelectorAll('#iconType button').forEach((x) => x.classList.toggle('active', x.dataset.v === iconType));
        document.querySelectorAll('.icon-pane').forEach((p) => p.classList.toggle('show', p.dataset.icon === iconType));
        if (iconType === 'lucide') renderLucide();
        $('fEmoji').value = icon.type === 'emoji' ? icon.value : '';
        document.querySelectorAll('#fFit button').forEach((x) => x.classList.toggle('active', x.dataset.v === (icon.fit || (icon.fill ? 'cover' : 'contain'))));
        $('fZoom').value = icon.zoom || 100; $('fZoomVal').textContent = `${icon.zoom || 100}%`;
        $('fOpacity').value = icon.opacity ?? 100; $('fOpacityVal').textContent = `${icon.opacity ?? 100}%`;
        colorRow('iconColors', ICON_COLORS, icon.color || '', (c) => setLook('icon', { ...(getLook('icon') || {}), color: c }), true);
        colorRow('bgColors', PALETTE, getLook('bg') || '#23222a', (c) => setLook('bg', c));
        colorRow('fgColors', TEXT_COLORS, getLook('color') || '', (c) => setLook('color', c));
        const border = getLook('border');
        $('fBorder').checked = Boolean(border && border.width);
        colorRow('borderColors', ['#ff4fa6', '#ffffff', '#ffd166', '#4cc38a', '#4ea8ff', '#ef4444'], (border && border.color) || '#ff4fa6', (c) => setLook('border', { width: 2, color: c }), true);
        // Baner „edytujesz stan”
        let banner = document.querySelector('.state-banner');
        if (lookState !== null && b.states && b.states[lookState]) {
            if (!banner) { banner = document.createElement('div'); banner.className = 'state-banner'; document.querySelector('[data-pane="look"]').prepend(banner); }
            banner.innerHTML = `Edytujesz wygląd stanu <b>${esc(b.states[lookState].name)}</b> — puste pola biorą wygląd podstawowy. <button class="m-btn small">Zakończ</button>`;
            banner.querySelector('button').onclick = () => { lookState = null; renderInspector(); };
        } else if (banner) banner.remove();

        renderWidgetPane(b);
        renderPhases(b);
        renderActions();
        const total = Object.values(b.actions || {}).reduce((a, l) => a + countBlocks(l), 0);
        $('actionsCount').textContent = total ? `(${total})` : '';
        renderStatePane(b);
    }
    const activeTab = () => document.querySelector('#inspTabs .m-tab.active').dataset.tab;
    function switchTab(tab) {
        document.querySelectorAll('#inspTabs .m-tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === tab));
        document.querySelectorAll('.insp-body').forEach((p) => { p.hidden = p.dataset.pane !== tab; });
    }
    document.querySelectorAll('#inspTabs .m-tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

    function colorRow(id, colors, current, onPick, small) {
        const box = $(id);
        box.classList.toggle('small', Boolean(small));
        box.innerHTML = colors.map((c) => `<button data-c="${c}" title="${c === 'transparent' ? 'Przezroczyste' : c || 'Automatyczny / bez zmian'}" class="${c === current ? 'active' : ''}${c ? '' : ' auto'}${c === 'transparent' ? ' none' : ''}" style="background:${c && c !== 'transparent' ? c : 'transparent'}"></button>`).join('') +
            `<input type="color" value="${/^#[\da-f]{6}$/i.test(current) ? current : '#ff4fa6'}" title="Własny kolor">`;
        box.onclick = (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            onPick(b.dataset.c);
            box.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
        };
        box.querySelector('input').oninput = (e) => { onPick(e.target.value); box.querySelectorAll('button').forEach((x) => x.classList.remove('active')); };
    }

    // Pola wyglądu
    $('fW').onchange = $('fH').onchange = () => {
        const w = Math.max(1, parseInt($('fW').value, 10) || 1), h = Math.max(1, parseInt($('fH').value, 10) || 1);
        if (!canPlace(selected, w, h, selected)) { toast('Ten rozmiar nachodzi na inne przyciski albo wychodzi poza siatkę.', 'error'); $('fW').value = rawButton().w || 1; $('fH').value = rawButton().h || 1; return; }
        update((x) => { x.w = w; x.h = h; if (x.type === 'slider' && x.slider) x.slider.orientation = h > w ? 'vertical' : 'horizontal'; });
        flushSave().then(load);
    };
    $('fLabel').oninput = () => setLook('label', $('fLabel').value);
    $('fLabelPos').onchange = () => setLook('labelPos', $('fLabelPos').value);
    $('fAlign').onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) { setLook('textAlign', b.dataset.v); document.querySelectorAll('#fAlign button').forEach((x) => x.classList.toggle('active', x === b)); } };
    $('fFont').oninput = () => { $('fFontVal').textContent = `${$('fFont').value}px`; setLook('fontSize', parseInt($('fFont').value, 10)); };
    $('fShadow').onchange = () => setLook('labelShadow', $('fShadow').checked);
    $('fOutline').onchange = () => setLook('labelOutline', $('fOutline').checked);
    $('fBorder').onchange = () => setLook('border', $('fBorder').checked ? { width: 2, color: '#ff4fa6' } : null);

    // Ikony Lucide z wyszukiwarką
    async function renderLucide() {
        if (!lucideData) {
            $('lucideGrid').innerHTML = '<div class="m-small">Wczytywanie ikon…</div>';
            lucideData = await deck.lucide();
        }
        const q = $('iconSearch').value.trim().toLowerCase();
        const current = (getLook('icon') || {}).value;
        let names = Object.keys(lucideData.icons);
        if (q) {
            const words = q.split(/\s+/);
            const terms = words.flatMap((w) => [w, ...Object.entries(PL).filter(([pl]) => pl.startsWith(w) || w.startsWith(pl)).map(([, en]) => en)]);
            names = names.filter((n) => {
                const hay = `${n} ${(lucideData.tags[n] || []).join(' ')}`;
                return terms.some((t) => hay.includes(t));
            }).sort((a, b) => (a.startsWith(terms[1] || terms[0]) ? -1 : 0) - (b.startsWith(terms[1] || terms[0]) ? -1 : 0));
        } else {
            const popular = ['play', 'pause', 'skip-forward', 'skip-back', 'volume-2', 'volume-x', 'mic', 'mic-off', 'music', 'headphones', 'video', 'camera', 'circle-dot', 'radio', 'monitor', 'gamepad-2', 'folder', 'house', 'arrow-left', 'settings', 'terminal', 'keyboard', 'globe', 'lightbulb', 'power', 'lock', 'cpu', 'message-circle', 'star', 'heart', 'zap', 'timer', 'shuffle', 'repeat', 'server', 'key-round', 'cloud-sun', 'battery-full', 'smartphone', 'rocket'];
            names = [...popular.filter((n) => lucideData.icons[n]), ...names.filter((n) => !popular.includes(n))];
        }
        $('iconCount').textContent = q ? `${names.length} pasujących` : `${Object.keys(lucideData.icons).length} ikon`;
        $('lucideGrid').innerHTML = names.slice(0, 160).map((n) => `<button data-l="${n}" title="${n}" class="${n === current ? 'active' : ''}">${R.lucide(lucideData.icons[n])}</button>`).join('') || '<div class="m-small">Nic nie znaleziono — spróbuj po angielsku.</div>';
    }
    let searchTimer = null;
    $('iconSearch').oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderLucide, 120); };
    $('lucideGrid').onclick = (e) => {
        const b = e.target.closest('[data-l]');
        if (!b) return;
        setLook('icon', { type: 'lucide', value: b.dataset.l, color: (getLook('icon') || {}).color || '' });
        $('lucideGrid').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    };
    $('emojis').innerHTML = EMOJIS.map((em) => `<button data-e="${em}">${em}</button>`).join('');
    $('emojis').onclick = (e) => { const b = e.target.closest('[data-e]'); if (b) setLook('icon', { type: 'emoji', value: b.dataset.e }, { rerender: true }); };
    $('fEmoji').oninput = () => setLook('icon', { type: 'emoji', value: $('fEmoji').value });
    $('iconType').onclick = (e) => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        const t = b.dataset.v;
        const cur = getLook('icon') || {};
        if (t === 'none') setLook('icon', { type: 'none' }, { rerender: true });
        if (t === 'lucide') setLook('icon', cur.type === 'lucide' ? cur : { type: 'lucide', value: 'star' }, { rerender: true });
        if (t === 'emoji') setLook('icon', cur.type === 'emoji' ? cur : { type: 'emoji', value: '🎮' }, { rerender: true });
        if (t === 'image') { if (cur.type === 'image') setLook('icon', cur, { rerender: true }); else pickImage(); }
    };
    async function pickImage() {
        try {
            const name = await deck.pickFile({ image: true });
            if (name) setLook('icon', { type: 'image', value: name, fit: 'contain' }, { rerender: true });
        } catch (err) { toast(err.message, 'error'); }
    }
    $('btnImage').onclick = pickImage;
    $('fFit').onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) setLook('icon', { ...(getLook('icon') || {}), fit: b.dataset.v, fill: undefined }, { rerender: true }); };
    $('fZoom').oninput = () => { $('fZoomVal').textContent = `${$('fZoom').value}%`; setLook('icon', { ...(getLook('icon') || {}), zoom: +$('fZoom').value }); };
    $('fOpacity').oninput = () => { $('fOpacityVal').textContent = `${$('fOpacity').value}%`; setLook('icon', { ...(getLook('icon') || {}), opacity: +$('fOpacity').value }); };

    // ───── Zakładka „Widżet” ─────
    function varButton(id, value, label = 'Wybierz zmienną…') {
        const v = (data.variables || []).find((x) => x.name === value);
        return `<button class="m-btn small block var-btn" data-var-pick="${id}">${value ? `{${esc(value)}}${v ? ` · ${esc(v.label)}` : ''}` : esc(label)}</button>`;
    }
    function renderWidgetPane(b) {
        const pane = $('widgetPane');
        const type = b.type || 'button';
        if (type === 'slider') {
            const s = b.slider || {};
            pane.innerHTML = `<div class="wp">
                <div class="m-field"><label class="m-label">Steruje</label><select class="m-select" id="wPreset">
                    <option value="volume">Głośność systemu</option><option value="mic">Głośność mikrofonu</option>
                    <option value="player">Głośność odtwarzacza (np. Spotify)</option><option value="custom">Własną zmienną i akcjami</option></select></div>
                ${s.preset === 'player' ? `<div class="m-field"><label class="m-label">Odtwarzacz (puste = ten, który gra)</label><input class="m-input" id="wPlayer" value="${esc(s.player || '')}" placeholder="spotify"></div>` : ''}
                ${s.preset === 'custom' ? `<div class="m-field"><span class="m-label">Pokazuje wartość zmiennej</span>${varButton('slider', s.var)}</div>
                    <div class="row2"><div class="m-field"><label class="m-label">Min</label><input class="m-input" type="number" id="wMin" value="${s.min ?? 0}"></div>
                    <div class="m-field"><label class="m-label">Max</label><input class="m-input" type="number" id="wMax" value="${s.max ?? 100}"></div></div>
                    <div class="m-small">Co ma się dziać przy przesuwaniu, ustawisz w zakładce Akcje → „Zmiana wartości” (wartość to <code>{value}</code>).</div>` : ''}
                <label class="check"><input type="checkbox" id="wShowValue" ${s.showValue !== false ? 'checked' : ''}> Pokazuj wartość</label>
                <div class="m-small">Kierunek zależy od kształtu: wyższy niż szerszy = pionowy. Zmień rozmiar w zakładce Wygląd.</div>
                <button class="m-btn small" id="wTest">Ustaw testowo na 50</button>
            </div>`;
            $('wPreset').value = s.preset || 'volume';
            $('wPreset').onchange = () => update((x) => { x.slider = { ...(x.slider || {}), preset: $('wPreset').value }; if (!x.label || ['Głośność', 'Mikrofon', 'Spotify'].includes(x.label)) x.label = { volume: 'Głośność', mic: 'Mikrofon', player: 'Spotify', custom: x.label }[$('wPreset').value]; }, { rerender: true });
            if ($('wPlayer')) $('wPlayer').oninput = () => update((x) => { x.slider.player = $('wPlayer').value.trim(); });
            if ($('wMin')) $('wMin').onchange = () => update((x) => { x.slider.min = Number($('wMin').value); });
            if ($('wMax')) $('wMax').onchange = () => update((x) => { x.slider.max = Number($('wMax').value); });
            $('wShowValue').onchange = () => update((x) => { x.slider.showValue = $('wShowValue').checked; });
            $('wTest').onclick = async () => { await flushSave(); await deck.testSlider(folderId, selected, 50); toast('Wysłano 50'); };
        } else if (type === 'clock') {
            const c = b.clock || {};
            pane.innerHTML = `<div class="wp">
                <label class="check"><input type="checkbox" id="wSec" ${c.seconds ? 'checked' : ''}> Sekundy</label>
                <label class="check"><input type="checkbox" id="wDate" ${c.date !== false ? 'checked' : ''}> Data</label>
                <label class="check"><input type="checkbox" id="w12" ${c.h12 ? 'checked' : ''}> Zegar 12-godzinny (AM/PM)</label>
                <div class="m-small">Zegar liczy czas na telefonie — działa nawet przy chwilowej utracie połączenia.</div></div>`;
            const save = () => update((x) => { x.clock = { seconds: $('wSec').checked, date: $('wDate').checked, h12: $('w12').checked }; });
            ['wSec', 'wDate', 'w12'].forEach((id) => { $(id).onchange = save; });
        } else if (type === 'gauge') {
            const list = b.gauges || [];
            pane.innerHTML = `<div class="wp">
                <div class="seg small" id="wGStyle"><button data-v="ring">Pierścienie</button><button data-v="bar">Paski</button></div>
                ${list.map((g, i) => `<div class="wp-sub" data-g="${i}">
                    <div class="wp-sub-head">Wskaźnik ${i + 1}<button class="tool" data-gdel="${i}" title="Usuń">✕</button></div>
                    ${varButton(`gauge:${i}`, g.var)}
                    <div class="row2"><input class="m-input" data-gf="name" value="${esc(g.name)}" placeholder="Nazwa, np. CPU">
                      <div class="size-row"><input class="m-input" type="number" data-gf="max" value="${g.max ?? 100}" title="Maksimum"><input class="m-input" data-gf="unit" value="${esc(g.unit ?? '%')}" title="Jednostka" style="width:52px"></div></div>
                  </div>`).join('')}
                ${list.length < 4 ? '<button class="m-btn small" id="wGAdd">＋ Dodaj wskaźnik</button>' : ''}
                <div class="m-small">Przydatne zmienne: system.cpu, system.gpu, system.ram, system.cpuTemp, system.gpuTemp, system.battery.</div></div>`;
            document.querySelectorAll('#wGStyle button').forEach((x) => x.classList.toggle('active', x.dataset.v === (b.gaugeStyle || 'ring')));
            $('wGStyle').onclick = (e) => { const t = e.target.closest('[data-v]'); if (t) update((x) => { x.gaugeStyle = t.dataset.v; }, { rerender: true }); };
            pane.querySelectorAll('[data-gf]').forEach((inp) => inp.addEventListener('input', () => {
                const i = +inp.closest('[data-g]').dataset.g;
                update((x) => { x.gauges[i][inp.dataset.gf] = inp.dataset.gf === 'max' ? Number(inp.value) : inp.value; });
            }));
            pane.querySelectorAll('[data-gdel]').forEach((btn) => btn.onclick = () => update((x) => { x.gauges.splice(+btn.dataset.gdel, 1); }, { rerender: true }));
            if ($('wGAdd')) $('wGAdd').onclick = () => update((x) => { (x.gauges = x.gauges || []).push({ var: 'system.cpuTemp', name: 'Temp.', max: 100, unit: '°' }); }, { rerender: true });
        } else if (type === 'media') {
            const m = b.media || {};
            pane.innerHTML = `<div class="wp">
                <label class="check"><input type="checkbox" id="wAlbum" ${m.album ? 'checked' : ''}> Pokazuj album</label>
                <label class="check"><input type="checkbox" id="wTimeline" ${m.timeline !== false ? 'checked' : ''}> Pasek postępu utworu</label>
                <div class="m-small">Pokazuje odtwarzacz, który właśnie gra (Spotify, przeglądarka, VLC…). Stały odtwarzacz ustawisz w Ustawienia → Wtyczki → Muzyka i dźwięk.</div></div>`;
            const save = () => update((x) => { x.media = { album: $('wAlbum').checked, timeline: $('wTimeline').checked }; });
            $('wAlbum').onchange = save; $('wTimeline').onchange = save;
        } else pane.innerHTML = '';
        pane.querySelectorAll('[data-var-pick]').forEach((btn) => btn.onclick = () => pickVariable((name) => {
            const id = btn.dataset.varPick;
            if (id === 'slider') update((x) => { x.slider.var = name; }, { rerender: true });
            if (id.startsWith('gauge:')) update((x) => { x.gauges[+id.split(':')[1]].var = name; }, { rerender: true });
            if (id.startsWith('rule:')) update((x) => { x.stateRules[+id.split(':')[1]].var = name; }, { rerender: true });
            if (id === 'toggle') update((x) => { x.stateVar = name; }, { rerender: true });
        }));
    }

    // ───── Zakładka „Stan” ─────
    function renderStatePane(b) {
        const pane = $('statePane');
        if ((b.type || 'button') !== 'button') { pane.innerHTML = ''; return; }
        const mode = Array.isArray(b.states) && b.states.length ? 'multi' : b.stateVar ? 'toggle' : 'none';
        let html = `<div class="wp"><div class="seg small" id="sMode"><button data-v="none">Zwykły</button><button data-v="toggle">Wł./wył. ze zmiennej</button><button data-v="multi">Kilka stanów</button></div>`;
        if (mode === 'none') html += '<div class="m-small">Przycisk może zmieniać wygląd: np. czerwony, gdy trwa nagrywanie albo mikrofon jest wyciszony, albo przełączać się między kilkoma stanami jak Wł./Wył.</div>';
        if (mode === 'toggle') {
            const on = b.on || {};
            html += `<div class="m-field"><span class="m-label">Zmienna stanu</span>${varButton('toggle', b.stateVar)}</div>
                <div class="wp-sub"><div class="wp-sub-head">Gdy włączone</div>
                  <input class="m-input" id="sOnLabel" value="${esc(on.label || '')}" placeholder="Napis (puste = bez zmian)">
                  <div class="colors small" id="sOnBg"></div></div>`;
        }
        if (mode === 'multi') {
            const src = b.stateSource || 'cycle';
            html += `<div class="m-field"><span class="m-label">Co zmienia stan</span><div class="seg small" id="sSource">
                  <button data-v="cycle">Naciśnięcie</button><button data-v="variable">Zmienne</button><button data-v="manual">Akcja</button></div></div>
                <div class="m-small">${{ cycle: 'Każde naciśnięcie przechodzi do następnego stanu.', variable: 'Stan wybierają reguły poniżej (pierwsza pasująca), np. czerwony, gdy {obs.recording} jest włączone.', manual: 'Stan zmienia akcja „Ustaw stan przycisku” (Deck).' }[src]}</div>
                ${b.states.map((s, i) => {
                    const look = s.look || {};
                    return `<div class="state-row${store_active(b) === i ? ' active' : ''}" data-s="${i}">
                        <span class="state-swatch" style="background:${look.bg && look.bg !== 'transparent' ? look.bg : b.bg || '#23222a'}"></span>
                        <input class="m-input" data-sname="${i}" value="${esc(s.name)}">
                        <button class="m-btn small" data-slook="${i}">Edytuj wygląd</button>
                        <button class="tool" data-sdel="${i}" title="Usuń">✕</button></div>`;
                }).join('')}
                <button class="m-btn small" id="sAdd">＋ Dodaj stan</button>`;
            if (src === 'variable') {
                html += `<div class="wp-sub"><div class="wp-sub-head">Reguły</div>
                    ${(b.stateRules || []).map((r, i) => `<div class="rule" data-r="${i}">
                        <span>${varButton(`rule:${i}`, r.var, 'zmienna…')}</span>
                        <select class="m-select" data-rop="${i}">${['==', '!=', '>', '<', '>=', '<=', 'on', 'off', 'contains'].map((o) => `<option value="${o}" ${o === (r.op || '==') ? 'selected' : ''}>${{ on: 'wł.', off: 'wył.', contains: 'zawiera' }[o] || o}</option>`).join('')}</select>
                        <input class="m-input" data-rval="${i}" value="${esc(r.value ?? '')}" placeholder="wartość">
                        <button class="tool" data-rdel="${i}">✕</button>
                        <select class="m-select" data-rstate="${i}" style="grid-column: 1 / -1">${b.states.map((s) => `<option value="${esc(s.id)}" ${s.id === r.state ? 'selected' : ''}>→ ${esc(s.name)}</option>`).join('')}</select>
                      </div>`).join('')}
                    <button class="m-btn small" id="sRuleAdd">＋ Dodaj regułę</button></div>`;
            }
        }
        pane.innerHTML = html + '</div>';
        document.querySelectorAll('#sMode button').forEach((x) => x.classList.toggle('active', x.dataset.v === mode));
        $('sMode').onclick = (e) => {
            const t = e.target.closest('[data-v]');
            if (!t || t.dataset.v === mode) return;
            lookState = null;
            update((x) => {
                delete x.states; delete x.stateSource; delete x.stateRules;
                if (t.dataset.v !== 'toggle') { delete x.stateVar; delete x.on; }
                if (t.dataset.v === 'toggle') x.on = x.on || { bg: '#e6007e' };
                if (t.dataset.v === 'multi') {
                    x.states = [{ id: 'off', name: 'Wył.', look: {} }, { id: 'on', name: 'Wł.', look: { bg: '#e6007e' } }];
                    x.stateSource = 'cycle';
                }
            }, { rerender: true });
        };
        if (mode === 'toggle') {
            $('sOnLabel').oninput = () => update((x) => { x.on = { ...(x.on || {}), label: $('sOnLabel').value }; });
            colorRow('sOnBg', ['', ...PALETTE], (b.on || {}).bg || '', (c) => update((x) => { x.on = { ...(x.on || {}), bg: c }; }), true);
        }
        if (mode === 'multi') {
            document.querySelectorAll('#sSource button').forEach((x) => x.classList.toggle('active', x.dataset.v === (b.stateSource || 'cycle')));
            $('sSource').onclick = (e) => { const t = e.target.closest('[data-v]'); if (t) update((x) => { x.stateSource = t.dataset.v; if (t.dataset.v === 'variable' && !x.stateRules) x.stateRules = []; }, { rerender: true }); };
            pane.querySelectorAll('[data-sname]').forEach((inp) => inp.oninput = () => update((x) => { x.states[+inp.dataset.sname].name = inp.value; }));
            pane.querySelectorAll('[data-slook]').forEach((btn) => btn.onclick = () => { lookState = +btn.dataset.slook; switchTab('look'); renderInspector(); });
            pane.querySelectorAll('[data-sdel]').forEach((btn) => btn.onclick = () => {
                if (b.states.length <= 2) return toast('Zostaw co najmniej dwa stany albo wybierz „Zwykły”.', 'error');
                update((x) => { x.states.splice(+btn.dataset.sdel, 1); }, { rerender: true });
            });
            pane.querySelectorAll('.state-row').forEach((row) => row.querySelector('.state-swatch').onclick = async () => {
                await flushSave();
                await deck.setState(folderId, selected, b.states[+row.dataset.s].id);
                data.deck.widgetStates = { ...(data.deck.widgetStates || {}), [`${folderId}/${selected}`]: b.states[+row.dataset.s].id };
                renderInspector();
                renderGrid();
            });
            $('sAdd').onclick = () => update((x) => { x.states.push({ id: `s${Date.now().toString(36)}`, name: `Stan ${x.states.length + 1}`, look: {} }); }, { rerender: true });
            if ($('sRuleAdd')) $('sRuleAdd').onclick = () => update((x) => { (x.stateRules = x.stateRules || []).push({ state: x.states[1].id, var: '', op: 'on', value: '' }); }, { rerender: true });
            pane.querySelectorAll('[data-rop]').forEach((s) => s.onchange = () => update((x) => { x.stateRules[+s.dataset.rop].op = s.value; }));
            pane.querySelectorAll('[data-rval]').forEach((s) => s.oninput = () => update((x) => { x.stateRules[+s.dataset.rval].value = s.value; }));
            pane.querySelectorAll('[data-rstate]').forEach((s) => s.onchange = () => update((x) => { x.stateRules[+s.dataset.rstate].state = s.value; }));
            pane.querySelectorAll('[data-rdel]').forEach((s) => s.onclick = () => update((x) => { x.stateRules.splice(+s.dataset.rdel, 1); }, { rerender: true }));
        }
        pane.querySelectorAll('[data-var-pick]').forEach((btn) => btn.onclick = () => pickVariable((name) => {
            const id = btn.dataset.varPick;
            if (id.startsWith('rule:')) update((x) => { x.stateRules[+id.split(':')[1]].var = name; }, { rerender: true });
            if (id === 'toggle') update((x) => { x.stateVar = name; }, { rerender: true });
        }));
    }
    function store_active(b) {
        if (b.stateSource === 'variable') return -1;
        const id = (data.deck.widgetStates || {})[`${folderId}/${selected}`];
        return Math.max(0, b.states.findIndex((s) => s.id === id));
    }

    // ───── Bloki akcji (jak w Macro Deck 3) ─────
    // Ścieżka listy: ['press'] albo np. ['press', 2, 'branches', 0, 'blocks']; ścieżka bloku = ścieżka listy + indeks
    const LOGIC = {
        if: { name: 'Jeśli / w przeciwnym razie', icon: 'git-branch', color: '#a855f7', desc: 'Wykonaj bloki tylko, gdy warunek jest spełniony' },
        switch: { name: 'Przełącz', icon: 'split', color: '#8b5cf6', desc: 'Różne bloki dla różnych wartości zmiennej' },
        repeat: { name: 'Powtórz', icon: 'repeat', color: '#f59e0b', desc: 'Wykonaj bloki kilka razy' },
        while: { name: 'Dopóki', icon: 'refresh-cw', color: '#f97316', desc: 'Powtarzaj, dopóki warunek jest spełniony' },
        wait: { name: 'Czekaj', icon: 'hourglass', color: '#06b6d4', desc: 'Odczekaj chwilę przed następnym blokiem' },
        break: { name: 'Przerwij pętlę', icon: 'corner-down-right', color: '#ef4444', desc: 'Wyjdź z Powtórz / Dopóki' },
        stop: { name: 'Zatrzymaj', icon: 'octagon-x', color: '#dc2626', desc: 'Nie wykonuj już kolejnych bloków' },
    };
    const PLUGIN_LOOK = { deck: ['#e6007e', 'layout-grid'], system: ['#64748b', 'monitor'], media: ['#22c55e', 'volume-2'], sound: ['#f97316', 'speaker'], http: ['#0ea5e9', 'globe'] };
    const OPS = [['is', 'jest'], ['isNot', 'nie jest'], ['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤'], ['contains', 'zawiera'], ['startsWith', 'zaczyna się od'], ['isOn', 'jest włączone'], ['isOff', 'jest wyłączone'], ['isEmpty', 'jest puste'], ['isNotEmpty', 'nie jest puste'], ['isAvailable', 'istnieje'], ['isNotAvailable', 'nie istnieje']];
    const UNARY = new Set(['isOn', 'isOff', 'isEmpty', 'isNotEmpty', 'isAvailable', 'isNotAvailable']);
    let blockClip = null;       // wycięty / skopiowany blok
    let pickTarget = null;      // { list: ścieżka, index }
    const collapsed = new Set();
    const lucideSvg = (name) => (lucideData && lucideData.icons[name] ? R.lucide(lucideData.icons[name]) : '');

    function triggersFor(b) {
        const type = b.type || 'button';
        if (type === 'slider') return (b.slider || {}).preset === 'custom' ? ['change'] : [];
        if (type === 'media') return [];
        const list = ['press', 'longPress', 'doublePress', 'touchStart', 'release'];
        if (Array.isArray(b.states) && b.states.length || b.stateVar) list.push('stateChange');
        return list;
    }
    function countBlocks(list) {
        let n = 0;
        for (const x of list || []) {
            if (!x) continue;
            n++;
            for (const k of ['blocks', 'else', 'otherwise']) if (Array.isArray(x[k])) n += countBlocks(x[k]);
            for (const br of x.branches || []) n += countBlocks(br.blocks);
            for (const cs of x.cases || []) n += countBlocks(cs.blocks);
        }
        return n;
    }
    function resolve(root, path, create) {
        let cur = root;
        for (let i = 0; i < path.length; i++) {
            const k = path[i];
            if (cur[k] === undefined || cur[k] === null) { if (!create) return undefined; cur[k] = typeof path[i + 1] === 'number' || i === path.length - 1 ? [] : {}; }
            cur = cur[k];
        }
        return cur;
    }
    const P = (str) => JSON.parse(str);
    const S = (arr) => esc(JSON.stringify(arr));

    function renderPhases(b) {
        const list = triggersFor(b);
        const acts = b.actions || {};
        if (!list.includes(phase)) phase = list.find((t) => (acts[t] || []).length) || list[0] || 'press';
        // Jak w Macro Deck: widać wyzwalacze, które mają bloki, i ten, który edytujesz; resztę dodaje się z menu
        const shown = list.filter((t) => t === phase || (acts[t] || []).length || t === list[0]);
        const more = list.filter((t) => !shown.includes(t));
        $('phase').className = 'trigger-row';
        $('phase').innerHTML = shown.map((t) => `<button data-v="${t}" class="trig${t === phase ? ' active' : ''}">${esc(PHASES[t][0])}${(acts[t] || []).length ? `<span class="n">${countBlocks(acts[t])}</span>` : ''}</button>`).join('') +
            (more.length ? `<div class="trig-add"><button class="trig plus" data-trig-menu title="Dodaj wyzwalacz">＋ Wyzwalacz</button><div class="trig-menu" hidden>${more.map((t) => `<button data-v="${t}"><b>${esc(PHASES[t][0])}</b><small>${esc(PHASES[t][1])}</small></button>`).join('')}</div></div>` : '') +
            `<button class="trig wide-btn" data-wide title="Większy edytor">${lucideSvg(document.body.classList.contains('wide-actions') ? 'minimize-2' : 'maximize-2')}</button>`;
        $('phase').hidden = !list.length;
        $('btnAddAction').hidden = true;
        if (!list.length) $('phaseHint').textContent = (b.type === 'media') ? 'Odtwarzacz ma wbudowane przyciski: poprzedni, graj/pauza, następny.' : 'Ten suwak steruje głośnością bez dodatkowych bloków. Wybierz „Własną zmienną i akcjami” w zakładce Widżet, żeby dodać bloki.';
    }
    $('phase').onclick = (e) => {
        if (e.target.closest('[data-wide]')) { document.body.classList.toggle('wide-actions'); renderPhases(rawButton()); setTimeout(renderGrid, 220); return; }
        if (e.target.closest('[data-trig-menu]')) { const m = $('phase').querySelector('.trig-menu'); m.hidden = !m.hidden; return; }
        const b = e.target.closest('[data-v]');
        if (!b) return;
        phase = b.dataset.v;
        renderPhases(rawButton());
        renderActions();
    };
    function renderActions() {
        const b = rawButton() || {};
        if ($('phase').hidden) { $('actionsList').innerHTML = ''; return; }
        $('phaseHint').textContent = PHASES[phase][1];
        const list = (b.actions || {})[phase] || [];
        $('actionsList').className = 'blocks-root';
        $('actionsList').innerHTML = blockList(list, [phase], true) +
            (blockClip ? `<div class="clip-bar">${lucideSvg('clipboard')} W schowku: <b>${esc(blockTitle(blockClip))}</b><button class="m-btn small" data-paste-into='${S([phase])}'>Wklej na końcu</button><button class="tool" data-clip-clear title="Wyczyść schowek">✕</button></div>` : '');
        wireBlocks($('actionsList'));
    }
    function blockTitle(x) {
        const kind = x.kind || 'action';
        if (kind !== 'action') return LOGIC[kind] ? LOGIC[kind].name : kind;
        const a = actionDef(x);
        return a ? a.name : x.action;
    }
    function blockList(list, path, root) {
        const items = (list || []).map((x, i) => dropZone(path, i) + blockHtml(x, [...path, i])).join('');
        return `<div class="blist${root ? ' root' : ''}" data-list='${S(path)}'>${items}${dropZone(path, (list || []).length)}
            <button class="add-block" data-add-into='${S(path)}' data-index="${(list || []).length}">${lucideSvg('plus')} ${root && !(list || []).length ? 'Dodaj pierwszy blok' : 'Dodaj blok'}</button></div>`;
    }
    const dropZone = (path, i) => `<div class="drop-zone" data-drop='${S(path)}' data-index="${i}"></div>`;
    function lookOf(x) {
        const kind = x.kind || 'action';
        if (kind !== 'action') return [LOGIC[kind].color, LOGIC[kind].icon];
        const pl = plugin(x.plugin);
        return [(pl && pl.color) || (PLUGIN_LOOK[x.plugin] || [])[0] || '#64748b', (pl && pl.icon) || (PLUGIN_LOOK[x.plugin] || [])[1] || 'puzzle'];
    }
    function blockHtml(x, path) {
        const kind = x.kind || 'action';
        const [color, icon] = lookOf(x);
        const key = JSON.stringify(path);
        const isCollapsed = collapsed.has(key);
        const pl = kind === 'action' ? plugin(x.plugin) : null;
        const a = kind === 'action' ? actionDef(x) : null;
        const sub = kind === 'action' ? (pl ? pl.name : x.plugin) : 'Logika';
        let summary = '';
        if (kind === 'wait') summary = `${(Number(x.ms) || 0) >= 1000 ? `${(Number(x.ms) / 1000).toLocaleString('pl')} s` : `${Number(x.ms) || 0} ms`}`;
        if (kind === 'repeat') summary = `${x.times ?? 1}×`;
        let body = '';
        if (kind === 'action') {
            const fields = (a && a.fields) || [];
            body = `${!pl ? `<div class="act-err">Brak dodatku „${esc(x.plugin)}”. <button class="m-btn small" data-open-store="${esc(x.plugin)}">Zainstaluj ze sklepu</button></div>` : !a ? '<div class="act-err">Dodatek nie ma już tej akcji.</div>' : ''}
                ${a && a.description ? `<div class="m-small">${esc(a.description)}</div>` : ''}
                ${fields.map((f) => fieldHtml(f, (x.config || {})[f.key])).join('') || (a ? '<div class="m-small">Ta akcja nie ma ustawień.</div>' : '')}`;
        } else if (kind === 'wait') {
            body = `<div class="wait-row"><input class="m-input" type="number" min="0" step="100" data-bkey="ms" value="${esc(x.ms ?? 1000)}"><span>ms</span>
                ${[250, 500, 1000, 3000].map((v) => `<button class="chip" data-set-ms="${v}">${v >= 1000 ? v / 1000 + ' s' : v + ' ms'}</button>`).join('')}</div>`;
        } else if (kind === 'repeat') {
            body = `<div class="wait-row"><input class="m-input" type="number" min="0" max="1000" data-bkey="times" value="${esc(x.times ?? 3)}"><span>razy · numer powtórzenia: <code>{index}</code></span></div>
                <div class="branch"><div class="branch-head">Wykonuj</div>${blockList(x.blocks, [...path, 'blocks'])}</div>`;
        } else if (kind === 'while') {
            body = `${condHtml(x.cond, [...path, 'cond'])}<div class="branch"><div class="branch-head">Wykonuj</div>${blockList(x.blocks, [...path, 'blocks'])}</div>
                <div class="m-small">Najwyżej 1000 powtórzeń. Numer powtórzenia: <code>{index}</code></div>`;
        } else if (kind === 'if') {
            body = (x.branches || []).map((br, i) => `<div class="branch">
                    <div class="branch-head">${i === 0 ? 'Jeśli' : 'W przeciwnym razie, jeśli'}${i > 0 ? `<button class="tool" data-del-branch='${S([...path, 'branches', i])}' title="Usuń">✕</button>` : ''}</div>
                    ${condHtml(br.cond, [...path, 'branches', i, 'cond'])}
                    <div class="branch-head then">to</div>${blockList(br.blocks, [...path, 'branches', i, 'blocks'])}
                </div>`).join('') +
                (Array.isArray(x.else) ? `<div class="branch"><div class="branch-head">W przeciwnym razie<button class="tool" data-del-else='${S(path)}' title="Usuń">✕</button></div>${blockList(x.else, [...path, 'else'])}</div>` : '') +
                `<div class="branch-add"><button class="chip" data-add-branch='${S(path)}'>＋ W przeciwnym razie, jeśli</button>${Array.isArray(x.else) ? '' : `<button class="chip" data-add-else='${S(path)}'>＋ W przeciwnym razie</button>`}</div>`;
        } else if (kind === 'switch') {
            body = `<div class="m-field"><label class="m-label">Wartość do sprawdzenia</label><div class="field-row"><input class="m-input" data-bkey="subject" value="${esc(x.subject || '')}" placeholder="{spotify.repeat}"><button class="m-btn small icon-only" data-insert-var="subject" title="Wstaw zmienną">{ }</button></div></div>` +
                (x.cases || []).map((cs, i) => `<div class="branch"><div class="branch-head">Gdy równa się <input class="m-input mini-in" data-case-value='${S([...path, 'cases', i])}' value="${esc(cs.value ?? '')}" placeholder="wartość"><button class="tool" data-del-case='${S([...path, 'cases', i])}' title="Usuń">✕</button></div>${blockList(cs.blocks, [...path, 'cases', i, 'blocks'])}</div>`).join('') +
                (Array.isArray(x.otherwise) ? `<div class="branch"><div class="branch-head">W pozostałych przypadkach<button class="tool" data-del-otherwise='${S(path)}' title="Usuń">✕</button></div>${blockList(x.otherwise, [...path, 'otherwise'])}</div>` : '') +
                `<div class="branch-add"><button class="chip" data-add-case='${S(path)}'>＋ Przypadek</button>${Array.isArray(x.otherwise) ? '' : `<button class="chip" data-add-otherwise='${S(path)}'>＋ W pozostałych przypadkach</button>`}</div>`;
        } else if (kind === 'break') body = '<div class="m-small">Kończy najbliższą pętlę Powtórz / Dopóki.</div>';
        else if (kind === 'stop') body = '<div class="m-small">Kolejne bloki tego wyzwalacza nie wykonają się.</div>';
        return `<div class="block${x.enabled === false ? ' off' : ''}${isCollapsed ? ' collapsed' : ''} k-${kind}" data-path='${S(path)}' style="--bc:${esc(color)}">
            <div class="block-head" draggable="true">
              <span class="b-grip" title="Przeciągnij">${lucideSvg('grip-vertical')}</span>
              <span class="b-ico">${lucideSvg(icon)}</span>
              <span class="b-title">${esc(blockTitle(x))}${summary ? ` <em>${esc(summary)}</em>` : ''}<small>${esc(sub)}${x.enabled === false ? ' · wyłączony' : ''}</small></span>
              <button class="tool" data-bop="menu" title="Więcej">${lucideSvg('ellipsis')}</button>
              <button class="tool" data-bop="collapse" title="${isCollapsed ? 'Rozwiń' : 'Zwiń'}">${lucideSvg(isCollapsed ? 'chevron-down' : 'chevron-up')}</button>
            </div>
            ${x.comment !== undefined ? `<div class="b-comment"><textarea class="m-input" data-bkey="comment" rows="1" placeholder="Komentarz…">${esc(x.comment)}</textarea></div>` : ''}
            <div class="block-body">${body}</div>
        </div>`;
    }
    function condHtml(cond, path) {
        const c = cond || { join: 'and', rules: [] };
        const rules = c.rules || [];
        return `<div class="cond" data-cond='${S(path)}'>
            ${rules.map((r, i) => `<div class="cond-rule" data-rule="${i}">
                ${i ? `<button class="join" data-join title="Zmień i / lub">${c.join === 'or' ? 'lub' : 'i'}</button>` : '<span class="join ghost"></span>'}
                <button class="m-btn small var-btn" data-rule-var="${i}">${r.left ? `{${esc(r.left)}}` : 'zmienna…'}</button>
                <select class="m-select" data-rule-op="${i}">${OPS.map(([v, l]) => `<option value="${v}" ${v === (r.op || 'is') ? 'selected' : ''}>${l}</option>`).join('')}</select>
                ${UNARY.has(r.op) ? '' : `<input class="m-input" data-rule-right="${i}" value="${esc(r.right ?? '')}" placeholder="wartość">`}
                <button class="tool" data-rule-del="${i}" title="Usuń warunek">✕</button>
            </div>`).join('') || '<div class="m-small">Brak warunku — zawsze spełniony.</div>'}
            <button class="chip" data-rule-add>＋ Warunek</button>
        </div>`;
    }

    // Zmiany w blokach
    function mutate(fn, rerender = true) {
        update((x) => { x.actions = x.actions || {}; x.actions[phase] = x.actions[phase] || []; fn(x.actions); }, { rerender });
    }
    function blockAt(actions, path) { return resolve(actions, path); }
    function listOf(actions, blockPath) { return resolve(actions, blockPath.slice(0, -1), true); }
    function newBlock(kind) {
        if (kind === 'if') return { kind, branches: [{ cond: { join: 'and', rules: [{ left: '', op: 'isOn', right: '' }] }, blocks: [] }] };
        if (kind === 'switch') return { kind, subject: '', cases: [{ value: '', blocks: [] }], otherwise: [] };
        if (kind === 'repeat') return { kind, times: 3, blocks: [] };
        if (kind === 'while') return { kind, cond: { join: 'and', rules: [{ left: '', op: 'isOn', right: '' }] }, blocks: [] };
        if (kind === 'wait') return { kind, ms: 1000 };
        return { kind };
    }
    // Zmiana ścieżek po wstawieniu/usunięciu — przy przenoszeniu najpierw wyjmujemy, potem wstawiamy
    function moveBlock(fromPath, toList, toIndex) {
        mutate((acts) => {
            const src = listOf(acts, fromPath);
            const i = fromPath[fromPath.length - 1];
            const [item] = src.splice(i, 1);
            // Jeśli lista docelowa leży za źródłem w tej samej liście, indeksy się przesunęły
            const sameList = JSON.stringify(fromPath.slice(0, -1)) === JSON.stringify(toList);
            let idx = toIndex;
            if (sameList && i < toIndex) idx--;
            // Gdy cel był wewnątrz przenoszonego bloku albo za nim w tej samej liście nadrzędnej, poprawiamy ścieżkę
            const fixed = toList.slice();
            const parent = fromPath.slice(0, -1);
            if (fixed.length > parent.length && JSON.stringify(fixed.slice(0, parent.length)) === JSON.stringify(parent) && typeof fixed[parent.length] === 'number' && fixed[parent.length] > i) fixed[parent.length]--;
            resolve(acts, fixed, true).splice(idx, 0, item);
        });
    }

    function blockMenu(btn, path) {
        document.querySelectorAll('.block-menu').forEach((m) => m.remove());
        const x = blockAt(rawButton().actions, path);
        const menu = document.createElement('div');
        menu.className = 'block-menu';
        menu.innerHTML = [
            ['toggle', x.enabled === false ? 'Włącz blok' : 'Wyłącz blok', x.enabled === false ? 'eye' : 'eye-off'],
            ['comment', x.comment !== undefined ? 'Usuń komentarz' : 'Dodaj komentarz', 'message-square'],
            ['duplicate', 'Duplikuj', 'copy'],
            ['copy', 'Kopiuj', 'clipboard-copy'],
            ['cut', 'Wytnij', 'scissors'],
            blockClip ? ['paste', 'Wklej pod spodem', 'clipboard-paste'] : null,
            ['up', 'W górę', 'arrow-up'],
            ['down', 'W dół', 'arrow-down'],
            ['run', 'Uruchom ten blok', 'play'],
            ['delete', 'Usuń', 'trash-2'],
        ].filter(Boolean).map(([op, label, icon]) => `<button data-mop="${op}" class="${op === 'delete' ? 'danger' : ''}">${lucideSvg(icon)}${label}</button>`).join('');
        document.body.appendChild(menu);
        const r = btn.getBoundingClientRect();
        menu.style.left = `${Math.min(r.right - 200, innerWidth - 210)}px`;
        menu.style.top = `${Math.min(r.bottom + 4, innerHeight - menu.offsetHeight - 8)}px`;
        menu.onclick = async (e) => {
            const op = e.target.closest('[data-mop]') && e.target.closest('[data-mop]').dataset.mop;
            if (!op) return;
            menu.remove();
            const i = path[path.length - 1];
            if (op === 'run') { await flushSave(); const res = await deck.testActions([clone(x)]); toast(res.ok ? 'Wykonano' : res.errors.join(' · '), res.ok ? 'success' : 'error'); return; }
            if (op === 'copy') { blockClip = clone(x); toast('Skopiowano blok'); return renderActions(); }
            mutate((acts) => {
                const list = listOf(acts, path);
                const b = list[i];
                if (op === 'toggle') b.enabled = b.enabled === false;
                if (op === 'comment') { if (b.comment !== undefined) delete b.comment; else b.comment = ''; }
                if (op === 'duplicate') list.splice(i + 1, 0, clone(b));
                if (op === 'cut') { blockClip = clone(b); list.splice(i, 1); }
                if (op === 'paste' && blockClip) list.splice(i + 1, 0, clone(blockClip));
                if (op === 'up' && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
                if (op === 'down' && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
                if (op === 'delete') list.splice(i, 1);
            });
        };
        setTimeout(() => addEventListener('click', function close(ev) { if (!menu.contains(ev.target)) { menu.remove(); removeEventListener('click', close, true); } }, true), 0);
    }

    let dragPath = null;
    function wireBlocks(root) {
        root.onclick = (e) => {
            const t = e.target;
            const blockEl = t.closest('.block');
            const path = blockEl ? P(blockEl.dataset.path) : null;
            const q = (sel) => t.closest(sel);
            if (q('[data-bop="menu"]')) return blockMenu(q('[data-bop="menu"]'), path);
            if (q('[data-bop="collapse"]') || (q('.b-title') && !q('input'))) {
                const k = JSON.stringify(path);
                if (collapsed.has(k)) collapsed.delete(k); else collapsed.add(k);
                return renderActions();
            }
            if (q('[data-add-into]')) { const b = q('[data-add-into]'); return openBlockPicker(P(b.dataset.addInto), Number(b.dataset.index)); }
            if (q('[data-paste-into]')) { const pth = P(q('[data-paste-into]').dataset.pasteInto); return mutate((acts) => { resolve(acts, pth, true).push(clone(blockClip)); }); }
            if (q('[data-clip-clear]')) { blockClip = null; return renderActions(); }
            if (q('[data-open-store]')) return openStore(q('[data-open-store]').dataset.openStore);
            if (q('[data-set-ms]')) return mutate((acts) => { blockAt(acts, path).ms = Number(q('[data-set-ms]').dataset.setMs); });
            if (q('[data-add-branch]')) return mutate((acts) => { blockAt(acts, path).branches.push({ cond: { join: 'and', rules: [{ left: '', op: 'isOn', right: '' }] }, blocks: [] }); });
            if (q('[data-add-else]')) return mutate((acts) => { blockAt(acts, path).else = []; });
            if (q('[data-del-else]')) return mutate((acts) => { delete blockAt(acts, path).else; });
            if (q('[data-del-branch]')) { const bp = P(q('[data-del-branch]').dataset.delBranch); return mutate((acts) => { resolve(acts, bp.slice(0, -1)).splice(bp[bp.length - 1], 1); }); }
            if (q('[data-add-case]')) return mutate((acts) => { blockAt(acts, path).cases.push({ value: '', blocks: [] }); });
            if (q('[data-add-otherwise]')) return mutate((acts) => { blockAt(acts, path).otherwise = []; });
            if (q('[data-del-otherwise]')) return mutate((acts) => { delete blockAt(acts, path).otherwise; });
            if (q('[data-del-case]')) { const cp = P(q('[data-del-case]').dataset.delCase); return mutate((acts) => { resolve(acts, cp.slice(0, -1)).splice(cp[cp.length - 1], 1); }); }
            if (q('[data-insert-var]')) { const k = q('[data-insert-var]').dataset.insertVar; return pickVariable((name) => mutate((acts) => { const b = blockAt(acts, path); b[k] = `${b[k] || ''}{${name}}`; })); }
            // Warunki
            const condEl = t.closest('[data-cond]');
            if (condEl) {
                const cp = P(condEl.dataset.cond);
                const getCond = (acts) => { const parent = resolve(acts, cp.slice(0, -1)); const k = cp[cp.length - 1]; parent[k] = parent[k] || { join: 'and', rules: [] }; return parent[k]; };
                if (q('[data-rule-add]')) return mutate((acts) => { getCond(acts).rules.push({ left: '', op: 'isOn', right: '' }); });
                if (q('[data-rule-del]')) return mutate((acts) => { getCond(acts).rules.splice(Number(q('[data-rule-del]').dataset.ruleDel), 1); });
                if (q('[data-join]')) return mutate((acts) => { const c = getCond(acts); c.join = c.join === 'or' ? 'and' : 'or'; });
                if (q('[data-rule-var]')) { const i = Number(q('[data-rule-var]').dataset.ruleVar); return pickVariable((name) => mutate((acts) => { getCond(acts).rules[i].left = name; })); }
            }
        };
        root.onchange = (e) => {
            const t = e.target;
            const condEl = t.closest('[data-cond]');
            if (condEl && t.dataset.ruleOp !== undefined) {
                const cp = P(condEl.dataset.cond);
                return mutate((acts) => { resolve(acts, cp).rules[Number(t.dataset.ruleOp)].op = t.value; });
            }
        };
        root.oninput = (e) => {
            const t = e.target;
            const blockEl = t.closest('.block');
            if (!blockEl) return;
            const path = P(blockEl.dataset.path);
            const condEl = t.closest('[data-cond]');
            if (condEl && t.dataset.ruleRight !== undefined) { const cp = P(condEl.dataset.cond); return mutate((acts) => { resolve(acts, cp).rules[Number(t.dataset.ruleRight)].right = t.value; }, false); }
            if (t.dataset.caseValue) { const cp = P(t.dataset.caseValue); return mutate((acts) => { resolve(acts, cp).value = t.value; }, false); }
            if (t.dataset.bkey) {
                const k = t.dataset.bkey;
                return mutate((acts) => { blockAt(acts, path)[k] = t.type === 'number' ? (t.value === '' ? '' : Number(t.value)) : t.value; }, false);
            }
        };
        // Pola akcji (te same co wcześniej: listy, pliki, skróty)
        root.querySelectorAll('.block.k-action').forEach((blockEl) => {
            const path = P(blockEl.dataset.path);
            const x = blockAt(rawButton().actions, path);
            const own = (el) => el.closest('.block') === blockEl;
            const setCfg = (key, value) => mutate((acts) => { const b = blockAt(acts, path); b.config = { ...(b.config || {}), [key]: value }; }, false);
            blockEl.querySelectorAll('.block-body [data-key]').forEach((input) => {
                if (!own(input)) return;
                const key = input.dataset.key, type = input.dataset.type;
                const read = () => (type === 'bool' ? input.checked : type === 'number' ? (input.value === '' ? '' : Number(input.value)) : input.value);
                input.addEventListener(type === 'bool' || input.tagName === 'SELECT' ? 'change' : 'input', (ev) => { ev.stopPropagation(); setCfg(key, read()); });
                if (input.dataset.dynamic) loadOptions(x, key, input);
            });
            blockEl.querySelectorAll('[data-refresh]').forEach((b) => own(b) && b.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const sel = b.parentElement.querySelector('select');
                delete optionsCache[`${x.plugin}/${x.action}/${sel.dataset.key}`];
                loadOptions(x, sel.dataset.key, sel);
            }));
            blockEl.querySelectorAll('[data-browse]').forEach((b) => own(b) && b.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                const input = b.parentElement.querySelector('input');
                const a = actionDef(x);
                const f = a && a.fields.find((y) => y.key === input.dataset.key);
                const file = await deck.pickFile({ filters: f && f.filters });
                if (file) { input.value = file; setCfg(input.dataset.key, file); }
            }));
            blockEl.querySelectorAll('[data-record]').forEach((b) => own(b) && b.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const input = b.parentElement.querySelector('input');
                recordHotkey(input, (v) => setCfg(input.dataset.key, v));
            }));
        });
        // Przeciąganie bloków między miejscami (także do środka Jeśli / Powtórz)
        root.querySelectorAll('.block-head').forEach((h) => {
            h.addEventListener('dragstart', (e) => { dragPath = P(h.closest('.block').dataset.path); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'block'); root.classList.add('dragging'); });
            h.addEventListener('dragend', () => { dragPath = null; root.classList.remove('dragging'); root.querySelectorAll('.drop-zone.over').forEach((z) => z.classList.remove('over')); });
        });
        root.querySelectorAll('.drop-zone').forEach((z) => {
            z.addEventListener('dragover', (e) => { if (!dragPath) return; e.preventDefault(); z.classList.add('over'); });
            z.addEventListener('dragleave', () => z.classList.remove('over'));
            z.addEventListener('drop', (e) => {
                e.preventDefault();
                z.classList.remove('over');
                if (!dragPath) return;
                const to = P(z.dataset.drop);
                // Nie można wrzucić bloku do jego własnego wnętrza
                const from = JSON.stringify(dragPath);
                if (JSON.stringify(to.slice(0, dragPath.length)) === from) return toast('Nie można przenieść bloku do jego wnętrza', 'error');
                moveBlock(dragPath, to, Number(z.dataset.index));
                dragPath = null;
            });
        });
    }

    // Wybór nowego bloku: logika + akcje z dodatków
    function openBlockPicker(listPath, index) {
        pickTarget = { list: listPath, index };
        $('actionSearch').value = '';
        renderPicker();
        PitayaUI.openModal('modalAction');
        setTimeout(() => $('actionSearch').focus(), 50);
    }
    function renderPicker() {
        const q = $('actionSearch').value.trim().toLowerCase();
        const inLoop = pickTarget && pickTarget.list.some((k) => k === 'blocks');
        const logic = Object.entries(LOGIC).filter(([k, l]) => (k !== 'break' || inLoop) && (!q || `${l.name} ${l.desc} logika warunek pętla`.toLowerCase().includes(q)));
        const groups = data.plugins.filter((p) => !p.error && !p.disabled && p.actions.length).map((p) => {
            const items = p.actions.filter((a) => !q || `${a.name} ${a.description} ${p.name} ${a.id} ${p.id}`.toLowerCase().includes(q));
            if (!items.length) return '';
            const look = [(p.color) || (PLUGIN_LOOK[p.id] || [])[0] || '#64748b', p.icon || (PLUGIN_LOOK[p.id] || [])[1] || 'puzzle'];
            return `<div class="ap-group"><div class="ap-head"><span class="b-ico" style="--bc:${esc(look[0])}">${lucideSvg(look[1])}</span>${esc(p.name)}</div>${items.map((a) =>
                `<button class="ap-item" data-p="${esc(p.id)}" data-a="${esc(a.id)}">${esc(a.name)}${a.description ? `<small>${esc(a.description)}</small>` : ''}</button>`).join('')}</div>`;
        });
        $('actionPicker').innerHTML = (logic.length ? `<div class="ap-group logic"><div class="ap-head"><span class="b-ico" style="--bc:#a855f7">${lucideSvg('workflow')}</span>Logika</div>${logic.map(([k, l]) =>
            `<button class="ap-item" data-logic="${k}"><span class="ap-li" style="--bc:${l.color}">${lucideSvg(l.icon)}</span>${esc(l.name)}<small>${esc(l.desc)}</small></button>`).join('')}</div>` : '') +
            groups.join('') +
            `<div class="ap-group store-more"><div class="ap-head"><span class="b-ico" style="--bc:#e6007e">${lucideSvg('shopping-bag')}</span>Więcej akcji</div><button class="ap-item" data-store-more>Otwórz sklep z dodatkami<small>Spotify, Discord, OBS, Home Assistant, Minutnik…</small></button></div>`;
    }
    $('btnAddAction').onclick = () => openBlockPicker([phase], ((rawButton().actions || {})[phase] || []).length);
    $('actionSearch').oninput = renderPicker;
    $('actionPicker').onclick = (e) => {
        if (e.target.closest('[data-store-more]')) { PitayaUI.closeModal('modalAction'); return openStore(); }
        const lb = e.target.closest('[data-logic]');
        const b = e.target.closest('[data-a]');
        if (!lb && !b) return;
        let block;
        if (lb) block = newBlock(lb.dataset.logic);
        else {
            const def = plugin(b.dataset.p).actions.find((a) => a.id === b.dataset.a);
            const config = {};
            for (const f of def.fields) if (f.default !== undefined) config[f.key] = f.default;
            block = { plugin: b.dataset.p, action: b.dataset.a, config };
        }
        const target = pickTarget || { list: [phase], index: ((rawButton().actions || {})[phase] || []).length };
        update((x) => {
            x.actions = x.actions || {};
            resolve(x.actions, target.list, true).splice(target.index, 0, block);
            if (!lb && (x.type || 'button') === 'button' && !x.label) x.label = plugin(b.dataset.p).actions.find((a) => a.id === b.dataset.a).name;
        }, { rerender: true });
        PitayaUI.closeModal('modalAction');
        switchTab('actions');
    };

    function fieldHtml(f, value) {
        const v = value === undefined ? f.default : value;
        const id = `f_${Math.random().toString(36).slice(2, 9)}`;
        const label = `<label class="m-label" for="${id}">${esc(f.label)}</label>`;
        const help = f.help ? `<div class="m-small">${esc(f.help)}</div>` : '';
        const attrs = `id="${id}" data-key="${esc(f.key)}" data-type="${f.type}"`;
        if (f.type === 'button') return `<button class="m-btn small" data-cmd="${esc(f.key)}">${esc(f.label)}</button>${help}`;
        if (f.type === 'info') return `<div class="plug-info">${esc(f.label)}${f.help ? `<br><span class="m-small">${esc(f.help)}</span>` : ''}</div>`;
        if (f.type === 'bool') return `<label class="check"><input type="checkbox" ${attrs} ${v ? 'checked' : ''}> ${esc(f.label)}</label>${help}`;
        if (f.type === 'textarea') return `<div class="m-field">${label}<textarea class="m-input" ${attrs} placeholder="${esc(f.placeholder || '')}">${esc(v ?? '')}</textarea>${help}</div>`;
        if (f.type === 'select') {
            const opts = f.options || [];
            return `<div class="m-field">${label}<div class="field-row"><select class="m-select" ${attrs} data-dynamic="${f.dynamic ? 1 : ''}" data-value="${esc(v ?? '')}">
                ${opts.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
                ${f.dynamic ? `<option value="${esc(v ?? '')}">${v ? esc(v) : 'Wczytywanie…'}</option>` : ''}
              </select>${f.dynamic ? '<button class="m-btn small icon-only" data-refresh title="Odśwież listę">⟳</button>' : ''}</div>${help}</div>`;
        }
        if (f.type === 'hotkey') return `<div class="m-field">${label}<div class="field-row"><input class="m-input hotkey-input" ${attrs} value="${esc(v ?? '')}" placeholder="${esc(f.placeholder || 'Kliknij Nagraj i naciśnij skrót')}">
            <button class="m-btn small" data-record>Nagraj</button></div>${help}</div>`;
        if (f.type === 'file') return `<div class="m-field">${label}<div class="field-row"><input class="m-input" ${attrs} value="${esc(v ?? '')}" placeholder="${esc(f.placeholder || '')}">
            <button class="m-btn small" data-browse>Wybierz…</button></div>${help}</div>`;
        if (f.type === 'password') return `<div class="m-field">${label}<input class="m-input" type="password" ${attrs} value="${esc(v ?? '')}">${help}</div>`;
        return `<div class="m-field">${label}<input class="m-input" ${f.type === 'number' ? 'type="number"' : ''} ${attrs} value="${esc(v ?? '')}" placeholder="${esc(f.placeholder || '')}">${help}</div>`;
    }
    async function loadOptions(item, key, select) {
        const cacheKey = `${item.plugin}/${item.action}/${key}`;
        const current = select.dataset.value;
        let opts = optionsCache[cacheKey];
        if (!opts) { opts = await deck.fieldOptions(item.plugin, item.action, key); optionsCache[cacheKey] = opts; }
        const has = opts.some((o) => String(o.value) === String(current));
        select.innerHTML = (current && !has ? `<option value="${esc(current)}">${esc(current)} (niedostępne)</option>` : '') +
            (!current && !opts.some((o) => o.value === '') ? '<option value="">— wybierz —</option>' : '') +
            opts.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
        select.value = current || '';
        if (!opts.length) select.innerHTML += '<option value="" disabled>Brak pozycji (sprawdź połączenie wtyczki)</option>';
    }
    // Nagrywanie skrótu: naciśnij kombinację, a pole zapisze np. „ctrl+shift+m”
    function recordHotkey(input, onDone) {
        input.classList.add('listening');
        input.value = 'Naciśnij skrót…';
        const names = { Control: 'ctrl', Shift: 'shift', Alt: 'alt', AltGraph: 'altgr', Meta: 'super', ' ': 'space', Escape: 'esc', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', PageUp: 'pageup', PageDown: 'pagedown', Delete: 'delete', Backspace: 'backspace', Enter: 'enter', Tab: 'tab', Insert: 'insert', Home: 'home', End: 'end', PrintScreen: 'printscreen', CapsLock: 'capslock', MediaPlayPause: 'playpause', MediaTrackNext: 'next', MediaTrackPrevious: 'previous', AudioVolumeUp: 'volumeup', AudioVolumeDown: 'volumedown', AudioVolumeMute: 'mute' };
        const handler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(e.key)) return;
            const parts = [];
            if (e.ctrlKey) parts.push('ctrl');
            if (e.shiftKey) parts.push('shift');
            if (e.altKey) parts.push('alt');
            if (e.metaKey) parts.push('super');
            const k = names[e.key] || (/^F\d+$/.test(e.key) ? e.key.toLowerCase() : e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : e.code.startsWith('Digit') ? e.code.slice(5) : e.key.toLowerCase());
            parts.push(k);
            input.value = parts.join('+');
            input.classList.remove('listening');
            removeEventListener('keydown', handler, true);
            onDone(input.value);
        };
        addEventListener('keydown', handler, true);
    }
    // ───── Zmienne: wstawianie i wybór ─────
    let varCallback = null;
    function variableRows(list, clickable) {
        const groups = {};
        for (const v of list) (groups[v.plugin === 'user' ? 'Twoje zmienne' : (plugin(v.plugin) || {}).name || v.plugin] ||= []).push(v);
        return Object.entries(groups).map(([g, vs]) => `<div class="var-group">${esc(g)}</div>` + vs.map((v) =>
            `<div class="var-row${clickable ? ' clickable' : ''}" data-var="${esc(v.name)}"><code>{${esc(v.name)}}</code><span class="vl">${esc(v.label)}</span><span class="vv">${esc(v.text)}</span></div>`).join('')).join('');
    }
    function renderVarPicker() {
        const q = $('varSearch').value.trim().toLowerCase();
        const list = (data.variables || []).filter((v) => !q || `${v.name} ${v.label}`.toLowerCase().includes(q));
        $('varPicker').innerHTML = variableRows(list, true) || '<div class="m-small">Brak zmiennych.</div>';
    }
    async function pickVariable(cb) {
        data.variables = await deck.variables();
        varCallback = cb;
        $('varsTitle').textContent = cb ? 'Wybierz zmienną' : 'Wstaw zmienną';
        $('varSearch').value = '';
        renderVarPicker();
        PitayaUI.openModal('modalVars');
        setTimeout(() => $('varSearch').focus(), 50);
    }
    $('varSearch').oninput = renderVarPicker;
    $('btnInsertVar').onclick = () => pickVariable(null);
    $('varPicker').onclick = (e) => {
        const row = e.target.closest('[data-var]');
        if (!row) return;
        PitayaUI.closeModal('modalVars');
        if (varCallback) { const cb = varCallback; varCallback = null; return cb(row.dataset.var); }
        const input = $('fLabel');
        const pos = input.selectionStart ?? input.value.length;
        input.value = input.value.slice(0, pos) + `{${row.dataset.var}}` + input.value.slice(input.selectionEnd ?? pos);
        setLook('label', input.value);
    };

    $('btnDelete').onclick = async () => {
        clearTimeout(saveTimer); pendingSave = null;
        await deck.setButton(folderId, selected, null);
        selected = null;
        await load();
    };
    $('btnDuplicate').onclick = async () => { await flushSave(); duplicate(selected); };
    $('btnTest').onclick = async () => {
        await flushSave();
        const b = rawButton();
        if (b.type === 'slider') { await deck.testSlider(folderId, selected, 50); return toast('Ustawiono suwak na 50'); }
        // Na zakładce Akcje „Testuj” uruchamia wyzwalacz, który właśnie edytujesz
        const trig = activeTab() === 'actions' && phase !== 'change' ? phase : 'press';
        const res = await deck.testButton(folderId, selected, trig);
        if (!((b.actions || {})[trig] || []).length && !(trig === 'press' && b.states && b.stateSource === 'cycle')) return toast(`Ten przycisk nie ma bloków dla: ${PHASES[trig][0]}.`, 'info');
        toast(res.ok ? 'Wykonano' : res.errors.join(' · '), res.ok ? 'success' : 'error');
        data = { ...data, ...(await deck.get()) };
        renderGrid();
        renderInspector();
    };

    // ───── Połączenie ─────
    function renderConnection() {
        const online = (data.devices || []).filter((d) => d.online).length;
        const url = data.server.urls[0];
        $('connDot').classList.toggle('active', online > 0);
        $('connText').textContent = !data.server.port ? 'Serwer nie działa' : online ? `Połączone: ${online} · ${url ? url.url.replace('http://', '') : ''}` : `Czeka na telefon · ${url ? url.url.replace('http://', '') : `port ${data.server.port}`}`;
    }
    async function openConnect() {
        data = { ...data, ...(await deck.get()) };
        const urls = data.server.urls;
        if (!urls.length) {
            $('urls').innerHTML = '<div class="m-small">Brak połączenia z siecią — podłącz komputer do Wi‑Fi albo kabla.</div>';
        } else {
            qrUrl = qrUrl && urls.some((u) => u.url === qrUrl) ? qrUrl : urls[0].url;
            $('urls').innerHTML = urls.map((u) => `<div class="url-row${u.url === qrUrl ? ' active' : ''}" data-url="${esc(u.url)}"><code>${esc(u.url)}</code><small>${esc(u.name)}</small>
                <button class="m-btn small" data-open>Otwórz</button></div>`).join('');
            $('qrImg').src = await deck.qr(qrUrl);
        }
        $('fApproval').checked = data.deck.settings.requireApproval;
        PitayaUI.openModal('modalConnect');
    }
    $('btnConnect').onclick = openConnect;
    $('connPill').onclick = openConnect;
    $('urls').onclick = async (e) => {
        const row = e.target.closest('[data-url]');
        if (!row) return;
        if (e.target.hasAttribute('data-open')) return deck.openUrl(row.dataset.url);
        qrUrl = row.dataset.url;
        $('urls').querySelectorAll('.url-row').forEach((r) => r.classList.toggle('active', r === row));
        $('qrImg').src = await deck.qr(qrUrl);
    };
    $('fApproval').onchange = async () => { await deck.settings({ requireApproval: $('fApproval').checked }); data.deck.settings.requireApproval = $('fApproval').checked; };

    function showPairing() {
        const d = pairingQueue[0];
        if (!d) return PitayaUI.closeModal('modalPairing');
        $('pairName').textContent = d.name;
        $('pairIp').textContent = d.ip ? `Adres: ${d.ip.replace('::ffff:', '')}` : '';
        PitayaUI.openModal('modalPairing');
    }
    async function answerPairing(ok) {
        const d = pairingQueue.shift();
        if (d) await deck.approve(d.id, ok);
        showPairing();
    }
    $('btnPairOk').onclick = () => answerPairing(true);
    $('btnPairDeny').onclick = () => answerPairing(false);

    // ───── Ustawienia ─────
    window.openSettings = async (tab) => {
        data = { ...data, ...(await deck.get()) };
        $('fPort').value = data.deck.settings.port;
        $('fApproval2').checked = data.deck.settings.requireApproval;
        $('fClock').checked = data.deck.settings.showClock;
        $('importCard').hidden = !(await deck.macroDeckAvailable());
        deck.keyboardStatus().then((s) => {
            const names = { uinput: 'wirtualna klawiatura (uinput)', ydotool: 'ydotool', xdotool: 'xdotool', wtype: 'wtype', windows: 'Windows' };
            $('kbStatus').innerHTML = s.ok ? `<span class="t-ok">Działa — ${esc(names[s.backend] || s.backend)}</span>` : `<span class="t-err">${esc(s.error)}</span>`;
        });
        renderPlugins();
        renderVars();
        switchSettings(tab || 'general');
        PitayaUI.openModal('modalSettings');
    };
    function switchSettings(tab) {
        document.querySelectorAll('#settingsTabs .m-tab').forEach((t) => t.classList.toggle('active', t.dataset.stab === tab));
        document.querySelectorAll('[data-spane]').forEach((p) => { p.hidden = p.dataset.spane !== tab; });
    }
    $('settingsTabs').onclick = (e) => { const t = e.target.closest('[data-stab]'); if (t) switchSettings(t.dataset.stab); };
    $('btnImportMd').onclick = async () => {
        $('btnImportMd').disabled = true;
        $('importResult').textContent = 'Importowanie…';
        try {
            const s = await deck.importMacroDeck();
            const skipped = Object.entries(s.skipped).map(([k, n]) => `${k} ×${n}`).join(', ');
            $('importResult').innerHTML = `<span class="t-ok">Zaimportowano: ${s.profiles} profil(e), ${s.folders} folderów, ${s.widgets} widżetów, ${s.actions} akcji, ${s.icons} ikon.</span>` +
                (skipped ? `<br>Pominięte: ${esc(skipped)}.` : '') + (s.windowsPaths ? `<br>${s.windowsPaths} akcji wskazuje programy z Windowsa (C:\\…) — popraw je na ścieżki z tego komputera.` : '');
            data = await deck.get();
            const p = data.deck.profiles[data.deck.profiles.length - 1];
            profileId = p.id; folderId = p.root; selected = null;
            await load();
            toast('Deck z Macro Deck zaimportowany', 'success');
        } catch (err) {
            $('importResult').innerHTML = `<span class="t-err">${esc(err.message)}</span>`;
        } finally { $('btnImportMd').disabled = false; }
    };
    $('fPort').onchange = async () => {
        const res = await deck.settings({ port: parseInt($('fPort').value, 10) });
        data.server = res.server;
        renderConnection();
        toast(`Serwer działa na porcie ${res.server.port}`, 'success');
    };
    $('fApproval2').onchange = () => deck.settings({ requireApproval: $('fApproval2').checked });
    $('fClock').onchange = () => deck.settings({ showClock: $('fClock').checked });
    $('btnExport').onclick = async () => { const f = await deck.exportDeck(); if (f) toast(`Zapisano: ${f}`, 'success'); };
    $('btnImport').onclick = async () => {
        if (!confirm('Import zastąpi wszystkie profile, foldery i przyciski. Kontynuować?')) return;
        try { const r = await deck.importDeck(); if (r) { selected = null; profileId = null; await load(); toast('Zaimportowano deck', 'success'); } } catch (err) { toast(err.message, 'error'); }
    };
    $('btnPluginsDir').onclick = () => deck.openPluginsDir();
    $('btnQuit').onclick = () => deck.quit();

    function renderPlugins() {
        $('pluginsList').innerHTML = data.plugins.map((p) => `<div class="plug" data-plugin="${esc(p.id)}">
            <div class="plug-head"><div><div class="m-panel-title">${esc(p.name)}</div><div class="m-small">${esc(p.description || '')}${p.builtin ? '' : ' · wtyczka użytkownika'}</div></div>
              <span style="flex:1"></span>
              <label class="check"><input type="checkbox" data-enable ${p.disabled ? '' : 'checked'}> Włączona</label></div>
            ${p.error ? `<div class="plug-err">Błąd: ${esc(p.error)}</div>` : ''}
            ${p.status ? `<div class="plug-status ${p.status.ok ? 'ok' : 'bad'}"><span class="m-status-dot${p.status.ok ? ' active' : ''}"></span>${esc(p.status.text)}</div>` : ''}
            ${p.settings.map((s) => fieldHtml(s, p.values[s.key])).join('')}
            ${p.variables.length ? `<div class="m-small">Zmienne: ${p.variables.map((v) => `<code>{${esc(v.id)}}</code>`).join(' ')}</div>` : ''}
        </div>`).join('');
        $('pluginsList').querySelectorAll('.plug').forEach((box) => {
            const id = box.dataset.plugin;
            box.querySelectorAll('[data-cmd]').forEach((btn) => btn.onclick = async () => {
                btn.disabled = true;
                try {
                    await flushPluginSettings(box, id);
                    const r = await deck.pluginCommand(id, btn.dataset.cmd);
                    data.plugins = r.plugins;
                    if (r.result) toast(String(r.result), 'success');
                    renderPlugins();
                } catch (err) { toast(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'error'); btn.disabled = false; }
            });
            box.querySelector('[data-enable]').onchange = async (e) => { data.plugins = await deck.pluginToggle(id, !e.target.checked); renderPlugins(); };
            let t = null;
            box.querySelectorAll('[data-key]').forEach((input) => {
                input.addEventListener(input.dataset.type === 'bool' ? 'change' : 'input', () => {
                    clearTimeout(t);
                    t = setTimeout(() => flushPluginSettings(box, id), 500);
                });
            });
        });
    }
    async function flushPluginSettings(box, id) {
        const patch = {};
        box.querySelectorAll('[data-key]').forEach((x) => { patch[x.dataset.key] = x.dataset.type === 'bool' ? x.checked : x.dataset.type === 'number' ? Number(x.value) : x.value; });
        if (!Object.keys(patch).length) return;
        await deck.pluginSettings(id, patch);
        optionsCache = {};
    }
    async function renderVars() {
        data.variables = await deck.variables();
        const user = data.variables.filter((v) => v.plugin === 'user');
        const other = data.variables.filter((v) => v.plugin !== 'user');
        $('varsList').innerHTML = (user.length ? `<div class="var-group">Twoje zmienne</div>` + user.map((v) =>
            `<div class="var-row" data-var="${esc(v.name)}"><code>{${esc(v.name)}}</code><span class="vl"></span>
              <input class="m-input" data-edit value="${esc(v.value)}"><button class="tool" data-del title="Usuń">✕</button></div>`).join('') : '<div class="m-small">Nie masz jeszcze własnych zmiennych.</div>') +
            variableRows(other, false);
    }
    $('varsList').addEventListener('change', async (e) => {
        if (!e.target.hasAttribute('data-edit')) return;
        const name = e.target.closest('[data-var]').dataset.var;
        const raw = e.target.value;
        const num = raw.trim() !== '' && !isNaN(Number(raw.replace(',', '.')));
        await deck.setVariable(name, num ? Number(raw.replace(',', '.')) : raw, num ? 'number' : 'text');
    });
    $('varsList').addEventListener('click', async (e) => {
        if (!e.target.hasAttribute('data-del')) return;
        await deck.deleteVariable(e.target.closest('[data-var]').dataset.var);
        renderVars();
    });
    $('btnNewVar').onclick = async () => {
        const name = $('newVarName').value.trim().replace(/\s+/g, '_');
        if (!/^[\w.-]+$/.test(name)) return toast('Nazwa może mieć litery, cyfry, _ . i -', 'error');
        await deck.setVariable(name, 0, 'number');
        $('newVarName').value = '';
        renderVars();
    };

    $('btnMax').onclick = () => deck.maximize();

    // ───── Zdarzenia z procesu głównego ─────
    deck.on('notify', (text, kind) => toast(text, kind));
    deck.on('devices', (list) => { if (!data) return; data.devices = list; renderDevices(); renderConnection(); });
    deck.on('plugins', (list) => {
        if (!data) return;
        data.plugins = list;
        const open = document.getElementById('modalSettings').classList.contains('active') && !$('pluginsList').closest('[data-spane]').hidden;
        // Nie przerysowujemy, gdy ktoś właśnie pisze w polu ustawień
        if (open && !$('pluginsList').contains(document.activeElement)) renderPlugins();
    });
    deck.on('pairing', (d) => { if (!pairingQueue.some((x) => x.id === d.id)) pairingQueue.push(d); showPairing(); });
    deck.on('ready', async () => {
        if (!data) return load();
        const d = await deck.get();
        Object.assign(data, { plugins: d.plugins, variables: d.variables, server: d.server, devices: d.devices });
        renderConnection();
        renderDevices();
    });
    deck.on('vars-changed', async () => {
        if (!data || pendingSave) return;
        const state = await deck.preview(folderId);
        for (const el of $('grid').children) {
            const key = el.dataset.key;
            if (!state.buttons[key]) continue;
            if (key === selected && lookState !== null) continue;
            const col = el.style.gridColumn, row = el.style.gridRow;
            R.paint(el, fixImage(state.buttons[key]), cellPx);
            el.style.gridColumn = col; el.style.gridRow = row;
            el.dataset.key = key;
            el.draggable = true;
            if (key === selected) el.classList.add('selected');
            if (state.buttons[key].type === 'media' && (state.buttons[key].w || 1) < 2) el.classList.add('narrow');
        }
        if (selected && state.buttons[selected] && lookState === null) paintInspPreview(fixImage(state.buttons[selected]));
    });

    // ───── Sklep z dodatkami ─────
    let storeData = null;
    let storeCat = 'all';
    let storeOpenId = null;
    const STORE_ICON = (name) => (lucideData && lucideData.icons[name] ? R.lucide(lucideData.icons[name]) : '');
    const icoBox = (it, big) => `<span class="store-ico${big ? ' big' : ''}" style="background:${esc(it.color || '#e6007e')}">${STORE_ICON(it.icon || 'puzzle')}</span>`;
    async function openStore(id) {
        if (!lucideData) lucideData = await deck.lucide();
        storeOpenId = id || null;
        PitayaUI.openModal('modalStore');
        $('storeGrid').innerHTML = '<div class="store-empty">Wczytywanie sklepu…</div>';
        await refreshStore();
    }
    async function refreshStore(force) {
        storeData = await deck.storeList(force);
        updateStoreBadge();
        renderStore();
    }
    function updateStoreBadge() {
        const n = storeData ? storeData.items.filter((x) => x.update).length : 0;
        $('storeBadge').hidden = !n;
        $('storeBadge').textContent = n;
    }
    function renderStore() {
        const items = storeData.items;
        const count = (f) => items.filter(f).length;
        const cats = [
            { id: 'all', name: 'Wszystkie', icon: 'layout-grid', n: items.length },
            { id: 'installed', name: 'Zainstalowane', icon: 'circle-check', n: count((x) => x.installed) },
            { id: 'updates', name: 'Aktualizacje', icon: 'refresh-cw', n: count((x) => x.update) },
            null,
            ...storeData.categories.map((c) => ({ ...c, n: count((x) => x.category === c.id) })).filter((c) => c.n),
        ];
        $('storeCats').innerHTML = cats.map((c) => (c ? `<button data-cat="${c.id}" class="${c.id === storeCat ? 'active' : ''}">${STORE_ICON(c.icon)}${esc(c.name)}<span class="n">${c.n}</span></button>` : '<div class="sep"></div>')).join('') +
            `<div class="store-url"><span>Własny sklep (adres katalogu)</span><input class="m-input" id="storeUrlInput" placeholder="https://…" value="${esc(storeData.storeUrl)}">${storeData.remoteError ? `<span class="t-err">Nie udało się wczytać: ${esc(storeData.remoteError)}</span>` : ''}</div>`;
        $('storeUrlInput').onchange = async (e) => { storeData = await deck.storeUrl(e.target.value); renderStore(); };
        $('btnStoreUpdateAll').hidden = !count((x) => x.update);
        const q = $('storeSearch').value.trim().toLowerCase();
        const shown = items.filter((x) => (storeCat === 'all' || (storeCat === 'installed' && x.installed) || (storeCat === 'updates' && x.update) || x.category === storeCat) &&
            (!q || `${x.name} ${x.description} ${(x.tags || []).join(' ')} ${x.author}`.toLowerCase().includes(q)));
        $('storeGrid').innerHTML = shown.map((it) => `<div class="store-card" data-sid="${esc(it.id)}">
                <div class="sc-head">${icoBox(it)}<div><div class="sc-name">${esc(it.name)}</div><div class="sc-meta">${esc(it.author || '')} · ${esc(it.version)}</div></div></div>
                <div class="sc-desc">${esc(it.description)}</div>
                <div class="sc-foot">${statusPill(it)}${cardButton(it)}</div>
            </div>`).join('') || '<div class="store-empty">Nic nie znaleziono.</div>';
        if (storeOpenId) renderStoreDetail(storeOpenId); else $('storeDetail').hidden = true;
    }
    function statusPill(it) {
        if (it.error) return '<span class="pill err">Błąd</span>';
        if (it.update) return `<span class="pill upd">Nowa wersja ${esc(it.version)}</span>`;
        if (it.installed) return it.disabled ? '<span class="pill">Wyłączony</span>' : '<span class="pill ok">Zainstalowany</span>';
        return it.featured ? '<span class="pill feat">Polecany</span>' : '';
    }
    function cardButton(it) {
        if (it.update) return `<button class="m-btn small accent" data-store="install" data-id="${esc(it.id)}">Aktualizuj</button>`;
        if (it.installed) return `<button class="m-btn small" data-store="open" data-id="${esc(it.id)}">Szczegóły</button>`;
        return `<button class="m-btn small accent" data-store="install" data-id="${esc(it.id)}">Zainstaluj</button>`;
    }
    function renderStoreDetail(id) {
        const it = storeData.items.find((x) => x.id === id);
        if (!it) { storeOpenId = null; $('storeDetail').hidden = true; return; }
        const cat = storeData.categories.find((c) => c.id === it.category);
        $('storeDetail').hidden = false;
        $('storeDetail').innerHTML = `
            <button class="m-btn small sd-back" data-store="back">← Wróć do sklepu</button>
            <div class="sd-head">${icoBox(it, true)}
              <div><h2>${esc(it.name)}</h2><div class="sd-sub">${esc(it.author || '')} · wersja ${esc(it.version)}${cat ? ` · ${esc(cat.name)}` : ''}</div>
                <div class="tags" style="margin-top:8px">${statusPill(it)}${(it.tags || []).map((t) => `<span class="pill">${esc(t)}</span>`).join('')}</div></div>
              <div class="sd-actions">
                ${it.installed ? `${it.update ? `<button class="m-btn accent" data-store="install" data-id="${esc(it.id)}">Aktualizuj do ${esc(it.version)}</button>` : ''}
                    <button class="m-btn" data-store="settings" data-id="${esc(it.id)}">Ustawienia</button>
                    <button class="m-btn danger" data-store="uninstall" data-id="${esc(it.id)}">Odinstaluj</button>`
                  : `<button class="m-btn accent" data-store="install" data-id="${esc(it.id)}">Zainstaluj</button>`}
              </div>
            </div>
            <div class="sd-cols">
              <div>
                <div class="sd-box"><h4>Opis</h4><p>${esc(it.longDescription || it.description)}</p></div>
                ${(it.features || []).length ? `<div class="sd-box"><h4>Co dodaje</h4><ul>${it.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
                ${it.status ? `<div class="sd-box"><h4>Stan</h4><p class="${it.status.ok ? 't-ok' : ''}">${esc(it.status.text)}</p></div>` : ''}
                ${it.error ? `<div class="sd-box"><h4>Błąd</h4><p class="t-err">${esc(it.error)}</p></div>` : ''}
              </div>
              <div>
                <div class="sd-box"><h4>Informacje</h4><dl>
                  <dt>Wersja</dt><dd>${esc(it.version)}${it.installed && it.installedVersion !== it.version ? ` (masz ${esc(it.installedVersion)})` : ''}</dd>
                  <dt>Autor</dt><dd>${esc(it.author || '—')}</dd>
                  <dt>Licencja</dt><dd>${esc(it.license || '—')}</dd>
                  ${it.installed && it.variablesCount !== null ? `<dt>Akcje</dt><dd>${it.actionsCount}</dd><dt>Zmienne</dt><dd>${it.variablesCount}</dd>` : ''}
                  <dt>Źródło</dt><dd>${it.source === 'remote' ? 'sklep internetowy' : 'w zestawie z Pitaya Deck'}</dd>
                </dl></div>
                ${(it.changelog || []).length ? `<div class="sd-box"><h4>Historia zmian</h4>${it.changelog.map((c) => `<div class="sd-log"><b>${esc(c.version)}</b> ${esc(c.notes)}</div>`).join('')}</div>` : ''}
              </div>
            </div>`;
    }
    async function storeAction(op, id, btn) {
        if (op === 'back') { storeOpenId = null; $('storeDetail').hidden = true; return; }
        if (op === 'open') { storeOpenId = id; renderStoreDetail(id); return; }
        if (op === 'settings') { PitayaUI.closeModal('modalStore'); await openSettings('plugins'); const box = document.querySelector(`.plug[data-plugin="${CSS.escape(id)}"]`); if (box) box.scrollIntoView({ block: 'start' }); return; }
        if (btn) { btn.disabled = true; btn.textContent = op === 'uninstall' ? 'Usuwanie…' : 'Instalowanie…'; }
        try {
            if (op === 'install') {
                const r = await deck.storeInstall(id);
                data.plugins = r.plugins;
                toast(`Zainstalowano: ${r.name} ${r.version}`, 'success');
                storeOpenId = id;
            }
            if (op === 'uninstall') {
                const used = (await deck.storeUsed()).includes(id);
                if (!confirm(used ? 'Twoje przyciski używają tego dodatku — po odinstalowaniu ich akcje przestaną działać. Odinstalować?' : 'Odinstalować ten dodatek?')) { renderStore(); return; }
                const r = await deck.storeUninstall(id);
                data.plugins = r.plugins;
                toast('Odinstalowano', 'success');
            }
            optionsCache = {};
            data.variables = await deck.variables();
        } catch (err) { toast(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'error'); }
        await refreshStore();
        if (selected) renderInspector();
    }
    $('storeGrid').addEventListener('click', (e) => {
        const b = e.target.closest('[data-store]');
        if (b) { e.stopPropagation(); return storeAction(b.dataset.store, b.dataset.id, b); }
        const card = e.target.closest('[data-sid]');
        if (card) storeAction('open', card.dataset.sid);
    });
    $('storeDetail').addEventListener('click', (e) => { const b = e.target.closest('[data-store]'); if (b) storeAction(b.dataset.store, b.dataset.id, b); });
    $('storeCats').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; storeCat = b.dataset.cat; storeOpenId = null; renderStore(); });
    $('storeSearch').oninput = () => { storeOpenId = null; renderStore(); };
    $('btnStoreUpdateAll').onclick = async () => {
        $('btnStoreUpdateAll').disabled = true;
        try { const r = await deck.storeUpdateAll(); data.plugins = r.plugins; toast(`Zaktualizowano: ${r.updated.join(', ')}`, 'success'); } catch (err) { toast(err.message, 'error'); }
        $('btnStoreUpdateAll').disabled = false;
        refreshStore();
    };
    $('btnStore').onclick = () => openStore();
    window.openStore = openStore;
    // Plakietka z liczbą aktualizacji przy przycisku Sklep
    setTimeout(() => deck.storeList().then((d) => { storeData = d; updateStoreBadge(); }).catch(() => {}), 2500);

    load();
})();
