// ═══════ PITAYA DECK — EDYTOR: POLA, KOLORY, ZMIENNE ═══════
(function () {
    const { $, esc } = PD;
    PD.optionsCache = {};

    // Adresy w opisach (np. Redirect URI) jako przycisk „kliknij, żeby skopiować”
    PD.linkify = (text) => esc(text).replace(/\b(https?:\/\/[^\s,;)<>"']+[^\s,;)<>"'.])/g, (m) => `<button type="button" class="copy-chip" data-copy="${m}" title="Kliknij, żeby skopiować">${m}${PD.icon('copy')}</button>`);
    document.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-copy]');
        if (!b) return;
        e.preventDefault();
        e.stopPropagation();
        const text = b.dataset.copy.replace(/&amp;/g, '&');
        try { await deck.copyText(text); } catch { try { await navigator.clipboard.writeText(text); } catch { return PD.toast('Nie udało się skopiować', 'error'); } }
        b.classList.add('copied');
        setTimeout(() => b.classList.remove('copied'), 1200);
        PD.toast(`Skopiowano: ${text}`, 'success');
    }, true);

    // Pole ustawienia akcji / wtyczki
    PD.fieldHtml = (f, value) => {
        const v = value === undefined ? f.default : value;
        const id = `f_${Math.random().toString(36).slice(2, 9)}`;
        const label = `<label class="m-label" for="${id}">${esc(f.label)}${f.required ? '<i class="req">*</i>' : ''}</label>`;
        const help = f.help ? `<div class="f-help">${esc(f.help)}</div>` : '';
        const attrs = `id="${id}" data-key="${esc(f.key)}" data-type="${f.type}"`;
        if (f.type === 'button') return `<button class="m-btn small" data-cmd="${esc(f.key)}">${esc(f.label)}</button>${help}`;
        if (f.type === 'info') return `<div class="plug-info">${PD.linkify(f.label)}${f.help ? `<br><span class="m-small">${PD.linkify(f.help)}</span>` : ''}</div>`;
        if (f.type === 'bool') return `<label class="toggle-row"><span>${esc(f.label)}</span><input type="checkbox" class="switch" ${attrs} ${v ? 'checked' : ''}></label>${help}`;
        if (f.type === 'textarea') return `<div class="m-field">${label}<div class="field-row"><textarea class="m-input" ${attrs} placeholder="${esc(f.placeholder || '')}">${esc(v ?? '')}</textarea><button class="m-btn small icon-only" data-insvar title="Wstaw zmienną">{ }</button></div>${help}</div>`;
        if (f.type === 'select') {
            const opts = f.options || [];
            return `<div class="m-field">${label}<div class="field-row"><select class="m-select" ${attrs} data-dynamic="${f.dynamic ? 1 : ''}" data-value="${esc(v ?? '')}">
                ${opts.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
                ${f.dynamic ? `<option value="${esc(v ?? '')}">${v ? esc(v) : 'Wczytywanie…'}</option>` : ''}
              </select>${f.dynamic ? `<button class="m-btn small icon-only" data-refresh title="Odśwież listę">${PD.icon('refresh-cw')}</button>` : ''}</div>${help}</div>`;
        }
        if (f.type === 'hotkey') return `<div class="m-field">${label}<div class="field-row"><input class="m-input hotkey-input" ${attrs} value="${esc(v ?? '')}" placeholder="${esc(f.placeholder || 'Kliknij Nagraj i naciśnij skrót')}"><button class="m-btn small" data-record>Nagraj</button></div>${help}</div>`;
        if (f.type === 'file') return `<div class="m-field">${label}<div class="field-row"><input class="m-input" ${attrs} value="${esc(v ?? '')}" placeholder="${esc(f.placeholder || '')}"><button class="m-btn small" data-browse>Wybierz…</button></div>${help}</div>`;
        if (f.type === 'password') return `<div class="m-field">${label}<input class="m-input" type="password" ${attrs} value="${esc(v ?? '')}">${help}</div>`;
        if (f.type === 'number') return `<div class="m-field">${label}<input class="m-input" ${attrs} value="${esc(v ?? '')}" placeholder="${esc(f.placeholder || '')}" inputmode="decimal">${help}</div>`;
        return `<div class="m-field">${label}<div class="field-row"><input class="m-input" ${attrs} value="${esc(v ?? '')}" placeholder="${esc(f.placeholder || '')}"><button class="m-btn small icon-only" data-insvar title="Wstaw zmienną">{ }</button></div>${help}</div>`;
    };

    PD.loadOptions = async (pluginId, actionId, key, select) => {
        const cacheKey = `${pluginId}/${actionId}/${key}`;
        const current = select.dataset.value;
        let opts = PD.optionsCache[cacheKey];
        if (!opts) { opts = await deck.fieldOptions(pluginId, actionId, key); PD.optionsCache[cacheKey] = opts; }
        const has = opts.some((o) => String(o.value) === String(current));
        select.innerHTML = (current && !has ? `<option value="${esc(current)}">${esc(current)} (niedostępne)</option>` : '') +
            (!current && !opts.some((o) => o.value === '') ? '<option value="">— wybierz —</option>' : '') +
            opts.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
        select.value = current || '';
        if (!opts.length) select.innerHTML += '<option value="" disabled>Brak pozycji (sprawdź połączenie integracji)</option>';
    };

    // Podpina pola w kontenerze: onSet(key, value). defs = lista definicji pól (do plików)
    PD.wireFields = (root, { pluginId, actionId, defs = [], onSet }) => {
        root.querySelectorAll('[data-key]').forEach((input) => {
            const key = input.dataset.key, type = input.dataset.type;
            const read = () => (type === 'bool' ? input.checked : type === 'number' ? (input.value === '' ? '' : (isNaN(Number(input.value.replace(',', '.'))) ? input.value : Number(input.value.replace(',', '.')))) : input.value);
            input.addEventListener(type === 'bool' || input.tagName === 'SELECT' ? 'change' : 'input', (e) => { e.stopPropagation(); onSet(key, read()); });
            if (input.dataset.dynamic && pluginId) PD.loadOptions(pluginId, actionId, key, input);
        });
        root.querySelectorAll('[data-refresh]').forEach((b) => b.addEventListener('click', (e) => {
            e.stopPropagation();
            const sel = b.parentElement.querySelector('select');
            delete PD.optionsCache[`${pluginId}/${actionId}/${sel.dataset.key}`];
            PD.loadOptions(pluginId, actionId, sel.dataset.key, sel);
        }));
        root.querySelectorAll('[data-browse]').forEach((b) => b.addEventListener('click', async (e) => {
            e.stopPropagation();
            const input = b.parentElement.querySelector('input');
            const f = defs.find((x) => x.key === input.dataset.key);
            const file = await deck.pickFile({ filters: f && f.filters });
            if (file) { input.value = file; onSet(input.dataset.key, file); }
        }));
        root.querySelectorAll('[data-record]').forEach((b) => b.addEventListener('click', (e) => {
            e.stopPropagation();
            const input = b.parentElement.querySelector('input');
            PD.recordHotkey(input, (v) => onSet(input.dataset.key, v));
        }));
        root.querySelectorAll('[data-insvar]').forEach((b) => b.addEventListener('click', (e) => {
            e.stopPropagation();
            const input = b.parentElement.querySelector('input,textarea');
            PD.pickVariable((name) => {
                const pos = input.selectionStart ?? input.value.length;
                input.value = input.value.slice(0, pos) + `{${name}}` + input.value.slice(input.selectionEnd ?? pos);
                onSet(input.dataset.key, input.value);
            });
        }));
    };

    // Nagrywanie skrótu: naciśnij kombinację, a pole zapisze np. „ctrl+shift+m”
    PD.recordHotkey = (input, onDone) => {
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
    };

    // Streszczenie akcji w jednym wierszu: „Folder: Spotify · Urządzenie: —”
    PD.summary = (item) => {
        const a = PD.actionDef(item);
        if (!a) return '';
        const cfg = item.config || {};
        const parts = [];
        for (const f of a.fields || []) {
            if (['info', 'button', 'password'].includes(f.type)) continue;
            let v = cfg[f.key] === undefined ? f.default : cfg[f.key];
            if (v === undefined || v === '' || v === null) continue;
            if (f.type === 'bool') v = v ? 'tak' : 'nie';
            if (f.type === 'select' && Array.isArray(f.options)) { const o = f.options.find((x) => String(x.value) === String(v)); if (o) v = o.label; }
            if (f.type === 'select' && f.dynamic) {
                const cached = PD.optionsCache[`${item.plugin}/${item.action}/${f.key}`];
                const o = cached && cached.find((x) => String(x.value) === String(v));
                if (o) v = o.label;
                else if (f.key === 'folder' && PD.data.deck.folders[v]) v = PD.data.deck.folders[v].name;
            }
            parts.push(`${f.label}: ${String(v).replace(/\s+/g, ' ').slice(0, 40)}`);
            if (parts.length >= 3) break;
        }
        return parts.join(' · ');
    };

    // Kolory
    PD.PALETTE = ['transparent', '#23222a', '#2f2e38', '#e6007e', '#ff4fa6', '#ff5d73', '#ef4444', '#ff7a3d', '#ffb52e', '#ffd166', '#16a34a', '#4cc38a', '#2dd4bf', '#4ea8ff', '#3b82f6', '#6c5ce7', '#c77dff', '#ffffff', '#000000'];
    // Wybór koloru: przycisk z próbką i kodem, po kliknięciu okienko z polem barw (jak w Macro Deck)
    const hexOk = (c) => /^#[\da-f]{6}$/i.test(c);
    const hsv2hex = (h, s, v) => {
        const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
        return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
    };
    const hex2hsv = (hex) => {
        const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        let h = 0;
        if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return [(h * 60 + 360) % 360, max ? d / max : 0, max];
    };
    const recent = () => { try { return JSON.parse(localStorage.getItem('pd-recent-colors') || '[]'); } catch { return []; } };
    const pushRecent = (c) => { if (!hexOk(c)) return; try { localStorage.setItem('pd-recent-colors', JSON.stringify([c, ...recent().filter((x) => x !== c)].slice(0, 10))); } catch {} };
    const colorName = (c) => (c === 'transparent' ? 'Przezroczysty' : !c ? 'Automatyczny' : c.toLowerCase());
    const swatchStyle = (c) => (c === 'transparent' ? '' : !c ? '' : `background:${c}`);
    const swatchCls = (c) => (c === 'transparent' ? ' none' : !c ? ' auto' : '');

    let cpEl = null, cpState = null;
    PD.closeColorPicker = () => closePicker();
    function closePicker() { if (cpEl) cpEl.hidden = true; if (cpState) { pushRecent(cpState.value); cpState = null; } }
    function openPicker(anchor, colors, current, onPick) {
        if (!cpEl) {
            cpEl = document.createElement('div');
            cpEl.className = 'cp-pop';
            document.body.appendChild(cpEl);
            addEventListener('mousedown', (e) => { if (cpEl && !cpEl.hidden && !cpEl.contains(e.target) && !e.target.closest('.cp-btn')) closePicker(); }, true);
            addEventListener('keydown', (e) => { if (e.key === 'Escape' && cpEl && !cpEl.hidden) { e.stopPropagation(); closePicker(); } }, true);
        }
        const base = hexOk(current) ? current : '#ff4fa6';
        const [h, sat, v] = hex2hsv(base);
        cpState = { h, s: sat, v, value: current, onPick, anchor };
        const specials = colors.filter((c) => c === '' || c === 'transparent');
        const presets = colors.filter((c) => hexOk(c));
        cpEl.innerHTML = `
            <div class="cp-sv"><div class="cp-sv-dot"></div></div>
            <div class="cp-hue"><div class="cp-hue-dot"></div></div>
            <div class="cp-row"><span class="cp-now"></span><input class="m-input cp-hex" maxlength="7" spellcheck="false"></div>
            ${specials.length ? `<div class="cp-special">${specials.map((c) => `<button data-c="${c}" class="cp-opt"><span class="cp-sw${swatchCls(c)}"></span>${colorName(c)}</button>`).join('')}</div>` : ''}
            <div class="cp-label">Kolory</div>
            <div class="cp-swatches">${presets.map((c) => `<button data-c="${c}" class="cp-sw" style="background:${c}" title="${c}"></button>`).join('')}</div>
            ${recent().length ? `<div class="cp-label">Ostatnio użyte</div><div class="cp-swatches">${recent().map((c) => `<button data-c="${c}" class="cp-sw" style="background:${c}" title="${c}"></button>`).join('')}</div>` : ''}`;
        cpEl.hidden = false;
        const r = anchor.getBoundingClientRect();
        const w = 250, hgt = cpEl.offsetHeight;
        cpEl.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
        cpEl.style.top = `${r.bottom + hgt + 8 > innerHeight ? Math.max(8, r.top - hgt - 6) : r.bottom + 6}px`;
        const sv = cpEl.querySelector('.cp-sv'), hue = cpEl.querySelector('.cp-hue'), hex = cpEl.querySelector('.cp-hex');
        const paint = (fromHex) => {
            const c = hsv2hex(cpState.h, cpState.s, cpState.v);
            sv.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${cpState.h}, 100%, 50%))`;
            cpEl.querySelector('.cp-sv-dot').style.cssText = `left:${cpState.s * 100}%;top:${(1 - cpState.v) * 100}%;background:${c}`;
            cpEl.querySelector('.cp-hue-dot').style.left = `${(cpState.h / 360) * 100}%`;
            const shown = hexOk(cpState.value) ? cpState.value : c;
            cpEl.querySelector('.cp-now').className = `cp-now${swatchCls(cpState.value)}`;
            cpEl.querySelector('.cp-now').style.cssText = swatchStyle(cpState.value);
            if (!fromHex) hex.value = hexOk(cpState.value) ? shown : '';
            hex.placeholder = colorName(cpState.value);
        };
        const apply = (c) => { cpState.value = c; cpState.onPick(c); updateButton(anchor, c); paint(); };
        const drag = (el, fn) => el.addEventListener('pointerdown', (e) => {
            el.setPointerCapture(e.pointerId);
            const move = (ev) => { const b = el.getBoundingClientRect(); fn(Math.max(0, Math.min(1, (ev.clientX - b.left) / b.width)), Math.max(0, Math.min(1, (ev.clientY - b.top) / b.height))); };
            move(e);
            const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); pushRecent(cpState && cpState.value); };
            el.addEventListener('pointermove', move);
            el.addEventListener('pointerup', up);
        });
        drag(sv, (x, y) => { cpState.s = x; cpState.v = 1 - y; apply(hsv2hex(cpState.h, cpState.s, cpState.v)); });
        drag(hue, (x) => { cpState.h = x * 360; apply(hsv2hex(cpState.h, cpState.s, cpState.v)); });
        hex.oninput = () => {
            let v = hex.value.trim();
            if (/^[\da-f]{6}$/i.test(v)) v = `#${v}`;
            if (/^#[\da-f]{3}$/i.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
            if (!hexOk(v)) return;
            [cpState.h, cpState.s, cpState.v] = hex2hsv(v);
            cpState.value = v; cpState.onPick(v); updateButton(anchor, v); paint(true);
        };
        cpEl.onclick = (e) => {
            const b = e.target.closest('[data-c]');
            if (!b) return;
            const c = b.dataset.c;
            if (hexOk(c)) [cpState.h, cpState.s, cpState.v] = hex2hsv(c);
            apply(c);
            if (!hexOk(c)) closePicker();
        };
        paint();
    }
    function updateButton(btn, c) {
        btn.querySelector('.cp-sw').className = `cp-sw${swatchCls(c)}`;
        btn.querySelector('.cp-sw').style.cssText = swatchStyle(c);
        btn.querySelector('.cp-val').textContent = colorName(c);
    }
    // Zgodność z poprzednim API: PD.colorRow(kontener, lista kolorów, obecny, onPick)
    PD.colorRow = (box, colors, current, onPick) => {
        box.classList.remove('colors', 'small');
        box.classList.add('cp-field');
        box.innerHTML = `<button type="button" class="cp-btn"><span class="cp-sw${swatchCls(current)}" style="${swatchStyle(current)}"></span><span class="cp-val">${colorName(current)}</span><span class="cp-chev">${PD.icon('chevron-down')}</span></button>`;
        const btn = box.querySelector('.cp-btn');
        btn.onclick = (e) => {
            e.stopPropagation();
            if (cpEl && !cpEl.hidden && cpState && cpState.anchor === btn) return closePicker();
            openPicker(btn, colors, cpState && cpState.anchor === btn ? cpState.value : btn.dataset.cur ?? current, (c) => { btn.dataset.cur = c; onPick(c); });
        };
    };

    // ───── Zmienne: okno wyboru z kategoriami (jak „Zmienne widżetu” w Macro Deck) ─────
    let varCb = null;
    let varCat = 'all';
    PD.varGroups = (list) => {
        const groups = new Map();
        for (const v of list) {
            const key = v.plugin === 'user' ? 'user' : v.plugin || 'other';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(v);
        }
        return groups;
    };
    PD.groupName = (key) => (key === 'user' ? 'Twoje zmienne' : (PD.plugin(key) || {}).name || key);
    PD.typeOf = (v) => (typeof v.value === 'boolean' ? ['bool', 'Logiczna'] : typeof v.value === 'number' ? ['num', 'Liczbowa'] : ['text', 'Tekst']);
    PD.varRow = (v, clickable) => {
        const [t, tl] = PD.typeOf(v);
        return `<div class="var-row${clickable ? ' clickable' : ''}" data-var="${esc(v.name)}">
            <div class="vr-main"><code>{${esc(v.name)}}</code><div class="vr-tags"><span class="vt ${t}">${tl}</span><span class="vt src">${v.plugin === 'user' ? 'Twoja' : 'Integracja'}</span><span class="vr-label">${esc(v.label)}</span></div></div>
            <span class="vr-val">${esc(v.text)}</span></div>`;
    };
    function renderVarPicker() {
        const all = PD.data.variables || [];
        const groups = PD.varGroups(all);
        $('vmCats').innerHTML = `<button data-vc="all" class="${varCat === 'all' ? 'active' : ''}"><span class="c-name">Wszystkie</span><span class="n">${all.length}</span></button>` +
            [...groups.entries()].map(([k, l]) => `<button data-vc="${esc(k)}" class="${varCat === k ? 'active' : ''}"><span class="c-name">${esc(PD.groupName(k))}</span><span class="n">${l.length}</span></button>`).join('');
        const q = $('varSearch').value.trim().toLowerCase();
        const list = all.filter((v) => (varCat === 'all' || (v.plugin === 'user' ? 'user' : v.plugin) === varCat) && (!q || `${v.name} ${v.label}`.toLowerCase().includes(q)));
        $('varPicker').innerHTML = list.map((v) => PD.varRow(v, true)).join('') || '<div class="empty-note">Brak zmiennych.</div>';
    }
    PD.pickVariable = async (cb) => {
        PD.data.variables = await deck.variables();
        varCb = cb;
        $('varsTitle').textContent = cb ? 'Wybierz zmienną' : 'Zmienne';
        $('varSearch').value = '';
        renderVarPicker();
        PitayaUI.openModal('modalVars');
        setTimeout(() => $('varSearch').focus(), 50);
    };
    $('varSearch').oninput = renderVarPicker;
    $('vmCats').onclick = (e) => { const b = e.target.closest('[data-vc]'); if (b) { varCat = b.dataset.vc; renderVarPicker(); } };
    $('varPicker').onclick = (e) => {
        const row = e.target.closest('[data-var]');
        if (!row || !varCb) return;
        PitayaUI.closeModal('modalVars');
        const cb = varCb; varCb = null;
        cb(row.dataset.var);
    };
})();
