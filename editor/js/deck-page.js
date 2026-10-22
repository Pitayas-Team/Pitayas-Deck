// ═══════ PITAYA DECK — EDYTOR: STRONA „DECK” ═══════
// Siatka na środku, drzewo folderów po prawej, kliknięcie widżetu otwiera pełną stronę edycji.
(function () {
    const { $, esc, clone, R } = PD;
    let cellPx = 100;
    let testMode = false;
    let lastState = null;
    const keyXY = (key) => key.split(',').map(Number);
    const gridSize = () => ({ cols: (PD.folder() && PD.folder().cols) || PD.profile().cols, rows: (PD.folder() && PD.folder().rows) || PD.profile().rows });
    PD.gridSize = gridSize;

    function occupancy(skipKey) {
        const occ = new Map();
        for (const [key, b] of Object.entries(PD.folder().buttons || {})) {
            if (key === skipKey) continue;
            const [x, y] = keyXY(key);
            for (let dx = 0; dx < (b.w || 1); dx++) for (let dy = 0; dy < (b.h || 1); dy++) occ.set(`${x + dx},${y + dy}`, key);
        }
        return occ;
    }
    PD.canPlace = (key, w, h, skipKey) => {
        const [x, y] = keyXY(key);
        const { cols, rows } = gridSize();
        if (x + w > cols || y + h > rows) return false;
        const occ = occupancy(skipKey);
        for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) if (occ.has(`${x + dx},${y + dy}`)) return false;
        return true;
    };
    const fitSize = (key, w, h) => { for (const [a, b] of [[w, h], [w, 1], [1, h], [1, 1]]) if (PD.canPlace(key, a, b, key)) return [a, b]; return [1, 1]; };

    // ───── Siatka ─────
    async function renderGrid() {
        const state = await deck.preview(PD.folderId);
        lastState = state;
        const { cols, rows } = state.profile;
        const sp = (state.style.spacing ?? 10) / 100;
        const stage = $('stage').getBoundingClientRect();
        const cell = Math.floor(Math.max(40, Math.min(170, Math.min((stage.width - 40) / (cols + (cols - 1) * sp), (stage.height - 40) / (rows + (rows - 1) * sp)))));
        cellPx = cell;
        const grid = $('grid');
        grid.style.setProperty('--cell', `${cell}px`);
        grid.style.setProperty('--gap', `${Math.round(cell * sp)}px`);
        grid.style.setProperty('--pd-radius', `${Math.round((cell * (state.style.radius ?? 22)) / 100)}px`);
        grid.style.gridTemplateColumns = `repeat(${cols}, ${cell}px)`;
        grid.style.gridTemplateRows = `repeat(${rows}, ${cell}px)`;
        grid.classList.toggle('empty-hidden', state.style.emptyCells === 'transparent');
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
            const wrap = document.createElement('div');
            wrap.className = 'cell' + (it.b ? ' filled' : ' blank') + (it.b && it.b.pinned ? ' pinned' : '') + (it.b && it.b.home ? ' foreign' : '');
            wrap.style.gridColumn = `${it.x + 1} / span ${it.w}`;
            wrap.style.gridRow = `${it.y + 1} / span ${it.h}`;
            wrap.dataset.key = it.key;
            const el = document.createElement('div');
            R.paint(el, PD.fixImage(it.b), cell);
            if (it.b && it.b.type === 'media' && it.w < 2) el.classList.add('narrow');
            wrap.appendChild(el);
            wrap.insertAdjacentHTML('beforeend', it.b ? `<span class="cell-edit">${PD.icon(testMode ? 'play' : 'pencil')}${testMode ? 'Naciśnij' : it.b.home ? `Przypięty z: ${esc((PD.data.deck.folders[it.b.home] || {}).name || '')}` : 'Edytuj'}</span>` : `<span class="cell-add">${PD.icon('plus')}</span>`);
            if (it.b && it.b.pinned) wrap.insertAdjacentHTML('beforeend', `<span class="pin-badge" title="Przypięty — widoczny w każdym folderze">${PD.icon('pin')}</span>`);
            wrap.draggable = Boolean(it.b) && !testMode && !it.b.home;
            grid.appendChild(wrap);
        }
        R.tickClocks(grid);
        // Nagłówek
        const f = PD.folder();
        $('folderTitle').textContent = f.parent ? f.name : f.name || 'Start';
        $('gridSub').textContent = `Siatka ${cols} × ${rows}${f.cols || f.rows ? ' (własna dla folderu)' : ''}`;
    }
    PD.renderGrid = renderGrid;
    // Siatka dopasowuje się do miejsca (okno, schowane foldery, zwinięty pasek)
    let lastStageW = 0, lastStageH = 0;
    new ResizeObserver(() => {
        const r = $('stage').getBoundingClientRect();
        if (PD.page !== 'deck' || !r.width || (Math.abs(r.width - lastStageW) < 2 && Math.abs(r.height - lastStageH) < 2)) return;
        lastStageW = r.width; lastStageH = r.height;
        clearTimeout(window.__rz); window.__rz = setTimeout(renderGrid, 60);
    }).observe($('stage'));
    setInterval(() => { if (PD.page === 'deck') R.tickClocks($('grid')); }, 1000);

    // Tryb testu: kliknięcie = krótkie naciśnięcie, przytrzymanie = długie naciśnięcie (jak na telefonie)
    async function testPress(cell, trig) {
        const key = cell.dataset.key;
        cell.classList.add('pressing');
        setTimeout(() => cell.classList.remove('pressing'), 180);
        const res = await deck.testButton(PD.folderId, key, trig);
        if (!res.ok) PD.toast(res.errors.join(' · '), 'error');
        setTimeout(() => { if (PD.page === 'deck') renderGrid(); }, 300);
    }
    let holdTimer = null, held = false;
    $('grid').addEventListener('pointerdown', (e) => {
        if (!testMode || e.button !== 0) return;
        const cell = e.target.closest('.cell.filled');
        if (!cell) return;
        held = false;
        const b = PD.folder().buttons[cell.dataset.key];
        if (!(b && b.actions && (b.actions.longPress || []).length)) return;
        holdTimer = setTimeout(() => { held = true; testPress(cell, 'longPress'); }, 500);
    });
    addEventListener('pointerup', () => clearTimeout(holdTimer));
    $('grid').addEventListener('click', async (e) => {
        const cell = e.target.closest('.cell');
        if (!cell) return;
        const key = cell.dataset.key;
        const b = PD.folder().buttons[key];
        const shown = lastState && lastState.buttons[key];
        if (!b && shown && shown.home && !testMode) return PD.go('widget', { folderId: shown.home, key });
        if (!b && !(shown && shown.home)) return testMode ? null : openWidgetPicker(key);
        if (testMode) {
            if (held) { held = false; return; }
            if (b.type === 'media') {
                const m = e.target.closest('[data-media]');
                if (m) await deck.testActions([{ plugin: 'media', action: 'media', config: { command: m.dataset.media } }]);
                return setTimeout(renderGrid, 400);
            }
            if (b.type === 'slider') return PD.toast('Suwak przetestujesz na telefonie albo w edycji widżetu.');
            return testPress(cell, 'press');
        }
        PD.go('widget', { folderId: PD.folderId, key });
    });
    // Przycisk folderu w trybie testu przełącza folder w edytorze
    deck.on('nav', (fid) => {
        if (!PD.data || !PD.data.deck.folders[fid]) return;
        PD.folderId = fid;
        PD.saveLast();
        renderTree();
        renderGrid();
    });
    $('btnTestMode').onclick = () => {
        testMode = !testMode;
        $('btnTestMode').classList.toggle('accent', testMode);
        $('btnTestMode').lastChild.textContent = testMode ? 'Tryb testu włączony' : 'Testuj klikając';
        $('stage').classList.toggle('testing', testMode);
        if (testMode) PD.toast('Tryb testu: kliknięcie naciska przycisk, przytrzymanie = długie naciśnięcie. Kliknij przycisk jeszcze raz, żeby wrócić do edycji.');
        renderGrid();
    };

    // Przeciąganie: przenoszenie widżetów i upuszczanie obrazów z dysku
    let dragFrom = null;
    $('grid').addEventListener('dragstart', (e) => { dragFrom = e.target.closest('.cell')?.dataset.key; e.dataTransfer.effectAllowed = 'move'; });
    $('grid').addEventListener('dragover', (e) => { const c = e.target.closest('.cell'); if (!c) return; e.preventDefault(); c.classList.add('drop'); });
    $('grid').addEventListener('dragleave', (e) => { const c = e.target.closest('.cell'); if (c) c.classList.remove('drop'); });
    $('grid').addEventListener('drop', async (e) => {
        e.preventDefault();
        const c = e.target.closest('.cell');
        if (!c) return;
        c.classList.remove('drop');
        const to = c.dataset.key;
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file && /^image\//.test(file.type)) {
            const url = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
            try {
                const name = await deck.saveImageData(url);
                const b = PD.folder().buttons[to] || newWidget('button', to);
                await deck.setButton(PD.folderId, to, { ...b, icon: { type: 'image', value: name, fit: 'contain' } });
                await PD.reload(); renderGrid();
            } catch (err) { PD.toast(PD.errText(err), 'error'); }
            return;
        }
        if (dragFrom && dragFrom !== to) {
            const src = PD.folder().buttons[dragFrom];
            const target = PD.folder().buttons[to];
            const big = (src.w || 1) > 1 || (src.h || 1) > 1 || (target && ((target.w || 1) > 1 || (target.h || 1) > 1));
            if (big && (target || !PD.canPlace(to, src.w || 1, src.h || 1, dragFrom))) { PD.toast('Tu się nie zmieści — przeciągnij na wolne miejsce.', 'error'); return; }
            await deck.moveButton(PD.folderId, dragFrom, to);
            await PD.reload(); renderGrid();
        }
        dragFrom = null;
    });

    // Menu prawego przycisku (jak w Macro Deck)
    let clipWidget = null;
    $('grid').addEventListener('contextmenu', (e) => {
        const c = e.target.closest('.cell');
        if (!c) return;
        e.preventDefault();
        const key = c.dataset.key;
        const b = PD.folder().buttons[key];
        const shown = lastState && lastState.buttons[key];
        if (!b && shown && shown.home) {
            return PD.menu(e.clientX, e.clientY, [['edit-home', `Edytuj (folder „${(PD.data.deck.folders[shown.home] || {}).name}”)`, 'pencil'], ['unpin-home', 'Odepnij', 'pin-off']], async (cmd) => {
                if (cmd === 'edit-home') return PD.go('widget', { folderId: shown.home, key });
                const w = clone(PD.data.deck.folders[shown.home].buttons[key]); delete w.pinned;
                await deck.setButton(shown.home, key, w); await PD.reload(); renderGrid(); PD.toast('Odpięto');
            });
        }
        const items = b ? [
            ['edit', 'Edytuj', 'pencil'], ['run', 'Uruchom', 'play'], null,
            ['pin', b && b.pinned ? 'Odepnij' : 'Przypnij (w każdym folderze)', b && b.pinned ? 'pin-off' : 'pin'], null,
            ['copy', 'Kopiuj', 'copy'], ['cut', 'Wytnij', 'scissors'], ['duplicate', 'Duplikuj', 'copy-plus'], ['paste', 'Wklej tutaj', 'clipboard-paste', '', !clipWidget], null,
            ['delete', 'Usuń', 'trash-2', 'danger'],
        ] : [['add', 'Dodaj widżet', 'plus'], ['paste', 'Wklej tutaj', 'clipboard-paste', '', !clipWidget]];
        PD.menu(e.clientX, e.clientY, items, async (cmd) => {
            if (cmd === 'edit') return PD.go('widget', { folderId: PD.folderId, key });
            if (cmd === 'add') return openWidgetPicker(key);
            if (cmd === 'run') { const res = await deck.testButton(PD.folderId, key, 'press'); PD.toast(res.ok ? 'Wykonano' : res.errors.join(' · '), res.ok ? 'success' : 'error'); return; }
            if (cmd === 'pin') {
                const w = clone(b);
                if (w.pinned) delete w.pinned; else w.pinned = true;
                await deck.setButton(PD.folderId, key, w);
                PD.toast(w.pinned ? 'Przypięto — widżet pokaże się w tym miejscu w każdym folderze profilu' : 'Odpięto');
            }
            if (cmd === 'copy') { clipWidget = clone(b); return PD.toast('Skopiowano widżet'); }
            if (cmd === 'cut') { clipWidget = clone(b); await deck.setButton(PD.folderId, key, null); }
            if (cmd === 'duplicate') { await PD.duplicateWidget(key); return; }
            if (cmd === 'paste' && clipWidget) {
                if (!PD.canPlace(key, clipWidget.w || 1, clipWidget.h || 1, key)) return PD.toast('Tu się nie zmieści.', 'error');
                await deck.setButton(PD.folderId, key, clone(clipWidget));
            }
            if (cmd === 'delete') {
                if (!(await PD.confirm('Usunąć widżet?', 'Widżet razem z jego akcjami zostanie usunięty.'))) return;
                await deck.setButton(PD.folderId, key, null);
            }
            await PD.reload(); renderGrid();
        });
    });
    PD.duplicateWidget = async (key) => {
        const src = PD.folder().buttons[key];
        const { cols, rows } = gridSize();
        for (let i = 0; i < cols * rows; i++) {
            const k = `${i % cols},${Math.floor(i / cols)}`;
            if (PD.canPlace(k, src.w || 1, src.h || 1, null)) {
                await deck.setButton(PD.folderId, k, clone(src));
                await PD.reload();
                if (PD.page === 'deck') renderGrid();
                PD.toast('Zduplikowano');
                return k;
            }
        }
        PD.toast('Brak wolnego miejsca w tym folderze.', 'error');
        return null;
    };

    // ───── Typy widżetów (okno z podglądami) ─────
    const BASE = { bg: '#23222a', color: '', fontSize: 14, labelPos: 'bottom', textAlign: 'center', labelShadow: true };
    const TYPES = [
        { id: 'button', name: 'Przycisk akcji', desc: 'Konfigurowalny przycisk z ikoną, napisem i akcjami', make: () => ({ ...BASE, type: 'button', label: '', icon: { type: 'lucide', value: 'star' }, actions: { press: [] } }), sample: { ...BASE, type: 'button', label: 'Wycisz', icon: { type: 'lucide', value: 'volume-x' } } },
        { id: 'folder', name: 'Folder', desc: 'Przycisk, który otwiera nowy folder z przyciskami', folder: true, sample: { ...BASE, type: 'button', label: 'Gry', icon: { type: 'lucide', value: 'folder' }, bg: '#2f2e38' } },
        { id: 'slider', name: 'Suwak', desc: 'Głośność systemu, mikrofonu, Spotify albo własna zmienna', w: 1, h: 2, make: (w, h) => ({ ...BASE, type: 'slider', w, h, label: 'Głośność', slider: { preset: 'volume', orientation: h > w ? 'vertical' : 'horizontal', showValue: true, min: 0, max: 100, step: 1 }, actions: {} }) },
        { id: 'clock', name: 'Zegar', desc: 'Godzina i data na żywo', w: 2, h: 1, make: (w, h) => ({ ...BASE, type: 'clock', w, h, clock: { seconds: true, date: true }, actions: {} }) },
        { id: 'media', name: 'Odtwarzacz muzyki', desc: 'Okładka, tytuł, postęp i przyciski tego, co gra', w: 2, h: 2, make: (w, h) => ({ ...BASE, type: 'media', w, h, media: { album: false, timeline: true }, actions: {} }) },
        { id: 'gauge', name: 'Wskaźniki', desc: 'CPU, GPU, RAM, temperatury jako pierścienie albo paski', w: 2, h: 2, make: (w, h) => ({ ...BASE, type: 'gauge', w, h, gaugeStyle: 'ring', gauges: [{ var: 'system.cpu', name: 'CPU', max: 100, unit: '%' }, { var: 'system.gpu', name: 'GPU', max: 100, unit: '%' }, { var: 'system.ram', name: 'RAM', max: 100, unit: '%' }], actions: {} }) },
        { id: 'countdown', name: 'Odliczanie', desc: 'Minutnik: naciśnij, żeby odliczyć 5 minut', needs: 'timer', make: () => ({ ...BASE, type: 'button', label: '{timer.remaining}', fontSize: 22, labelPos: 'center', icon: { type: 'none' }, actions: { press: [{ plugin: 'timer', action: 'countdown', config: { mode: 'toggle', minutes: 5, seconds: 0 } }], longPress: [{ plugin: 'timer', action: 'countdown', config: { mode: 'start', minutes: 5, seconds: 0 } }] } }), sample: { ...BASE, type: 'button', label: '05:00', fontSize: 22, labelPos: 'center', icon: { type: 'none' } } },
        { id: 'stopwatch', name: 'Stoper', desc: 'Start i pauza naciśnięciem, przytrzymanie zeruje', needs: 'timer', make: () => ({ ...BASE, type: 'button', label: '{timer.stopwatch}', fontSize: 22, labelPos: 'center', icon: { type: 'none' }, actions: { press: [{ plugin: 'timer', action: 'stopwatch', config: { mode: 'toggle' } }], longPress: [{ plugin: 'timer', action: 'stopwatch', config: { mode: 'reset' } }] } }), sample: { ...BASE, type: 'button', label: '00:00', fontSize: 22, labelPos: 'center', icon: { type: 'none' } } },
        { id: 'weather', name: 'Pogoda', desc: 'Temperatura i opis pogody dla Twojego miasta', needs: 'weather', make: () => ({ ...BASE, type: 'button', label: '{weather.temp}°\n{weather.desc}', fontSize: 15, labelPos: 'bottom', icon: { type: 'lucide', value: 'cloud-sun' }, actions: { press: [] } }), sample: { ...BASE, type: 'button', label: '21°\nPochmurno', fontSize: 15, icon: { type: 'lucide', value: 'cloud-sun' } } },
        { id: 'spotify', name: 'Spotify', desc: 'Przycisk graj / pauza, który pokazuje stan Spotify', needs: 'spotify', make: () => ({ ...BASE, type: 'button', label: '', icon: { type: 'lucide', value: 'play', color: '#1db954' }, stateVar: 'spotify.playing', on: { icon: { type: 'lucide', value: 'pause', color: '#1db954' } }, actions: { press: [{ plugin: 'spotify', action: 'play-pause', config: { mode: 'toggle' } }] } }), sample: { ...BASE, type: 'button', label: 'Spotify', icon: { type: 'lucide', value: 'play', color: '#1db954' } } },
        { id: 'mic', name: 'Wyciszenie mikrofonu', desc: 'Czerwony, gdy mikrofon jest wyciszony', make: () => ({ ...BASE, type: 'button', label: 'Mikrofon', icon: { type: 'lucide', value: 'mic' }, stateVar: 'media.micMuted', on: { bg: '#ff5d73', icon: { type: 'lucide', value: 'mic-off' }, label: 'Wyciszony' }, actions: { press: [{ plugin: 'media', action: 'mic', config: { mode: 'toggle' } }] } }), sample: { ...BASE, type: 'button', label: 'Wyciszony', bg: '#ff5d73', icon: { type: 'lucide', value: 'mic-off' } } },
    ];
    PD.WIDGET_TYPES = TYPES;
    function newWidget(type, key) {
        const t = TYPES.find((x) => x.id === type) || TYPES[0];
        const [w, h] = fitSize(key, t.w || 1, t.h || 1);
        return t.make ? t.make(w, h) : TYPES[0].make();
    }
    let pickKey = null;
    async function openWidgetPicker(key) {
        pickKey = key;
        $('wtSearch').value = '';
        PitayaUI.openModal('modalWidgetType');
        await renderWidgetPicker();
        setTimeout(() => $('wtSearch').focus(), 50);
    }
    PD.openWidgetPicker = openWidgetPicker;
    async function renderWidgetPicker() {
        const q = $('wtSearch').value.trim().toLowerCase();
        const fav = PD.favList('widgets');
        const list = TYPES.filter((t) => !q || `${t.name} ${t.desc}`.toLowerCase().includes(q)).sort((a, b) => (fav.includes(b.id) ? 1 : 0) - (fav.includes(a.id) ? 1 : 0));
        $('wtGrid').innerHTML = list.map((t) => {
            const missing = t.needs && !PD.plugin(t.needs);
            return `<button class="wt-card" data-wt="${t.id}"><span class="fav-star${fav.includes(t.id) ? ' on' : ''}" data-favw="${t.id}" title="${fav.includes(t.id) ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}">${PD.icon('star')}</span><div class="wt-prev"><div class="wt-tile" data-prev="${t.id}" style="--w:${t.w || 1};--h:${t.h || 1}"></div></div>
                <div class="wt-info"><b>${esc(t.name)}</b><small>${esc(t.desc)}</small>${missing ? `<span class="pill upd">Wymaga dodatku: ${esc({ timer: 'Minutnik', weather: 'Pogoda', spotify: 'Spotify' }[t.needs] || t.needs)}</span>` : ''}</div></button>`;
        }).join('') || '<div class="empty-note">Nic nie znaleziono.</div>';
        // Podgląd na żywo (prawdziwe CPU, to co gra, godzina…)
        for (const t of list) {
            const el = $('wtGrid').querySelector(`[data-prev="${t.id}"]`);
            if (!el) continue;
            const sample = t.sample || (t.make ? t.make(t.w || 1, t.h || 1) : null);
            const rendered = PD.fixImage(await deck.render(sample));
            const unit = (t.w || 1) > 1 || (t.h || 1) > 1 ? 58 : 76;
            R.paint(el, rendered, unit);
            el.style.width = `${unit * (t.w || 1) + 8 * ((t.w || 1) - 1)}px`;
            el.style.height = `${unit * (t.h || 1) + 8 * ((t.h || 1) - 1)}px`;
            el.style.setProperty('--pd-radius', '16px');
        }
        R.tickClocks($('wtGrid'));
    }
    $('wtSearch').oninput = renderWidgetPicker;
    $('wtGrid').onclick = async (e) => {
        const fs = e.target.closest('[data-favw]');
        if (fs) { e.stopPropagation(); PD.favToggle('widgets', fs.dataset.favw); return renderWidgetPicker(); }
        const b = e.target.closest('[data-wt]');
        if (!b) return;
        const t = TYPES.find((x) => x.id === b.dataset.wt);
        if (t.needs && !PD.plugin(t.needs)) {
            PitayaUI.closeModal('modalWidgetType');
            return PD.go('store', t.needs);
        }
        PitayaUI.closeModal('modalWidgetType');
        let w;
        if (t.folder) {
            const name = await PD.ask('Nowy folder', '', 'np. Sceny OBS');
            if (!name) return;
            const f = await deck.addFolder(PD.folderId, name);
            w = { ...BASE, type: 'button', label: name, icon: { type: 'lucide', value: 'folder' }, bg: '#2f2e38', actions: { press: [{ plugin: 'deck', action: 'open-folder', config: { folder: f.id } }] } };
        } else w = newWidget(t.id, pickKey);
        await deck.setButton(PD.folderId, pickKey, w);
        await PD.reload();
        PD.go('widget', { folderId: PD.folderId, key: pickKey, fresh: true });
    };

    // ───── Ustawienia siatki (menu „⋮”) ─────
    $('btnGridMenu').onclick = (e) => { e.stopPropagation(); $('gridPop').hidden = !$('gridPop').hidden; if (!$('gridPop').hidden) fillGridPop(); };
    addEventListener('click', (e) => { if (!e.target.closest('.pop-wrap')) $('gridPop').hidden = true; });
    function fillGridPop() {
        const p = PD.profile(), f = PD.folder();
        const { cols, rows } = gridSize();
        $('gpCols').value = cols; $('gpColsVal').textContent = `${cols}${f.cols ? '' : ' · jak profil'}`;
        $('gpRows').value = rows; $('gpRowsVal').textContent = `${rows}${f.rows ? '' : ' · jak profil'}`;
        $('gpGap').value = p.spacing ?? 10; $('gpGapVal').textContent = `${p.spacing ?? 10}%`;
        $('gpRad').value = p.radius ?? 22; $('gpRadVal').textContent = `${p.radius ?? 22}%`;
        $('gpEmpty').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === (p.emptyCells || 'visible')));
        PD.colorRow($('gpBg'), ['', '#121116', '#000000', '#17161c', '#1e1b2e', '#2a0f1f', '#0f1d2a'], p.background || '', async (c) => { await deck.updateProfile(p.id, { background: c }); await PD.reload(); renderGrid(); }, true);
    }
    let gpTimer = null;
    const gpChange = (fn) => { clearTimeout(gpTimer); gpTimer = setTimeout(async () => { await fn(); await PD.reload(); renderGrid(); fillGridPop(); }, 150); };
    $('gpCols').oninput = () => { $('gpColsVal').textContent = $('gpCols').value; gpChange(() => deck.folderGrid(PD.folderId, $('gpCols').value, PD.folder().rows || '')); };
    $('gpRows').oninput = () => { $('gpRowsVal').textContent = $('gpRows').value; gpChange(() => deck.folderGrid(PD.folderId, PD.folder().cols || '', $('gpRows').value)); };
    $('gridPop').addEventListener('click', (e) => {
        const r = e.target.closest('[data-reset]');
        if (!r) return;
        const f = PD.folder();
        gpChange(() => deck.folderGrid(PD.folderId, r.dataset.reset === 'cols' ? '' : f.cols || '', r.dataset.reset === 'rows' ? '' : f.rows || ''));
    });
    $('gpGap').oninput = () => { $('gpGapVal').textContent = `${$('gpGap').value}%`; gpChange(() => deck.updateProfile(PD.profileId, { spacing: $('gpGap').value })); };
    $('gpRad').oninput = () => { $('gpRadVal').textContent = `${$('gpRad').value}%`; gpChange(() => deck.updateProfile(PD.profileId, { radius: $('gpRad').value })); };
    $('gpEmpty').onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) gpChange(() => deck.updateProfile(PD.profileId, { emptyCells: b.dataset.v })); };

    // ───── Drzewo folderów ─────
    const favs = () => PD.profile().favorites || [];
    function renderTree() {
        const out = [];
        const kids = (fid) => Object.values(PD.data.deck.folders).filter((x) => x.parent === fid).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
        const star = (fid) => `<button class="ti-star${favs().includes(fid) ? ' on' : ''}" data-fav="${esc(fid)}" title="${favs().includes(fid) ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}">${PD.icon('star')}</button>`;
        const item = (f, depth, has) => `<div class="tree-item${f.id === PD.folderId ? ' active' : ''}" data-folder="${esc(f.id)}" style="padding-left:${8 + depth * 16}px">
                <span class="ti-chev">${has ? PD.icon('chevron-down') : ''}</span>${PD.icon(f.parent ? 'folder' : 'house')}<span class="ti-name">${esc(f.name)}</span>${star(f.id)}</div>`;
        // Ulubione foldery na górze (jak w Macro Deck)
        const fav = favs().map((id) => PD.data.deck.folders[id]).filter((f) => f && PD.inProfile(f.id));
        if (fav.length) {
            out.push('<div class="tree-sub">ULUBIONE</div>');
            fav.forEach((f) => out.push(item(f, 0, false)));
            out.push('<div class="tree-sub">WSZYSTKIE</div>');
        }
        const walk = (fid, depth) => {
            const f = PD.data.deck.folders[fid];
            if (!f) return;
            const k = kids(fid);
            out.push(item(f, depth, k.length));
            k.forEach((c) => walk(c.id, depth + 1));
        };
        walk(PD.profile().root, 0);
        $('tree').innerHTML = out.join('');
    }
    PD.renderTree = renderTree;
    $('tree').addEventListener('click', async (e) => {
        const st = e.target.closest('[data-fav]');
        if (st) {
            e.stopPropagation();
            const id = st.dataset.fav;
            const list = favs().includes(id) ? favs().filter((x) => x !== id) : [...favs(), id];
            await deck.updateProfile(PD.profileId, { favorites: list });
            await PD.reload();
            renderTree();
            return PD.toast(list.includes(id) ? 'Dodano do ulubionych' : 'Usunięto z ulubionych');
        }
        const el = e.target.closest('[data-folder]');
        if (!el) return;
        PD.folderId = el.dataset.folder; PD.saveLast();
        renderTree();
        renderGrid();
    });
    $('tree').addEventListener('dblclick', (e) => { const el = e.target.closest('[data-folder]'); if (el) renameFolder(el.dataset.folder); });
    $('tree').addEventListener('contextmenu', (e) => {
        const el = e.target.closest('[data-folder]');
        if (!el) return;
        e.preventDefault();
        const fid = el.dataset.folder;
        const f = PD.data.deck.folders[fid];
        PD.menu(e.clientX, e.clientY, [
            ['open', 'Otwórz', 'folder-open'], ['sub', 'Nowy folder w środku', 'folder-plus'], ['rename', 'Zmień nazwę', 'pencil'],
            null, ['delete', 'Usuń', 'trash-2', 'danger', !f.parent],
        ], async (cmd) => {
            if (cmd === 'open') { PD.folderId = fid; PD.saveLast(); renderTree(); return renderGrid(); }
            if (cmd === 'sub') return addFolder(fid);
            if (cmd === 'rename') return renameFolder(fid);
            if (cmd === 'delete') {
                if (!(await PD.confirm('Usunąć folder?', `Folder „${f.name}” i wszystko, co jest w środku, zostanie usunięte.`))) return;
                if (PD.folderId === fid || !PD.inProfile(PD.folderId)) PD.folderId = f.parent;
                await deck.deleteFolder(fid);
                await PD.reload(); renderTree(); renderGrid();
            }
        });
    });
    async function addFolder(parent) {
        const name = await PD.ask('Nowy folder', '', 'np. Sceny OBS');
        if (!name) return;
        const f = await deck.addFolder(parent, name);
        await PD.reload();
        PD.folderId = f.id;
        renderTree(); renderGrid();
        PD.toast('Folder dodany. Dodaj w innym folderze przycisk „Folder”, żeby go otwierać z telefonu.');
    }
    async function renameFolder(fid) {
        const name = await PD.ask('Nazwa folderu', PD.data.deck.folders[fid].name);
        if (name) { await deck.renameFolder(fid, name); await PD.reload(); renderTree(); renderGrid(); }
    }
    $('btnFolderAdd').onclick = () => addFolder(PD.folderId);
    // Panel folderów można schować na bok (zapamiętane)
    function setFoldersHidden(hide) {
        document.body.classList.toggle('folders-hidden', hide);
        const b = $('btnFoldToggle');
        b.title = hide ? 'Pokaż foldery' : 'Schowaj foldery';
        b.dataset.i = hide ? 'panel-right-open' : 'panel-right-close';
        delete b.dataset.iDone;
        b.innerHTML = '';
        PD.fillIcons(b.parentElement);
        try { localStorage.setItem('pd-folders-hidden', hide ? '1' : '0'); } catch {}
    }
    $('btnFoldToggle').onclick = () => setFoldersHidden(!document.body.classList.contains('folders-hidden'));
    try { if (localStorage.getItem('pd-folders-hidden') === '1') document.body.classList.add('folders-hidden'); } catch {}
    setTimeout(() => { if (document.body.classList.contains('folders-hidden')) setFoldersHidden(true); }, 50);

    // ───── Strona ─────
    PD.hooks.deck = {
        show: async () => {
            await PD.reload();
            renderTree();
            requestAnimationFrame(renderGrid);
        },
    };
    // Zmiany zmiennych: odśwież tylko wygląd widżetów
    const prevVars = PD.hooks.onVars;
    PD.hooks.onVars = async () => {
        if (prevVars) prevVars();
        if (PD.page !== 'deck') return;
        const state = await deck.preview(PD.folderId);
        for (const cell of $('grid').children) {
            const b = state.buttons[cell.dataset.key];
            if (!b) continue;
            const el = cell.firstElementChild;
            R.paint(el, PD.fixImage(b), cellPx);
            if (b.type === 'media' && (b.w || 1) < 2) el.classList.add('narrow');
        }
    };
    PD.newWidget = newWidget;
})();
