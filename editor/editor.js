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
        press: ['Naciśnięcie', 'Wykonuje się od razu po dotknięciu.'],
        longPress: ['Przytrzymanie', 'Po przytrzymaniu przez pół sekundy. Gdy są tu akcje, krótkie dotknięcie czeka na puszczenie.'],
        release: ['Puszczenie', 'Po puszczeniu przycisku — np. „naciśnij i trzymaj, żeby mówić”.'],
        change: ['Zmiana wartości', 'Przy każdym ruchu suwaka. W polach akcji wpisz {value}, żeby użyć wartości.'],
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
        const total = Object.values(b.actions || {}).reduce((a, l) => a + (l || []).length, 0);
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

    // ───── Akcje ─────
    function renderPhases(b) {
        const type = b.type || 'button';
        const list = type === 'slider' ? ((b.slider || {}).preset === 'custom' ? ['change'] : []) : type === 'media' ? [] : ['press', 'longPress', 'release'];
        if (!list.includes(phase)) phase = list[0] || 'press';
        $('phase').innerHTML = list.map((p) => `<button data-v="${p}" class="${p === phase ? 'active' : ''}">${PHASES[p][0]}</button>`).join('');
        $('phase').hidden = list.length < 2;
        $('btnAddAction').hidden = !list.length;
        if (!list.length) $('phaseHint').textContent = type === 'media' ? 'Odtwarzacz ma wbudowane przyciski: poprzedni, graj/pauza, następny.' : 'Ten suwak steruje głośnością bez dodatkowych akcji. Wybierz „Własną zmienną i akcjami” w zakładce Widżet, żeby dodać akcje.';
    }
    $('phase').onclick = (e) => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        phase = b.dataset.v;
        $('phase').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
        renderActions();
    };
    function renderActions() {
        const b = rawButton() || {};
        if ($('btnAddAction').hidden) { $('actionsList').innerHTML = ''; return; }
        $('phaseHint').textContent = PHASES[phase][1];
        const list = (b.actions || {})[phase] || [];
        $('actionsList').innerHTML = list.length ? list.map((item, i) => actionCard(item, i)).join('') : '<div class="m-small">Brak akcji. Dodaj pierwszą poniżej.</div>';
        list.forEach((item, i) => wireAction(item, i));
    }
    function actionCard(item, i) {
        const p = plugin(item.plugin);
        const a = actionDef(item);
        const fields = (a && a.fields) || [];
        return `<div class="act${item.enabled === false ? ' off' : ''}" data-i="${i}">
            <div class="act-head" data-toggle>
              <span class="act-num">${i + 1}</span>
              <span class="act-name">${esc(a ? a.name : item.action)} <small>· ${esc(p ? p.name : item.plugin)}</small></span>
              <div class="act-tools">
                <button class="tool" data-op="up" title="W górę">↑</button>
                <button class="tool" data-op="down" title="W dół">↓</button>
                <button class="tool" data-op="toggle" title="${item.enabled === false ? 'Włącz' : 'Wyłącz'}">${item.enabled === false ? '○' : '●'}</button>
                <button class="tool" data-op="remove" title="Usuń">✕</button>
              </div>
            </div>
            <div class="act-body">
              ${!p ? '<div class="act-err">Brak tej wtyczki — zainstaluj ją albo usuń akcję.</div>' : !a ? '<div class="act-err">Wtyczka nie ma już tej akcji.</div>' : ''}
              ${a && a.description ? `<div class="m-small">${esc(a.description)}</div>` : ''}
              ${fields.map((f) => fieldHtml(f, (item.config || {})[f.key])).join('') || (a ? '<div class="m-small">Ta akcja nie ma ustawień.</div>' : '')}
            </div>
        </div>`;
    }
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
    function setConfig(i, key, value) {
        update((x) => {
            const item = x.actions[phase][i];
            item.config = { ...(item.config || {}), [key]: value };
        });
    }
    function wireAction(item, i) {
        const box = $('actionsList').querySelector(`[data-i="${i}"]`);
        box.querySelector('[data-toggle]').addEventListener('click', (e) => {
            const op = e.target.dataset.op;
            if (op) return actionOp(i, op);
            box.classList.toggle('collapsed');
        });
        box.querySelectorAll('[data-key]').forEach((input) => {
            const key = input.dataset.key;
            const type = input.dataset.type;
            const read = () => (type === 'bool' ? input.checked : type === 'number' ? (input.value === '' ? '' : Number(input.value)) : input.value);
            input.addEventListener(type === 'bool' || input.tagName === 'SELECT' ? 'change' : 'input', () => setConfig(i, key, read()));
            if (input.dataset.dynamic) loadOptions(item, key, input);
        });
        box.querySelectorAll('[data-refresh]').forEach((b) => b.addEventListener('click', () => {
            const sel = b.parentElement.querySelector('select');
            delete optionsCache[`${item.plugin}/${item.action}/${sel.dataset.key}`];
            loadOptions(item, sel.dataset.key, sel);
        }));
        box.querySelectorAll('[data-browse]').forEach((b) => b.addEventListener('click', async () => {
            const input = b.parentElement.querySelector('input');
            const a = actionDef(item);
            const f = a.fields.find((x) => x.key === input.dataset.key);
            const file = await deck.pickFile({ filters: f && f.filters });
            if (file) { input.value = file; setConfig(i, input.dataset.key, file); }
        }));
        box.querySelectorAll('[data-record]').forEach((b) => b.addEventListener('click', () => {
            const input = b.parentElement.querySelector('input');
            recordHotkey(input, (v) => setConfig(i, input.dataset.key, v));
        }));
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
    function actionOp(i, op) {
        update((x) => {
            const list = x.actions[phase];
            if (op === 'remove') list.splice(i, 1);
            if (op === 'up' && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
            if (op === 'down' && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
            if (op === 'toggle') list[i].enabled = list[i].enabled === false;
        }, { rerender: true });
    }

    // Wybór nowej akcji
    function renderPicker() {
        const q = $('actionSearch').value.trim().toLowerCase();
        $('actionPicker').innerHTML = data.plugins.filter((p) => !p.error && !p.disabled).map((p) => {
            const items = p.actions.filter((a) => !q || `${a.name} ${a.description} ${p.name}`.toLowerCase().includes(q));
            if (!items.length) return '';
            return `<div class="ap-group"><div class="m-label">${esc(p.name)}</div>${items.map((a) =>
                `<button class="ap-item" data-p="${esc(p.id)}" data-a="${esc(a.id)}">${esc(a.name)}${a.description ? `<small>${esc(a.description)}</small>` : ''}</button>`).join('')}</div>`;
        }).join('') || '<div class="m-small">Nic nie znaleziono.</div>';
    }
    $('btnAddAction').onclick = () => { $('actionSearch').value = ''; renderPicker(); PitayaUI.openModal('modalAction'); setTimeout(() => $('actionSearch').focus(), 50); };
    $('actionSearch').oninput = renderPicker;
    $('actionPicker').onclick = (e) => {
        const b = e.target.closest('[data-a]');
        if (!b) return;
        const def = plugin(b.dataset.p).actions.find((a) => a.id === b.dataset.a);
        const config = {};
        for (const f of def.fields) if (f.default !== undefined) config[f.key] = f.default;
        update((x) => {
            x.actions = x.actions || {};
            (x.actions[phase] = x.actions[phase] || []).push({ plugin: b.dataset.p, action: b.dataset.a, config });
            if ((x.type || 'button') === 'button' && !x.label) x.label = def.name;
        }, { rerender: true });
        PitayaUI.closeModal('modalAction');
        switchTab('actions');
    };

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
        const res = await deck.testButton(folderId, selected, 'press');
        if (!((b.actions || {}).press || []).length && !(b.states && b.stateSource === 'cycle')) return toast('Ten przycisk nie ma akcji naciśnięcia.', 'info');
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

    load();
})();
