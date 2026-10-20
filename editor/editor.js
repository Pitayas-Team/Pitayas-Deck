// ═══════ PITAYA DECK — EDYTOR ═══════
(function () {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const R = window.PitayaDeckRender;
    const toast = (t, k) => window.PitayaUI && PitayaUI.showToast(t, k === 'error' ? 'error' : k || 'info');

    const PALETTE = ['#23222a', '#2f2e38', '#e6007e', '#ff4fa6', '#ff5d73', '#ff7a3d', '#ffb52e', '#ffd166', '#4cc38a', '#2dd4bf', '#4ea8ff', '#6c5ce7', '#c77dff', '#ffffff', '#000000'];
    const TEXT_COLORS = ['', '#ffffff', '#17161c', '#ff4fa6', '#ffd166', '#4cc38a', '#4ea8ff'];
    const EMOJIS = ['🎮', '🎙️', '🎧', '🔴', '🎬', '📷', '💡', '🔊', '🔇', '⏯️', '⏭️', '⏮️', '📁', '🏠', '⭐', '❤️', '🔥', '✅', '❌', '⚡', '💬', '🎵', '🌐', '🔒', '☕', '🎉', '👋', '😂', '🐉', '🍓', '🌙', '⚙️'];
    const PHASES = { press: 'Wykonuje się od razu po dotknięciu.', longPress: 'Po przytrzymaniu przycisku przez pół sekundy. Gdy są tu akcje, krótkie dotknięcie czeka na puszczenie.', release: 'Po puszczeniu przycisku — np. „naciśnij i trzymaj, żeby mówić”.' };

    let data = null;            // { deck, plugins, variables, devices, server }
    let profileId = null;
    let folderId = null;
    let selected = null;        // klucz "x,y"
    let phase = 'press';
    let copied = null;
    let saveTimer = null;
    let pendingSave = null;
    let optionsCache = {};
    let pairingQueue = [];
    let qrUrl = null;

    // ───── Pomocnicze ─────
    const profile = () => data.deck.profiles.find((p) => p.id === profileId) || data.deck.profiles[0];
    const folder = () => data.deck.folders[folderId];
    const rawButton = (key = selected) => (folder() && folder().buttons[key]) || null;
    const imgBase = () => (data.server.port ? `http://127.0.0.1:${data.server.port}` : '');
    const plugin = (id) => data.plugins.find((p) => p.id === id);
    const actionDef = (item) => { const p = plugin(item.plugin); return p && p.actions.find((a) => a.id === item.action); };
    const fixImage = (b) => (b && b.icon && b.icon.type === 'image' && b.icon.value && b.icon.value.startsWith('/img/') ? { ...b, icon: { ...b.icon, value: imgBase() + b.icon.value } } : b);
    const keyLabel = (key) => { const [x, y] = key.split(',').map(Number); return `Kolumna ${x + 1}, wiersz ${y + 1}`; };

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
        if (!data.deck.folders[folderId] || (data.deck.profiles.find((p) => p.id === profileId) && !inProfile(folderId))) folderId = profile().root;
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
        $('colsInput').value = profile().cols;
        $('rowsInput').value = profile().rows;
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
            Object.values(data.deck.folders).filter((x) => x.parent === fid).sort((a, b) => a.name.localeCompare(b.name)).forEach((c) => walk(c.id, depth + 1));
        };
        walk(profile().root, 0);
        $('tree').innerHTML = out.join('');
    }
    $('tree').addEventListener('click', (e) => {
        const el = e.target.closest('[data-folder]');
        if (el) openFolder(el.dataset.folder);
    });
    $('tree').addEventListener('dblclick', async (e) => {
        const el = e.target.closest('[data-folder]');
        if (el) renameFolder(el.dataset.folder);
    });
    async function openFolder(fid) {
        await flushSave();
        folderId = fid;
        selected = null;
        renderTree();
        await renderGrid();
        renderInspector();
    }

    $('profileSelect').addEventListener('change', async () => {
        await flushSave();
        profileId = $('profileSelect').value;
        folderId = profile().root;
        selected = null;
        renderSide();
        await renderGrid();
        renderInspector();
    });
    const resize = async () => {
        await deck.updateProfile(profileId, { cols: $('colsInput').value, rows: $('rowsInput').value });
        await load();
    };
    $('colsInput').addEventListener('change', resize);
    $('rowsInput').addEventListener('change', resize);
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
    async function renderGrid() {
        const state = await deck.preview(folderId);
        const { cols, rows } = profile();
        const stage = $('stage').getBoundingClientRect();
        const gap = 12;
        const cell = Math.floor(Math.max(48, Math.min(140, Math.min((stage.width - 48 - gap * (cols - 1)) / cols, (stage.height - 48 - gap * (rows - 1)) / rows))));
        const grid = $('grid');
        grid.style.setProperty('--cell', `${cell}px`);
        grid.style.setProperty('--gap', `${gap}px`);
        grid.style.gridTemplateColumns = `repeat(${cols}, ${cell}px)`;
        grid.innerHTML = '';
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const key = `${x},${y}`;
                const el = document.createElement('div');
                R.paint(el, fixImage(state.buttons[key]) || null, cell);
                el.dataset.key = key;
                el.draggable = Boolean(state.buttons[key]);
                if (key === selected) el.classList.add('selected');
                grid.appendChild(el);
            }
        }
        // Okruszki: profil › folder › podfolder
        const path = [];
        let f = folder();
        while (f) { path.unshift(f); f = f.parent ? data.deck.folders[f.parent] : null; }
        $('crumbs').innerHTML = `<span>${esc(profile().name)}</span>` + path.map((p) => `<span>›</span><button data-folder="${esc(p.id)}" class="${p.id === folderId ? 'cur' : ''}">${esc(p.name)}</button>`).join('');
    }
    $('crumbs').addEventListener('click', (e) => { const b = e.target.closest('[data-folder]'); if (b) openFolder(b.dataset.folder); });
    addEventListener('resize', () => { clearTimeout(window.__rz); window.__rz = setTimeout(renderGrid, 120); });

    $('grid').addEventListener('click', async (e) => {
        const el = e.target.closest('[data-key]');
        if (!el) return;
        await flushSave();
        selected = el.dataset.key;
        if (!rawButton()) {
            await saveNow({ label: '', icon: { type: 'glyph', value: 'star' }, bg: '#23222a', color: '', fontSize: 14, labelPos: 'bottom', actions: { press: [] } });
        }
        await renderGrid();
        renderInspector();
    });
    // Przeciąganie: przenoszenie przycisków oraz upuszczanie obrazów z dysku
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
                const b = rawButton() || { label: '', bg: '#23222a', fontSize: 14, labelPos: 'bottom', actions: { press: [] } };
                await saveNow({ ...b, icon: { type: 'image', value: name } });
                await renderGrid();
                renderInspector();
            } catch (err) { toast(err.message, 'error'); }
            return;
        }
        if (dragFrom && dragFrom !== to) {
            await flushSave();
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
        menu.style.top = `${Math.min(e.clientY, innerHeight - 220)}px`;
    });
    addEventListener('click', () => { $('ctxMenu').hidden = true; });
    $('ctxMenu').addEventListener('click', async (e) => {
        const cmd = e.target.dataset.cmd;
        if (!cmd) return;
        $('ctxMenu').hidden = true;
        await flushSave();
        const b = rawButton(ctxKey);
        if (cmd === 'copy') { copied = JSON.parse(JSON.stringify(b)); toast('Skopiowano przycisk'); }
        if (cmd === 'paste' && copied) { await deck.setButton(folderId, ctxKey, JSON.parse(JSON.stringify(copied))); selected = ctxKey; }
        if (cmd === 'delete') { await deck.setButton(folderId, ctxKey, null); if (selected === ctxKey) selected = null; }
        if (cmd === 'duplicate') duplicate(ctxKey);
        if (cmd === 'folder') {
            const name = await ask('Nowy folder', '', 'np. Sceny OBS');
            if (!name) return;
            const f = await deck.addFolder(folderId, name);
            await deck.setButton(folderId, ctxKey, { label: name, icon: { type: 'glyph', value: 'folder' }, bg: '#2f2e38', fontSize: 14, labelPos: 'bottom', actions: { press: [{ plugin: 'deck', action: 'open-folder', config: { folder: f.id } }] } });
            selected = ctxKey;
        }
        await load();
    });
    async function duplicate(key) {
        const { cols, rows } = profile();
        for (let i = 0; i < cols * rows; i++) {
            const k = `${i % cols},${Math.floor(i / cols)}`;
            if (!folder().buttons[k]) {
                await deck.setButton(folderId, k, JSON.parse(JSON.stringify(rawButton(key))));
                selected = k;
                return load();
            }
        }
        toast('Brak wolnego pola w tym folderze.', 'error');
    }

    // ───── Zapis przycisku ─────
    function update(mutator, { rerender = false } = {}) {
        const b = JSON.parse(JSON.stringify(rawButton() || {}));
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
    let previewTimer = null;
    function refreshPreviews() {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(async () => {
            const b = rawButton();
            if (b) {
                const rendered = fixImage(await deck.render(b));
                const el = $('grid').querySelector(`[data-key="${selected}"]`);
                const cell = parseInt(getComputedStyle($('grid')).getPropertyValue('--cell'), 10) || 100;
                if (el) { R.paint(el, rendered, cell); el.classList.add('selected'); el.dataset.key = selected; }
                paintInspPreview(rendered);
            }
        }, 60);
    }
    function paintInspPreview(rendered) {
        const box = $('inspPreview');
        box.innerHTML = '<div></div>';
        R.paint(box.firstChild, rendered, 64);
        $('inspTitle').textContent = rendered && rendered.label ? rendered.label : 'Przycisk';
    }

    // ───── Inspektor ─────
    function renderInspector() {
        const b = rawButton();
        $('inspEmpty').hidden = Boolean(b);
        $('insp').hidden = !b;
        if (!b) return;
        $('inspPos').textContent = keyLabel(selected);
        deck.render(b).then((r) => paintInspPreview(fixImage(r)));

        // Wygląd
        $('fLabel').value = b.label || '';
        $('fLabelPos').value = b.labelPos || 'bottom';
        $('fFont').value = b.fontSize || 14;
        $('fFontVal').textContent = `${b.fontSize || 14}px`;
        const icon = b.icon || { type: 'none' };
        document.querySelectorAll('#iconType button').forEach((x) => x.classList.toggle('active', x.dataset.v === icon.type));
        document.querySelectorAll('.icon-pane').forEach((p) => p.classList.toggle('show', p.dataset.icon === icon.type));
        $('glyphs').querySelectorAll('button').forEach((x) => x.classList.toggle('active', icon.type === 'glyph' && x.dataset.g === icon.value));
        $('fEmoji').value = icon.type === 'emoji' ? icon.value : '';
        $('fImageFill').checked = Boolean(icon.fill);
        colorRow('bgColors', PALETTE, b.bg || '#23222a', (c) => update((x) => { x.bg = c; }));
        colorRow('fgColors', TEXT_COLORS, b.color || '', (c) => update((x) => { x.color = c; }));

        // Akcje
        renderActions();
        const counts = ['press', 'longPress', 'release'].map((p) => ((b.actions || {})[p] || []).length);
        $('actionsCount').textContent = counts.reduce((a, c) => a + c, 0) ? `(${counts.reduce((a, c) => a + c, 0)})` : '';

        // Stan
        const vars = data.variables || [];
        const groups = {};
        for (const v of vars) (groups[v.plugin === 'user' ? 'Twoje zmienne' : (plugin(v.plugin) || {}).name || v.plugin] ||= []).push(v);
        $('fStateVar').innerHTML = '<option value="">— brak (zwykły przycisk) —</option>' + Object.entries(groups).map(([g, list]) =>
            `<optgroup label="${esc(g)}">${list.map((v) => `<option value="${esc(v.name)}">${esc(v.label)} — ${esc(v.name)}</option>`).join('')}</optgroup>`).join('') +
            (b.stateVar && !vars.some((v) => v.name === b.stateVar) ? `<option value="${esc(b.stateVar)}">${esc(b.stateVar)}</option>` : '');
        $('fStateVar').value = b.stateVar || '';
        $('stateOn').classList.toggle('disabled', !b.stateVar);
        const on = b.on || {};
        $('fOnLabel').value = on.label || '';
        colorRow('onBgColors', ['', ...PALETTE], on.bg || '', (c) => update((x) => { x.on = { ...(x.on || {}), bg: c }; }));
        $('fOnGlyph').innerHTML = '<option value="">— bez zmian —</option>' + Object.keys(R.GLYPHS).map((g) => `<option value="${g}">${esc(R.GLYPH_LABELS[g] || g)}</option>`).join('');
        $('fOnGlyph').value = on.icon && on.icon.type === 'glyph' ? on.icon.value : '';
    }

    function colorRow(id, colors, current, onPick) {
        const box = $(id);
        box.innerHTML = colors.map((c) => `<button data-c="${c}" title="${c || 'Automatyczny / bez zmian'}" class="${c === current ? 'active' : ''}${c ? '' : ' auto'}" style="background:${c || 'transparent'}"></button>`).join('') +
            `<input type="color" value="${/^#[\da-f]{6}$/i.test(current) ? current : '#ff4fa6'}" title="Własny kolor">`;
        box.onclick = (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            onPick(b.dataset.c);
            box.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
        };
        box.querySelector('input').oninput = (e) => { onPick(e.target.value); box.querySelectorAll('button').forEach((x) => x.classList.remove('active')); };
    }

    // Biblioteka ikon i emoji
    $('glyphs').innerHTML = Object.keys(R.GLYPHS).map((g) => `<button data-g="${g}" title="${esc(R.GLYPH_LABELS[g] || g)}">${R.glyph(g)}</button>`).join('');
    $('glyphs').onclick = (e) => {
        const b = e.target.closest('[data-g]');
        if (b) update((x) => { x.icon = { type: 'glyph', value: b.dataset.g }; }, { rerender: true });
    };
    $('emojis').innerHTML = EMOJIS.map((em) => `<button data-e="${em}">${em}</button>`).join('');
    $('emojis').onclick = (e) => {
        const b = e.target.closest('[data-e]');
        if (b) update((x) => { x.icon = { type: 'emoji', value: b.dataset.e }; }, { rerender: true });
    };
    $('fEmoji').oninput = () => update((x) => { x.icon = { type: 'emoji', value: $('fEmoji').value }; });
    $('iconType').onclick = (e) => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        const t = b.dataset.v;
        update((x) => {
            if (t === 'none') x.icon = { type: 'none' };
            if (t === 'glyph') x.icon = { type: 'glyph', value: x.icon && x.icon.type === 'glyph' ? x.icon.value : 'star' };
            if (t === 'emoji') x.icon = { type: 'emoji', value: x.icon && x.icon.type === 'emoji' ? x.icon.value : '🎮' };
            if (t === 'image') x.icon = x.icon && x.icon.type === 'image' ? x.icon : { type: 'image', value: '' };
        }, { rerender: true });
        if (t === 'image' && !(rawButton().icon || {}).value) pickImage();
    };
    async function pickImage() {
        try {
            const name = await deck.pickFile({ image: true });
            if (name) update((x) => { x.icon = { type: 'image', value: name, fill: Boolean(x.icon && x.icon.fill) }; }, { rerender: true });
        } catch (err) { toast(err.message, 'error'); }
    }
    $('btnImage').onclick = pickImage;
    $('fImageFill').onchange = () => update((x) => { x.icon = { ...(x.icon || {}), fill: $('fImageFill').checked }; });
    $('fLabel').oninput = () => update((x) => { x.label = $('fLabel').value; });
    $('fLabelPos').onchange = () => update((x) => { x.labelPos = $('fLabelPos').value; });
    $('fFont').oninput = () => { $('fFontVal').textContent = `${$('fFont').value}px`; update((x) => { x.fontSize = parseInt($('fFont').value, 10); }); };

    // Zakładki inspektora
    document.querySelectorAll('.insp-tabs .m-tab').forEach((t) => t.addEventListener('click', () => {
        document.querySelectorAll('.insp-tabs .m-tab').forEach((x) => x.classList.toggle('active', x === t));
        document.querySelectorAll('.insp-body').forEach((p) => { p.hidden = p.dataset.pane !== t.dataset.tab; });
    }));

    // Stan
    $('fStateVar').onchange = () => update((x) => { x.stateVar = $('fStateVar').value || undefined; }, { rerender: true });
    $('fOnLabel').oninput = () => update((x) => { x.on = { ...(x.on || {}), label: $('fOnLabel').value }; });
    $('fOnGlyph').onchange = () => update((x) => { x.on = { ...(x.on || {}), icon: $('fOnGlyph').value ? { type: 'glyph', value: $('fOnGlyph').value } : undefined }; });
    $('btnMakeToggle').onclick = async () => {
        let name = rawButton().stateVar;
        if (!name || (data.variables.find((v) => v.name === name) || {}).plugin !== 'user') {
            name = await ask('Nazwa zmiennej przełącznika', `stan_${(rawButton().label || 'przycisk').toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]+/g, '_').replace(/^_|_$/g, '') || 'przycisk'}`);
            if (!name) return;
            await deck.setVariable(name, false, 'bool');
            data.variables = await deck.variables();
        }
        update((x) => {
            x.stateVar = name;
            x.actions = x.actions || {};
            x.actions.press = x.actions.press || [];
            if (!x.actions.press.some((a) => a.plugin === 'deck' && a.action === 'toggle-variable' && a.config && a.config.name === name)) {
                x.actions.press.push({ plugin: 'deck', action: 'toggle-variable', config: { name } });
            }
            x.on = { bg: '#e6007e', ...(x.on || {}) };
        }, { rerender: true });
        toast('Gotowe — każde naciśnięcie przełącza stan.', 'success');
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
        const list = ((rawButton().actions || {}).press) || [];
        if (!list.length) return toast('Ten przycisk nie ma akcji naciśnięcia.', 'info');
        const res = await deck.testActions(list);
        toast(res.ok ? 'Akcje wykonane' : res.errors.join(' · '), res.ok ? 'success' : 'error');
    };

    // ───── Akcje ─────
    $('phase').onclick = (e) => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        phase = b.dataset.v;
        $('phase').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
        renderActions();
    };
    function renderActions() {
        $('phaseHint').textContent = PHASES[phase];
        const list = ((rawButton() || {}).actions || {})[phase] || [];
        $('actionsList').innerHTML = list.length ? list.map((item, i) => actionCard(item, i)).join('') : '<div class="m-small">Brak akcji. Dodaj pierwszą poniżej.</div>';
        list.forEach((item, i) => wireAction(item, i));
    }
    function actionCard(item, i) {
        const p = plugin(item.plugin);
        const a = actionDef(item);
        const fields = (a && a.fields) || [];
        return `<div class="act${item.enabled === false ? ' off' : ''}${item._collapsed ? ' collapsed' : ''}" data-i="${i}">
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
        if (f.type === 'bool') return `<label class="check"><input type="checkbox" ${attrs} ${v ? 'checked' : ''}> ${esc(f.label)}</label>${help}`;
        if (f.type === 'textarea') return `<div class="m-field">${label}<textarea class="m-input" ${attrs} placeholder="${esc(f.placeholder || '')}">${esc(v ?? '')}</textarea>${help}</div>`;
        if (f.type === 'select') {
            const opts = f.options || [];
            return `<div class="m-field">${label}<div class="field-row"><select class="m-select" ${attrs} data-dynamic="${f.dynamic ? 1 : ''}" data-value="${esc(v ?? '')}">
                ${opts.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
                ${f.dynamic ? `<option value="${esc(v ?? '')}">${v ? esc(v) : 'Wczytywanie…'}</option>` : ''}
              </select>${f.dynamic ? '<button class="m-btn small icon-only" data-refresh title="Odśwież listę">⟳</button>' : ''}</div>${help}</div>`;
        }
        if (f.type === 'hotkey') return `<div class="m-field">${label}<div class="field-row"><input class="m-input hotkey-input" ${attrs} value="${esc(v ?? '')}" placeholder="${esc(f.placeholder || 'Kliknij i naciśnij skrót')}">
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
        box.querySelectorAll('[data-record]').forEach((b) => b.addEventListener('click', () => recordHotkey(b.parentElement.querySelector('input'), (v) => setConfig(i, b.parentElement.querySelector('input').dataset.key, v))));
    }
    async function loadOptions(item, key, select) {
        const cacheKey = `${item.plugin}/${item.action}/${key}`;
        const current = select.dataset.value;
        let opts = optionsCache[cacheKey];
        if (!opts) { opts = await deck.fieldOptions(item.plugin, item.action, key); optionsCache[cacheKey] = opts; }
        const has = opts.some((o) => String(o.value) === String(current));
        select.innerHTML = (current && !has ? `<option value="${esc(current)}">${esc(current)} (niedostępne)</option>` : '') +
            (!current ? '<option value="">— wybierz —</option>' : '') +
            opts.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
        select.value = current || '';
        if (!opts.length) select.innerHTML += '<option value="" disabled>Brak pozycji (sprawdź połączenie wtyczki)</option>';
    }
    // Nagrywanie skrótu: naciśnij kombinację, a pole zapisze np. „ctrl+shift+m”
    function recordHotkey(input, onDone) {
        input.classList.add('listening');
        input.value = 'Naciśnij skrót…';
        const names = { Control: 'ctrl', Shift: 'shift', Alt: 'alt', AltGraph: 'altgr', Meta: 'super', ' ': 'space', Escape: 'esc', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', PageUp: 'pageup', PageDown: 'pagedown', Delete: 'delete', Backspace: 'backspace', Enter: 'enter', Tab: 'tab', Insert: 'insert', Home: 'home', End: 'end', PrintScreen: 'printscreen', MediaPlayPause: 'playpause', MediaTrackNext: 'next', MediaTrackPrevious: 'previous', AudioVolumeUp: 'volumeup', AudioVolumeDown: 'volumedown', AudioVolumeMute: 'mute' };
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
            // Pierwsza akcja nadaje pustemu przyciskowi sensowny napis
            if (!x.label) x.label = def.name;
        }, { rerender: true });
        PitayaUI.closeModal('modalAction');
        document.querySelector('.insp-tabs [data-tab="actions"]').click();
    };

    // Wstawianie zmiennej do napisu
    function variableRows(list, clickable) {
        const groups = {};
        for (const v of list) (groups[v.plugin === 'user' ? 'Twoje zmienne' : (plugin(v.plugin) || {}).name || v.plugin] ||= []).push(v);
        return Object.entries(groups).map(([g, vs]) => `<div class="var-group">${esc(g)}</div>` + vs.map((v) =>
            `<div class="var-row${clickable ? ' clickable' : ''}" data-var="${esc(v.name)}"><code>{${esc(v.name)}}</code><span class="vl">${esc(v.label)}</span><span class="vv">${esc(v.text)}</span></div>`).join('')).join('');
    }
    $('btnInsertVar').onclick = async () => {
        data.variables = await deck.variables();
        $('varPicker').innerHTML = variableRows(data.variables, true);
        PitayaUI.openModal('modalVars');
    };
    $('varPicker').onclick = (e) => {
        const row = e.target.closest('[data-var]');
        if (!row) return;
        const input = $('fLabel');
        const pos = input.selectionStart ?? input.value.length;
        input.value = input.value.slice(0, pos) + `{${row.dataset.var}}` + input.value.slice(input.selectionEnd ?? pos);
        update((x) => { x.label = input.value; });
        PitayaUI.closeModal('modalVars');
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

    // Nowe urządzenie czeka na zgodę
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
            ${p.settings.map((s) => fieldHtml(s, p.values[s.key])).join('')}
            ${p.variables.length ? `<div class="m-small">Zmienne: ${p.variables.map((v) => `<code>{${esc(v.id)}}</code>`).join(' ')}</div>` : ''}
        </div>`).join('');
        $('pluginsList').querySelectorAll('.plug').forEach((box) => {
            const id = box.dataset.plugin;
            box.querySelector('[data-enable]').onchange = async (e) => { data.plugins = await deck.pluginToggle(id, !e.target.checked); renderPlugins(); };
            let t = null;
            box.querySelectorAll('[data-key]').forEach((input) => {
                input.addEventListener(input.dataset.type === 'bool' ? 'change' : 'input', () => {
                    clearTimeout(t);
                    t = setTimeout(async () => {
                        const patch = {};
                        box.querySelectorAll('[data-key]').forEach((x) => { patch[x.dataset.key] = x.dataset.type === 'bool' ? x.checked : x.dataset.type === 'number' ? Number(x.value) : x.value; });
                        await deck.pluginSettings(id, patch);
                        optionsCache = {};
                    }, 500);
                });
            });
        });
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
    deck.on('pairing', (d) => { if (!pairingQueue.some((x) => x.id === d.id)) pairingQueue.push(d); showPairing(); });
    // Serwer i wtyczki wystartowały — odświeżamy tylko to, co od nich zależy (bez przerysowania siatki)
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
        const cell = parseInt(getComputedStyle($('grid')).getPropertyValue('--cell'), 10) || 100;
        for (const el of $('grid').children) {
            const key = el.dataset.key;
            R.paint(el, fixImage(state.buttons[key]) || null, cell);
            el.dataset.key = key;
            el.draggable = Boolean(state.buttons[key]);
            if (key === selected) el.classList.add('selected');
        }
        if (selected && state.buttons[selected]) paintInspPreview(fixImage(state.buttons[selected]));
    });

    load();
})();
