// ═══════ PITAYA DECK — EDYTOR: STRONA EDYCJI WIDŻETU ═══════
// Jak w Macro Deck 3: wygląd po lewej, akcje (wyzwalacze + bloki) po prawej, tryb Wizualny / JSON.
(function () {
    const { $, esc, clone, R } = PD;
    const TYPES = { button: 'Przycisk akcji', slider: 'Suwak', clock: 'Zegar', gauge: 'Wskaźniki', media: 'Odtwarzacz muzyki' };
    const TRIGGERS = {
        press: ['Krótkie naciśnięcie', 'Wykonuje się po dotknięciu przycisku.'],
        longPress: ['Długie naciśnięcie', 'Po przytrzymaniu przez pół sekundy. Krótkie naciśnięcie czeka wtedy na puszczenie.'],
        doublePress: ['Podwójne dotknięcie', 'Dwa szybkie dotknięcia. Krótkie naciśnięcie czeka chwilę na drugie.'],
        touchStart: ['Początek dotyku', 'Od razu, gdy palec dotknie przycisku — np. „trzymaj, żeby mówić”.'],
        release: ['Koniec dotyku', 'Gdy palec puści przycisk.'],
        change: ['Zmiana wartości', 'Przy każdym ruchu suwaka. Wartość jest w zmiennej {value}.'],
        stateChange: ['Zmiana stanu', 'Gdy przycisk zmieni stan. Nazwa stanu jest w {state}.'],
    };
    PD.TRIGGERS = TRIGGERS;
    const PL = {
        mikrofon: 'mic', głośność: 'volume', glosnosc: 'volume', wycisz: 'volume-x', dźwięk: 'volume', muzyka: 'music', graj: 'play', pauza: 'pause', następny: 'skip-forward', poprzedni: 'skip-back',
        losowo: 'shuffle', powtarzaj: 'repeat', folder: 'folder', dom: 'house', wstecz: 'arrow-left', ustawienia: 'settings', kamera: 'camera', wideo: 'video', nagrywanie: 'circle-dot', transmisja: 'radio',
        scena: 'clapperboard', światło: 'lightbulb', żarówka: 'lightbulb', klawiatura: 'keyboard', terminal: 'terminal', internet: 'globe', zasilanie: 'power', wyłącz: 'power', blokada: 'lock', procesor: 'cpu',
        pamięć: 'memory-stick', czat: 'message-circle', gwiazdka: 'star', serce: 'heart', błyskawica: 'zap', minutnik: 'timer', zegar: 'clock', zamknij: 'x', gra: 'gamepad', pogoda: 'cloud-sun', bateria: 'battery',
        telefon: 'smartphone', komputer: 'monitor', ekran: 'monitor', serwer: 'server', kod: 'code', hasło: 'key-round', klucz: 'key', użytkownik: 'user', kosz: 'trash', pobierz: 'download', wyślij: 'send',
        link: 'link', kopiuj: 'copy', kalendarz: 'calendar', dzwonek: 'bell', szukaj: 'search', obraz: 'image', film: 'film', słuchawki: 'headphones', głośnik: 'speaker', plik: 'file', chmura: 'cloud', wifi: 'wifi',
    };
    const EMOJIS = ['🎮', '🎙️', '🎧', '🔴', '🎬', '📷', '💡', '🔊', '🔇', '⏯️', '⏭️', '⏮️', '📁', '🏠', '⭐', '❤️', '🔥', '✅', '❌', '⚡', '💬', '🎵', '🌐', '🔒', '☕', '🎉', '👋', '😂', '🐉', '🍓', '🌙', '⚙️'];

    let folderId = null, key = null;
    let phase = 'press';
    let lookTab = 'label';
    let lookState = null;       // indeks stanu, którego wygląd edytujemy (null = podstawowy)
    let saveTimer = null, pending = null;
    let blockEd = null;

    const W = () => PD.data.deck.folders[folderId] && PD.data.deck.folders[folderId].buttons[key];
    // ───── Zapis (automatyczny, jak w Macro Deck) ─────
    function update(fn, { rerender = false, look = false } = {}) {
        const b = clone(W() || {});
        fn(b);
        PD.data.deck.folders[folderId].buttons[key] = b;
        pending = { folderId, key, button: b };
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flush, 250);
        refreshPreview();
        if (rerender) renderAll();
        else if (look) renderLook();
    }
    async function flush() {
        clearTimeout(saveTimer);
        if (!pending) return;
        const p = pending; pending = null;
        await deck.setButton(p.folderId, p.key, p.button);
    }
    PD.flushWidget = flush;

    const getLook = (field) => {
        const b = W();
        if (lookState !== null && b.states && b.states[lookState]) {
            const v = (b.states[lookState].look || {})[field];
            if (v !== undefined && v !== '') return v;
        }
        return b[field];
    };
    const setLook = (field, value, opts) => update((x) => {
        if (lookState !== null && x.states && x.states[lookState]) x.states[lookState].look = { ...(x.states[lookState].look || {}), [field]: value };
        else x[field] = value;
    }, opts);
    function previewButton() {
        const b = W();
        if (lookState === 'on') { const merged = { ...b, stateVar: undefined }; for (const [k, v] of Object.entries(b.on || {})) if (v !== '' && v !== undefined) merged[k] = v; return merged; }
        if (lookState === null || !b.states || !b.states[lookState]) return b;
        const merged = { ...b, states: undefined, stateSource: undefined, stateRules: undefined, stateVar: undefined };
        for (const [k, v] of Object.entries(b.states[lookState].look || {})) if (v !== '' && v !== undefined) merged[k] = v;
        return merged;
    }
    let pvTimer = null;
    function refreshPreview() {
        clearTimeout(pvTimer);
        pvTimer = setTimeout(async () => {
            if (!W()) return;
            const rendered = PD.fixImage(await deck.render(previewButton(), lookState === null ? folderId : undefined, key));
            const box = $('wePreview');
            box.innerHTML = '<div class="we-tile"></div>';
            const tile = box.firstChild;
            const w = Math.max(1, rendered.w || 1), h = Math.max(1, rendered.h || 1);
            const unit = Math.min(150, 300 / Math.max(w, h));
            R.paint(tile, rendered, unit);
            tile.style.width = `${Math.round(unit * w)}px`;
            tile.style.height = `${Math.round(unit * h)}px`;
            tile.style.setProperty('--pd-radius', `${Math.round(unit * 0.22)}px`);
            R.tickClocks(box);
        }, 60);
    }
    setInterval(() => { if (PD.page === 'widget') R.tickClocks($('wePreview')); }, 1000);

    // ───── Lewa kolumna: wygląd ─────
    function seg(id, opts, cur) { return `<div class="seg small" data-seg="${id}">${opts.map(([v, l]) => `<button data-v="${v}" class="${v === cur ? 'active' : ''}">${l}</button>`).join('')}</div>`; }
    function renderLook() {
        const b = W();
        const type = b.type || 'button';
        const body = $('weLookBody');
        let h = '';
        // Rozmiar
        h += `<div class="lk-sec"><div class="lk-title">Rozmiar</div><div class="size-row"><input class="m-input" type="number" min="1" max="16" id="lkW" value="${b.w || 1}"><span>×</span><input class="m-input" type="number" min="1" max="12" id="lkH" value="${b.h || 1}"><span class="m-small">pól</span></div>
            <label class="toggle-row"><span>Przypięty — widoczny w tym miejscu w każdym folderze</span><input type="checkbox" class="switch" id="lkPin" ${b.pinned ? 'checked' : ''}></label></div>`;
        if (type === 'button') {
            const multi = Array.isArray(b.states) && b.states.length;
            const mode = multi ? 'multi' : b.stateVar ? 'toggle' : 'single';
            h += `<div class="lk-sec"><div class="lk-title">Stan</div>${seg('stateMode', [['single', 'Pojedynczy'], ['toggle', 'Ze zmiennej'], ['multi', 'Wiele stanów']], mode)}`;
            if (mode === 'toggle') {
                h += `<div class="m-field"><span class="m-label">Zmienna stanu</span><button class="m-btn small block var-btn" id="lkStateVar">${b.stateVar ? `{${esc(b.stateVar)}}` : 'Wybierz zmienną…'}</button></div>
                    <div class="state-chips"><button data-ls="-1" class="${lookState === null ? 'active' : ''}">Wyłączony</button><button data-ls="on" class="${lookState === 'on' ? 'active' : ''}">Włączony</button></div>`;
            }
            if (mode === 'multi') {
                const src = b.stateSource || 'cycle';
                h += `<div class="state-chips">${b.states.map((s, i) => `<button data-ls="${i}" class="${lookState === i ? 'active' : ''}">${esc(s.name)}</button>`).join('')}<button data-ls-add title="Dodaj stan">＋</button></div>
                    <div class="m-small">Wybierz stan, żeby edytować jego wygląd. ${lookState === null ? 'Teraz edytujesz wygląd wspólny.' : ''}</div>
                    ${lookState !== null && b.states[lookState] ? `<div class="field-row"><input class="m-input" id="lkStateName" value="${esc(b.states[lookState].name)}"><button class="m-btn small icon-only" id="lkStateDel" title="Usuń stan">${PD.icon('trash-2')}</button><button class="m-btn small" id="lkStateBase">Wspólny</button></div>` : ''}
                    <div class="m-field"><span class="m-label">Co zmienia stan</span>${seg('stateSource', [['cycle', 'Naciśnięcie'], ['variable', 'Zmienne'], ['manual', 'Akcja']], src)}</div>`;
                if (src === 'variable') {
                    h += `<div class="lk-rules">${(b.stateRules || []).map((r, i) => `<div class="rule2">
                        <button class="m-btn small var-btn" data-rv="${i}">${r.var ? `{${esc(r.var)}}` : 'zmienna…'}</button>
                        <select class="m-select" data-rop="${i}">${['==', '!=', '>', '<', '>=', '<=', 'on', 'off', 'contains'].map((o) => `<option value="${o}" ${o === (r.op || '==') ? 'selected' : ''}>${{ on: 'wł.', off: 'wył.', contains: 'zawiera' }[o] || o}</option>`).join('')}</select>
                        <input class="m-input" data-rval="${i}" value="${esc(r.value ?? '')}" placeholder="wartość">
                        <select class="m-select" data-rst="${i}">${b.states.map((s) => `<option value="${esc(s.id)}" ${s.id === r.state ? 'selected' : ''}>→ ${esc(s.name)}</option>`).join('')}</select>
                        <button class="tool" data-rdel="${i}">${PD.icon('x')}</button></div>`).join('')}
                        <button class="chip" id="lkRuleAdd">＋ Reguła</button></div>`;
                }
            }
            h += '</div>';
        }
        if (type === 'button' || type === 'slider') {
            h += `<div class="lk-sec"><div class="lk-title">Wygląd${lookState !== null ? ` · stan „${esc(lookState === 'on' ? 'Włączony' : (b.states && b.states[lookState] || {}).name || '')}”` : ''}</div>
                ${seg('lookTab', [['label', 'Etykieta'], ['bg', 'Tło'], ['border', 'Obramowanie']], lookTab)}<div id="lkTab"></div></div>`;
        } else {
            h += `<div class="lk-sec"><div class="lk-title">Wygląd</div><div class="m-field"><span class="m-label">Kolor tła</span><div id="lkBg"></div></div></div>`;
        }
        h += widgetSettingsHtml(b);
        body.innerHTML = h;
        if (type === 'button' || type === 'slider') renderLookTab();
        else PD.colorRow($('lkBg'), PD.PALETTE, getLook('bg') || '#23222a', (c) => setLook('bg', c));
        wireLook();
        PD.fillIcons(body);
    }
    // „Włączony” wygląd przycisku ze zmienną to obiekt b.on (osobno od stanów)
    const onLook = () => lookState === 'on';
    const lget = (f) => (onLook() ? ((W().on || {})[f] ?? W()[f]) : getLook(f));
    const lset = (f, v, opts) => (onLook() ? update((x) => { x.on = { ...(x.on || {}), [f]: v }; }, opts) : setLook(f, v, opts));

    function renderLookTab() {
        const el = $('lkTab');
        const b = W();
        if (lookTab === 'label') {
            const pos = lget('labelPos') || 'bottom';
            el.innerHTML = `<div class="m-field"><span class="m-label">Etykieta</span><div class="ta-wrap"><textarea class="m-input" id="lkLabel" rows="3" placeholder="Etykieta przycisku">${esc(lget('label') || '')}</textarea><button class="ta-var" id="lkInsVar" title="Wstaw zmienną">{{ }}</button></div></div>
                <div class="m-field"><span class="m-label">Rozmiar napisu <b id="lkFontV">${lget('fontSize') || 14}px</b></span><input type="range" id="lkFont" min="8" max="48" value="${lget('fontSize') || 14}"></div>
                <div class="two"><div class="m-field"><span class="m-label">Wyrównanie</span>${seg('align', [['left', PD.icon('align-left')], ['center', PD.icon('align-center')], ['right', PD.icon('align-right')]], lget('textAlign') || 'center')}</div>
                <div class="m-field"><span class="m-label">Pozycja</span>${seg('pos', [['top', PD.icon('panel-top')], ['center', PD.icon('square')], ['bottom', PD.icon('panel-bottom')], ['hidden', PD.icon('eye-off')]], pos)}</div></div>
                <label class="toggle-row"><span>Cień etykiety</span><input type="checkbox" class="switch" id="lkShadow" ${lget('labelShadow') !== false ? 'checked' : ''}></label>
                <label class="toggle-row"><span>Obrys etykiety</span><input type="checkbox" class="switch" id="lkOutline" ${lget('labelOutline') ? 'checked' : ''}></label>
                <div class="m-field"><span class="m-label">Kolor etykiety</span><div id="lkFg"></div></div>`;
            PD.colorRow($('lkFg'), ['', '#ffffff', '#17161c', '#ff4fa6', '#ffd166', '#4cc38a', '#4ea8ff'], lget('color') || '', (c) => lset('color', c));
        } else if (lookTab === 'bg') {
            const icon = lget('icon') || { type: 'none' };
            el.innerHTML = `<div class="m-field"><span class="m-label">Kolor tła</span><div id="lkBg"></div></div>
                ${b.type === 'slider' ? '' : `<div class="m-field"><span class="m-label">Ikona</span><div class="icon-row"><span class="icon-mini" id="lkIconMini"></span><button class="m-btn small" id="lkIconPick">Zmień ikonę</button><button class="m-btn small" id="lkIconDel" ${icon.type === 'none' ? 'disabled' : ''}>Usuń</button></div></div>
                ${icon.type === 'lucide' ? '<div class="m-field"><span class="m-label">Kolor ikony</span><div id="lkIconColor"></div></div>' : ''}
                ${icon.type !== 'none' ? `<div class="m-field"><span class="m-label">Wyświetlanie</span>${seg('fit', [['contain', 'Dopasuj'], ['cover', 'Wypełnij']], icon.fit || (icon.fill ? 'cover' : 'contain'))}</div>
                <div class="m-field"><span class="m-label">Powiększenie <b id="lkZoomV">${icon.zoom || 100}%</b></span><input type="range" id="lkZoom" min="30" max="250" value="${icon.zoom || 100}"></div>
                <div class="m-field"><span class="m-label">Przezroczystość <b id="lkOpV">${icon.opacity ?? 100}%</b></span><input type="range" id="lkOp" min="5" max="100" value="${icon.opacity ?? 100}"></div>` : ''}`}`;
            PD.colorRow($('lkBg'), PD.PALETTE, lget('bg') || '#23222a', (c) => lset('bg', c));
            if ($('lkIconColor')) PD.colorRow($('lkIconColor'), ['', '#ffffff', '#ff4fa6', '#ffd166', '#4cc38a', '#4ea8ff', '#c77dff', '#1db954', '#17161c'], icon.color || '', (c) => lset('icon', { ...(lget('icon') || {}), color: c }), true);
            if ($('lkIconMini')) {
                const mini = $('lkIconMini');
                if (icon.type === 'lucide' && PD.lucide.icons[icon.value]) mini.innerHTML = R.lucide(PD.lucide.icons[icon.value]);
                else if (icon.type === 'emoji') mini.textContent = icon.value;
                else if (icon.type === 'image') mini.innerHTML = `<img src="${esc(PD.imgBase())}/img/${encodeURIComponent(icon.value)}" alt="">`;
                else mini.textContent = '—';
            }
        } else {
            const border = lget('border');
            el.innerHTML = `<label class="toggle-row"><span>Obramowanie</span><input type="checkbox" class="switch" id="lkBorder" ${border && border.width ? 'checked' : ''}></label>
                ${border && border.width ? `<div class="m-field"><span class="m-label">Grubość <b id="lkBwV">${border.width}px</b></span><input type="range" id="lkBw" min="1" max="8" value="${border.width}"></div><div class="m-field"><span class="m-label">Kolor</span><div id="lkBc"></div></div>` : ''}`;
            if ($('lkBc')) PD.colorRow($('lkBc'), ['#ff4fa6', '#ffffff', '#ffd166', '#4cc38a', '#4ea8ff', '#ef4444', '#a855f7'], border.color || '#ff4fa6', (c) => lset('border', { ...(lget('border') || { width: 2 }), color: c }), true);
        }
        PD.fillIcons(el);
    }

    function widgetSettingsHtml(b) {
        const type = b.type || 'button';
        if (type === 'slider') {
            const s = b.slider || {};
            return `<div class="lk-sec"><div class="lk-title">Suwak</div>
                <div class="m-field"><span class="m-label">Steruje</span><select class="m-select" id="wsPreset">
                  <option value="volume">Głośność systemu</option><option value="mic">Głośność mikrofonu</option><option value="player">Odtwarzacz, który gra (MPRIS)</option><option value="custom">Własną zmienną i akcjami</option></select></div>
                ${s.preset === 'player' ? `<div class="m-field"><span class="m-label">Odtwarzacz (puste = ten, który gra)</span><input class="m-input" id="wsPlayer" value="${esc(s.player || '')}" placeholder="spotify"></div>` : ''}
                ${s.preset === 'custom' ? `<div class="m-field"><span class="m-label">Pokazuje wartość zmiennej</span><button class="m-btn small block var-btn" id="wsVar">${s.var ? `{${esc(s.var)}}` : 'Wybierz zmienną…'}</button></div>
                  <div class="two"><div class="m-field"><span class="m-label">Min</span><input class="m-input" type="number" id="wsMin" value="${s.min ?? 0}"></div><div class="m-field"><span class="m-label">Max</span><input class="m-input" type="number" id="wsMax" value="${s.max ?? 100}"></div></div>
                  <div class="m-small">Co robi przesuwanie, ustawisz po prawej w wyzwalaczu „Zmiana wartości”.</div>` : ''}
                <label class="toggle-row"><span>Pokazuj wartość</span><input type="checkbox" class="switch" id="wsShow" ${s.showValue !== false ? 'checked' : ''}></label></div>`;
        }
        if (type === 'clock') {
            const c = b.clock || {};
            return `<div class="lk-sec"><div class="lk-title">Zegar</div>
                <label class="toggle-row"><span>Sekundy</span><input type="checkbox" class="switch" data-clk="seconds" ${c.seconds ? 'checked' : ''}></label>
                <label class="toggle-row"><span>Data</span><input type="checkbox" class="switch" data-clk="date" ${c.date !== false ? 'checked' : ''}></label>
                <label class="toggle-row"><span>Zegar 12-godzinny</span><input type="checkbox" class="switch" data-clk="h12" ${c.h12 ? 'checked' : ''}></label></div>`;
        }
        if (type === 'media') {
            const m = b.media || {};
            return `<div class="lk-sec"><div class="lk-title">Odtwarzacz</div>
                <div class="m-field"><span class="m-label">Pokazuje</span><select class="m-select" id="wsMediaPlayer"><option value="">Ten, który właśnie gra</option>${m.player ? `<option value="${esc(m.player)}">${esc(m.player)}</option>` : ''}</select></div>
                <label class="toggle-row"><span>Pokazuj album</span><input type="checkbox" class="switch" data-med="album" ${m.album ? 'checked' : ''}></label>
                <label class="toggle-row"><span>Pasek postępu</span><input type="checkbox" class="switch" data-med="timeline" ${m.timeline !== false ? 'checked' : ''}></label>
                <div class="m-small">Przyciski widżetu sterują wybranym odtwarzaczem.</div></div>`;
        }
        if (type === 'gauge') {
            const list = b.gauges || [];
            return `<div class="lk-sec"><div class="lk-title">Wskaźniki</div>${seg('gstyle', [['ring', 'Pierścienie'], ['bar', 'Paski']], b.gaugeStyle || 'ring')}
                ${list.map((g, i) => `<div class="g-row" data-g="${i}"><button class="m-btn small var-btn" data-gv="${i}">${g.var ? `{${esc(g.var)}}` : 'zmienna…'}</button>
                  <input class="m-input" data-gf="name" value="${esc(g.name)}" placeholder="Nazwa"><input class="m-input sm" type="number" data-gf="max" value="${g.max ?? 100}" title="Maksimum"><input class="m-input sm" data-gf="unit" value="${esc(g.unit ?? '%')}" title="Jednostka"><button class="tool" data-gdel="${i}">${PD.icon('x')}</button></div>`).join('')}
                ${list.length < 4 ? '<button class="chip" id="wsGAdd">＋ Wskaźnik</button>' : ''}</div>`;
        }
        return '';
    }

    function wireLook() {
        const body = $('weLookBody');
        const b = W();
        const segHandler = (name, fn) => { const s = body.querySelector(`[data-seg="${name}"]`); if (s) s.onclick = (e) => { const t = e.target.closest('[data-v]'); if (t) fn(t.dataset.v); }; };
        // Rozmiar
        const resize = async () => {
            const w = Math.max(1, parseInt($('lkW').value, 10) || 1), h = Math.max(1, parseInt($('lkH').value, 10) || 1);
            const prevFolder = PD.folderId; PD.folderId = folderId;
            const [x0, y0] = key.split(',').map(Number);
            // Najpierw w miejscu; gdy przy krawędzi brakuje miejsca, przesuwamy widżet w lewo / w górę
            let target = null;
            for (let dy = 0; dy < h && !target; dy++) for (let dx = 0; dx < w && !target; dx++) {
                const k = `${x0 - dx},${y0 - dy}`;
                if (x0 - dx >= 0 && y0 - dy >= 0 && PD.canPlace(k, w, h, key)) target = k;
            }
            PD.folderId = prevFolder;
            if (!target) { PD.toast('Brak miejsca na taki rozmiar — zwolnij pola obok albo zmniejsz widżet.', 'error'); $('lkW').value = b.w || 1; $('lkH').value = b.h || 1; return; }
            if (target === key) return update((x) => { x.w = w; x.h = h; if (x.type === 'slider' && x.slider) x.slider.orientation = h > w ? 'vertical' : 'horizontal'; }, { rerender: true });
            await flush();
            const moved = { ...clone(W()), w, h };
            if (moved.type === 'slider' && moved.slider) moved.slider.orientation = h > w ? 'vertical' : 'horizontal';
            await deck.setButton(folderId, key, null);
            await deck.setButton(folderId, target, moved);
            delete PD.data.deck.folders[folderId].buttons[key];
            PD.data.deck.folders[folderId].buttons[target] = moved;
            key = target;
            PD.saveLast({ page: 'widget', arg: { folderId, key } });
            renderAll();
        };
        $('lkPin').onchange = async () => {
            update((x) => { if ($('lkPin').checked) x.pinned = true; else delete x.pinned; });
            await flush();
            if ($('lkPin').checked) PD.pinFlow(folderId, key); else PD.toast('Odpięto');
        };
        $('lkW').onchange = resize; $('lkH').onchange = resize;
        // Stan
        segHandler('stateMode', (v) => {
            lookState = null;
            update((x) => {
                delete x.states; delete x.stateSource; delete x.stateRules;
                if (v !== 'toggle') { delete x.stateVar; delete x.on; }
                if (v === 'toggle') x.on = x.on || { bg: '#e6007e' };
                if (v === 'multi') { x.states = [{ id: 'off', name: 'Wył.', look: {} }, { id: 'on', name: 'Wł.', look: { bg: '#e6007e' } }]; x.stateSource = 'cycle'; }
            }, { rerender: true });
        });
        if ($('lkStateVar')) $('lkStateVar').onclick = () => PD.pickVariable((n) => update((x) => { x.stateVar = n; }, { look: true }));
        body.querySelectorAll('[data-ls]').forEach((btn) => btn.onclick = () => {
            const v = btn.dataset.ls;
            lookState = v === '-1' ? null : v === 'on' ? 'on' : Number(v);
            renderLook(); refreshPreview();
        });
        if (body.querySelector('[data-ls-add]')) body.querySelector('[data-ls-add]').onclick = () => update((x) => { x.states.push({ id: `s${Date.now().toString(36)}`, name: `Stan ${x.states.length + 1}`, look: {} }); lookState = x.states.length - 1; }, { look: true });
        if ($('lkStateName')) $('lkStateName').oninput = () => update((x) => { x.states[lookState].name = $('lkStateName').value; });
        if ($('lkStateBase')) $('lkStateBase').onclick = () => { lookState = null; renderLook(); refreshPreview(); };
        if ($('lkStateDel')) $('lkStateDel').onclick = () => {
            if (b.states.length <= 2) return PD.toast('Zostaw co najmniej dwa stany albo wybierz „Pojedynczy stan”.', 'error');
            const i = lookState; lookState = null;
            update((x) => { x.states.splice(i, 1); }, { look: true });
        };
        segHandler('stateSource', (v) => update((x) => { x.stateSource = v; if (v === 'variable' && !x.stateRules) x.stateRules = []; }, { look: true }));
        if ($('lkRuleAdd')) $('lkRuleAdd').onclick = () => update((x) => { (x.stateRules = x.stateRules || []).push({ state: x.states[1].id, var: '', op: 'on', value: '' }); }, { look: true });
        body.querySelectorAll('[data-rv]').forEach((el) => el.onclick = () => PD.pickVariable((n) => update((x) => { x.stateRules[+el.dataset.rv].var = n; }, { look: true })));
        body.querySelectorAll('[data-rop]').forEach((el) => el.onchange = () => update((x) => { x.stateRules[+el.dataset.rop].op = el.value; }));
        body.querySelectorAll('[data-rval]').forEach((el) => el.oninput = () => update((x) => { x.stateRules[+el.dataset.rval].value = el.value; }));
        body.querySelectorAll('[data-rst]').forEach((el) => el.onchange = () => update((x) => { x.stateRules[+el.dataset.rst].state = el.value; }));
        body.querySelectorAll('[data-rdel]').forEach((el) => el.onclick = () => update((x) => { x.stateRules.splice(+el.dataset.rdel, 1); }, { look: true }));
        // Zakładki wyglądu
        segHandler('lookTab', (v) => { lookTab = v; renderLook(); });
        if ($('lkLabel')) $('lkLabel').oninput = () => lset('label', $('lkLabel').value);
        if ($('lkInsVar')) $('lkInsVar').onclick = () => PD.pickVariable((n) => { const t = $('lkLabel'); const pos = t.selectionStart ?? t.value.length; t.value = t.value.slice(0, pos) + `{${n}}` + t.value.slice(t.selectionEnd ?? pos); lset('label', t.value); });
        if ($('lkFont')) $('lkFont').oninput = () => { $('lkFontV').textContent = `${$('lkFont').value}px`; lset('fontSize', +$('lkFont').value); };
        segHandler('align', (v) => { lset('textAlign', v); body.querySelectorAll('[data-seg="align"] button').forEach((x) => x.classList.toggle('active', x.dataset.v === v)); });
        segHandler('pos', (v) => { lset('labelPos', v); body.querySelectorAll('[data-seg="pos"] button').forEach((x) => x.classList.toggle('active', x.dataset.v === v)); });
        if ($('lkShadow')) $('lkShadow').onchange = () => lset('labelShadow', $('lkShadow').checked);
        if ($('lkOutline')) $('lkOutline').onchange = () => lset('labelOutline', $('lkOutline').checked);
        if ($('lkIconPick')) $('lkIconPick').onclick = () => openIconPicker();
        if ($('lkIconDel')) $('lkIconDel').onclick = () => lset('icon', { type: 'none' }, { look: true });
        segHandler('fit', (v) => lset('icon', { ...(lget('icon') || {}), fit: v, fill: undefined }, { look: true }));
        if ($('lkZoom')) $('lkZoom').oninput = () => { $('lkZoomV').textContent = `${$('lkZoom').value}%`; lset('icon', { ...(lget('icon') || {}), zoom: +$('lkZoom').value }); };
        if ($('lkOp')) $('lkOp').oninput = () => { $('lkOpV').textContent = `${$('lkOp').value}%`; lset('icon', { ...(lget('icon') || {}), opacity: +$('lkOp').value }); };
        if ($('lkBorder')) $('lkBorder').onchange = () => lset('border', $('lkBorder').checked ? { width: 2, color: '#ff4fa6' } : null, { look: true });
        if ($('lkBw')) $('lkBw').oninput = () => { $('lkBwV').textContent = `${$('lkBw').value}px`; lset('border', { ...(lget('border') || {}), width: +$('lkBw').value }); };
        // Ustawienia typu widżetu
        if ($('wsPreset')) {
            const sl = b.slider || {};
            const cur = sl.preset === 'target' ? `target:${sl.target}` : sl.preset || 'volume';
            $('wsPreset').value = cur;
            // Dokładamy wszystko, czym da się sterować: urządzenia, aplikacje, odtwarzacze
            deck.fieldOptions('media', 'volume', 'target').then((opts) => {
                const extra = opts.filter((o) => o.value !== 'system' && o.value !== 'mic');
                if (!$('wsPreset')) return;
                if (extra.length) $('wsPreset').insertAdjacentHTML('beforeend', `<optgroup label="Urządzenia, aplikacje i odtwarzacze">${extra.map((o) => `<option value="target:${esc(o.value)}">${esc(o.label)}</option>`).join('')}</optgroup>`);
                if (sl.preset === 'target' && !extra.some((o) => o.value === sl.target)) $('wsPreset').insertAdjacentHTML('beforeend', `<option value="target:${esc(sl.target)}">${esc(sl.target)} (teraz niedostępne)</option>`);
                $('wsPreset').value = cur;
            }).catch(() => {});
            $('wsPreset').onchange = () => {
                const v = $('wsPreset').value;
                update((x) => {
                    x.slider = { ...(x.slider || {}) };
                    if (v.startsWith('target:')) { x.slider.preset = 'target'; x.slider.target = v.slice(7); }
                    else { x.slider.preset = v; delete x.slider.target; }
                    const lbl = $('wsPreset').selectedOptions[0] ? $('wsPreset').selectedOptions[0].textContent.replace(/^(Wyjście|Wejście|Aplikacja|Odtwarzacz): /, '') : '';
                    if (!x.label || ['Głośność', 'Mikrofon', 'Spotify'].includes(x.label) || x.__autoLabel) { x.label = v === 'volume' ? 'Głośność' : v === 'mic' ? 'Mikrofon' : v.startsWith('target:') ? lbl.slice(0, 18) : x.label; }
                }, { rerender: true });
            };
        }
        if ($('wsPlayer')) $('wsPlayer').oninput = () => update((x) => { x.slider.player = $('wsPlayer').value.trim(); });
        if ($('wsVar')) $('wsVar').onclick = () => PD.pickVariable((n) => update((x) => { x.slider.var = n; }, { look: true }));
        if ($('wsMin')) $('wsMin').onchange = () => update((x) => { x.slider.min = Number($('wsMin').value); });
        if ($('wsMax')) $('wsMax').onchange = () => update((x) => { x.slider.max = Number($('wsMax').value); });
        if ($('wsShow')) $('wsShow').onchange = () => update((x) => { x.slider.showValue = $('wsShow').checked; });
        body.querySelectorAll('[data-clk]').forEach((el) => el.onchange = () => update((x) => { x.clock = { ...(x.clock || {}), [el.dataset.clk]: el.checked }; }));
        body.querySelectorAll('[data-med]').forEach((el) => el.onchange = () => update((x) => { x.media = { ...(x.media || {}), [el.dataset.med]: el.checked }; }));
        if ($('wsMediaPlayer')) {
            const sel = $('wsMediaPlayer'), cur = (b.media || {}).player || '';
            deck.fieldOptions('media', 'media', 'player').then((opts) => {
                if (!$('wsMediaPlayer')) return;
                const list = opts.filter((o) => o.value);
                sel.innerHTML = '<option value="">Ten, który właśnie gra</option>' + list.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('') +
                    (cur && !list.some((o) => o.value === cur) ? `<option value="${esc(cur)}">${esc(cur)} (teraz nie działa)</option>` : '');
                sel.value = cur;
            }).catch(() => {});
            sel.onchange = () => update((x) => { x.media = { ...(x.media || {}) }; if (sel.value) x.media.player = sel.value; else delete x.media.player; });
        }
        segHandler('gstyle', (v) => update((x) => { x.gaugeStyle = v; }, { look: true }));
        body.querySelectorAll('[data-gv]').forEach((el) => el.onclick = () => PD.pickVariable((n) => update((x) => { x.gauges[+el.dataset.gv].var = n; }, { look: true })));
        body.querySelectorAll('[data-gf]').forEach((inp) => inp.oninput = () => { const i = +inp.closest('[data-g]').dataset.g; update((x) => { x.gauges[i][inp.dataset.gf] = inp.dataset.gf === 'max' ? Number(inp.value) : inp.value; }); });
        body.querySelectorAll('[data-gdel]').forEach((el) => el.onclick = () => update((x) => { x.gauges.splice(+el.dataset.gdel, 1); }, { look: true }));
        if ($('wsGAdd')) $('wsGAdd').onclick = () => update((x) => { (x.gauges = x.gauges || []).push({ var: 'system.cpuTemp', name: 'Temp.', max: 100, unit: '°' }); }, { look: true });
    }

    // ───── Okno wyboru ikony ─────
    let iconTab = 'lucide';
    function openIconPicker() {
        let m = $('modalIcon');
        if (!m) {
            m = document.createElement('div');
            m.className = 'm-modal-overlay';
            m.id = 'modalIcon';
            m.innerHTML = `<div class="m-modal icon-modal"><div class="m-modal-header"><span class="m-modal-title">Zmień ikonę</span><button class="m-modal-close" onclick="PitayaUI.closeModal('modalIcon')">✕</button></div>
                <div class="m-modal-body"><div class="seg small" id="ipTabs"><button data-v="lucide">Ikony</button><button data-v="emoji">Emoji</button><button data-v="image">Obraz z dysku</button></div>
                <input class="m-input" id="ipSearch" placeholder="Szukaj: mikrofon, play, folder, światło…"><div class="ip-grid" id="ipGrid"></div></div></div>`;
            document.body.appendChild(m);
            m.addEventListener('click', (e) => { if (e.target === m) PitayaUI.closeModal('modalIcon'); });
            $('ipTabs').onclick = async (e) => {
                const t = e.target.closest('[data-v]');
                if (!t) return;
                if (t.dataset.v === 'image') {
                    try { const name = await deck.pickFile({ image: true }); if (name) { lset('icon', { type: 'image', value: name, fit: 'contain' }, { look: true }); PitayaUI.closeModal('modalIcon'); } } catch (err) { PD.toast(PD.errText(err), 'error'); }
                    return;
                }
                iconTab = t.dataset.v; renderIconGrid();
            };
            $('ipSearch').oninput = () => { clearTimeout(window.__ip); window.__ip = setTimeout(renderIconGrid, 100); };
            $('ipGrid').onclick = (e) => {
                const b = e.target.closest('[data-l],[data-e],[data-img]');
                if (!b) return;
                if (b.dataset.l) lset('icon', { type: 'lucide', value: b.dataset.l, color: (lget('icon') || {}).color || '' }, { look: true });
                if (b.dataset.e) lset('icon', { type: 'emoji', value: b.dataset.e }, { look: true });
                if (b.dataset.img) lset('icon', { type: 'image', value: b.dataset.img, fit: 'contain' }, { look: true });
                PitayaUI.closeModal('modalIcon');
            };
        }
        $('ipSearch').value = '';
        renderIconGrid();
        PitayaUI.openModal('modalIcon');
        setTimeout(() => $('ipSearch').focus(), 50);
    }
    PD.searchLucide = (q) => {
        let names = Object.keys(PD.lucide.icons);
        if (!q) return names;
        const words = q.split(/\s+/);
        const terms = words.flatMap((w) => [w, ...Object.entries(PL).filter(([pl]) => pl.startsWith(w) || w.startsWith(pl)).map(([, en]) => en)]);
        return names.filter((n) => { const hay = `${n} ${(PD.lucide.tags[n] || []).join(' ')}`; return terms.some((t) => hay.includes(t)); });
    };
    function renderIconGrid() {
        $('ipTabs').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === iconTab));
        const q = $('ipSearch').value.trim().toLowerCase();
        $('ipSearch').hidden = iconTab !== 'lucide';
        if (iconTab === 'emoji') { $('ipGrid').innerHTML = EMOJIS.map((em) => `<button data-e="${em}" class="emo">${em}</button>`).join(''); return; }
        const names = PD.searchLucide(q);
        $('ipGrid').innerHTML = names.slice(0, 240).map((n) => `<button data-l="${n}" title="${n}">${R.lucide(PD.lucide.icons[n])}</button>`).join('') || '<div class="empty-note">Nic nie znaleziono — spróbuj po angielsku.</div>';
    }

    // ───── Prawa część: wyzwalacze i akcje ─────
    function triggersFor(b) {
        const type = b.type || 'button';
        if (type === 'slider') return (b.slider || {}).preset === 'custom' ? ['change'] : [];
        if (type === 'media') return [];
        const list = ['press', 'longPress', 'doublePress', 'touchStart', 'release'];
        if ((Array.isArray(b.states) && b.states.length) || b.stateVar) list.push('stateChange');
        return list;
    }
    function renderTriggers() {
        const b = W();
        const list = triggersFor(b);
        const acts = b.actions || {};
        if (!list.includes(phase)) phase = list.find((t) => (acts[t] || []).length) || list[0] || 'press';
        const shown = list.filter((t) => t === phase || (acts[t] || []).length || t === list[0]);
        const more = list.filter((t) => !shown.includes(t));
        $('triggerRow').innerHTML = shown.map((t) => `<span class="trig${t === phase ? ' active' : ''}" data-trig="${t}">${esc(TRIGGERS[t][0])}${(acts[t] || []).length ? `<i class="n">${PD.countBlocks(acts[t])}</i>` : ''}${t !== list[0] ? `<button class="trig-x" data-trig-del="${t}" title="Usuń wyzwalacz">${PD.icon('x')}</button>` : ''}</span>`).join('') +
            (more.length ? `<div class="pop-wrap"><button class="trig plus" id="trigAdd" title="Dodaj wyzwalacz">${PD.icon('plus')}</button><div class="popover trig-menu" id="trigMenu" hidden>${more.map((t) => `<button data-trig-new="${t}"><b>${esc(TRIGGERS[t][0])}</b><small>${esc(TRIGGERS[t][1])}</small></button>`).join('')}</div></div>` : '');
        $('triggerHint').textContent = list.length ? TRIGGERS[phase][1] : (b.type === 'media' ? 'Odtwarzacz ma wbudowane przyciski: poprzedni, graj / pauza, następny.' : 'Ten suwak steruje głośnością bez akcji. Wybierz po lewej „Własną zmienną i akcjami”, żeby dodać akcje.');
        $('btnRun').hidden = !list.length;
        PD.fillIcons($('triggerRow'));
    }
    $('triggerRow').addEventListener('click', async (e) => {
        if (e.target.closest('#trigAdd')) { e.stopPropagation(); $('trigMenu').hidden = !$('trigMenu').hidden; return; }
        const nw = e.target.closest('[data-trig-new]');
        if (nw) { phase = nw.dataset.trigNew; renderTriggers(); return renderActions(); }
        const del = e.target.closest('[data-trig-del]');
        if (del) {
            e.stopPropagation();
            const t = del.dataset.trigDel;
            const n = PD.countBlocks((W().actions || {})[t]);
            if (n && !(await PD.confirm('Usunąć wyzwalacz?', `„${TRIGGERS[t][0]}” ma ${n} akcji, które zostaną usunięte.`))) return;
            update((x) => { if (x.actions) delete x.actions[t]; });
            if (phase === t) phase = 'press';
            renderTriggers(); return renderActions();
        }
        const tr = e.target.closest('[data-trig]');
        if (tr) { phase = tr.dataset.trig; renderTriggers(); renderActions(); }
    });
    addEventListener('click', (e) => { if ($('trigMenu') && !e.target.closest('#triggerRow .pop-wrap')) $('trigMenu').hidden = true; });
    function renderActions() {
        const b = W();
        if (!triggersFor(b).length) { $('actionsList').innerHTML = ''; return; }
        blockEd = PD.createBlockEditor({
            el: $('actionsList'),
            getRoot: () => { const x = W(); x.actions = x.actions || {}; return x.actions; },
            basePath: [phase],
            emptyText: 'Ten wyzwalacz nie ma jeszcze akcji.',
            mutate: (fn, rerender) => {
                update((x) => { x.actions = x.actions || {}; fn(x.actions); });
                if (rerender !== false) { renderTriggers(); blockEd.render(); }
            },
        });
        blockEd.render();
    }
    $('btnRun').onclick = async () => {
        await flush();
        const res = await deck.testButton(folderId, key, phase === 'change' ? 'press' : phase);
        if (!((W().actions || {})[phase] || []).length && !(phase === 'press' && W().states && W().stateSource === 'cycle')) return PD.toast('Ten wyzwalacz nie ma akcji.', 'info');
        PD.toast(res.ok ? 'Wykonano' : res.errors.join(' · '), res.ok ? 'success' : 'error');
        PD.data = { ...PD.data, ...(await deck.get()) };
        refreshPreview();
    };
    $('btnVars').onclick = () => PD.pickVariable(null);

    // ───── JSON ─────
    $('weMode').onclick = (e) => {
        const t = e.target.closest('[data-v]');
        if (!t) return;
        $('weMode').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === t));
        const json = t.dataset.v === 'json';
        $('weVisual').hidden = json;
        $('weJson').hidden = !json;
        if (json) $('jsonArea').value = JSON.stringify(W(), null, 2);
    };
    $('jsonApply').onclick = async () => {
        let obj;
        try { obj = JSON.parse($('jsonArea').value); } catch (err) { return PD.toast(`To nie jest poprawny JSON: ${err.message}`, 'error'); }
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return PD.toast('Widżet musi być obiektem JSON.', 'error');
        PD.data.deck.folders[folderId].buttons[key] = obj;
        await deck.setButton(folderId, key, obj);
        PD.toast('Zapisano', 'success');
        renderAll();
    };

    // ───── Nagłówek i strona ─────
    function renderAll() {
        const b = W();
        if (!b) return PD.go('deck');
        const [x, y] = key.split(',').map(Number);
        $('weType').textContent = TYPES[b.type || 'button'] || 'Widżet';
        $('wePos').textContent = `${PD.data.deck.folders[folderId].name} · kolumna ${x + 1}, wiersz ${y + 1}${(b.w || 1) > 1 || (b.h || 1) > 1 ? ` · ${b.w || 1}×${b.h || 1}` : ''}`;
        renderLook();
        renderTriggers();
        renderActions();
        refreshPreview();
        PD.fillIcons($('weVisual'));
    }
    $('weBack').onclick = async () => { await flush(); PD.go('deck'); };
    $('weDelete').onclick = async () => {
        if (!(await PD.confirm('Usunąć widżet?', 'Widżet razem z jego akcjami zostanie usunięty.'))) return;
        clearTimeout(saveTimer); pending = null;
        await deck.setButton(folderId, key, null);
        PD.go('deck');
    };
    $('weDuplicate').onclick = async () => {
        await flush();
        const prev = PD.folderId; PD.folderId = folderId;
        const k = await PD.duplicateWidget(key);
        PD.folderId = prev;
        if (k) PD.go('widget', { folderId, key: k });
    };
    addEventListener('keydown', (e) => { if (PD.page === 'widget' && e.key === 'Escape' && !document.querySelector('.m-modal-overlay.active')) $('weBack').click(); });

    PD.hooks.widget = {
        show: async ({ folderId: f, key: k, fresh }) => {
            folderId = f; key = k; lookState = null; lookTab = 'label';
            PD.hooks.beforeLeave = () => { flush(); };
            await PD.reload();
            PD.folderId = f;
            const b = W();
            phase = 'press';
            if (b && b.type === 'slider' && (b.slider || {}).preset === 'custom') phase = 'change';
            $('weMode').querySelector('[data-v="visual"]').click();
            renderAll();
            if (fresh && b && (b.type || 'button') === 'button' && !(b.actions && b.actions.press && b.actions.press.length)) setTimeout(() => PD.toast('Dodaj akcję, którą ma wykonać przycisk — „＋ Dodaj akcję” po prawej.'), 300);
        },
    };
    const prevVars = PD.hooks.onVars;
    PD.hooks.onVars = () => { if (prevVars) prevVars(); if (PD.page === 'widget' && !pending && lookState === null) refreshPreview(); };
    const prevPlugins = PD.hooks.onPlugins;
    PD.hooks.onPlugins = () => { if (prevPlugins) prevPlugins(); if (PD.page === 'widget' && blockEd && !pending) blockEd.render(); };
})();
