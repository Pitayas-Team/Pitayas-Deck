// ═══════ PITAYA DECK — EDYTOR: POWŁOKA ═══════
// Wspólny stan i pomocnicze funkcje dla wszystkich stron (window.PD).
(function () {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const R = window.PitayaDeckRender;

    const PD = window.PD = {
        $, esc, clone, R,
        data: null,             // { deck, plugins, variables, server, devices }
        profileId: null,
        folderId: null,
        lucide: null,           // { icons, tags }
        page: 'deck',
        hooks: {},              // strony rejestrują: render(), onVars() …
        toast: (t, k) => window.PitayaUI && PitayaUI.showToast(String(t), k === 'error' ? 'error' : k || 'info'),
        errText: (err) => String((err && err.message) || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''),
    };

    // Ikony Lucide w HTML: <span data-i="nazwa"></span>
    PD.icon = (name, cls = '') => (PD.lucide && PD.lucide.icons[name] ? `<span class="ico ${cls}">${R.lucide(PD.lucide.icons[name])}</span>` : '');
    PD.fillIcons = (root = document) => {
        root.querySelectorAll('[data-i]').forEach((el) => {
            if (el.dataset.iDone === el.dataset.i) return;
            const svg = PD.lucide && PD.lucide.icons[el.dataset.i];
            if (!svg) return;
            el.dataset.iDone = el.dataset.i;
            el.insertAdjacentHTML('afterbegin', `<span class="ico">${R.lucide(svg)}</span>`);
        });
    };

    // Ulubione (typy widżetów, akcje) — zapamiętane w tym edytorze
    PD.favList = (kind) => { try { return JSON.parse(localStorage.getItem(`pd-fav-${kind}`) || '[]'); } catch { return []; } };
    PD.favToggle = (kind, id) => {
        const l = PD.favList(kind);
        const next = l.includes(id) ? l.filter((x) => x !== id) : [...l, id];
        try { localStorage.setItem(`pd-fav-${kind}`, JSON.stringify(next)); } catch {}
        PD.toast(next.includes(id) ? 'Dodano do ulubionych' : 'Usunięto z ulubionych');
        return next.includes(id);
    };
    PD.profile = () => PD.data.deck.profiles.find((p) => p.id === PD.profileId) || PD.data.deck.profiles[0];
    PD.folder = (id = PD.folderId) => PD.data.deck.folders[id];
    PD.plugin = (id) => PD.data.plugins.find((p) => p.id === id);
    PD.actionDef = (item) => { const p = PD.plugin(item.plugin); return p && p.actions.find((a) => a.id === item.action); };
    PD.imgBase = () => (PD.data.server.port ? `http://127.0.0.1:${PD.data.server.port}` : '');
    PD.fixImage = (b) => {
        if (!b) return b;
        const out = { ...b };
        if (out.icon && out.icon.type === 'image' && out.icon.value && out.icon.value.startsWith('/img/')) out.icon = { ...out.icon, value: PD.imgBase() + out.icon.value };
        if (out.media && out.media.art && out.media.art.startsWith('/')) out.media = { ...out.media, art: PD.imgBase() + out.media.art };
        return out;
    };
    PD.inProfile = (fid) => {
        let f = PD.data.deck.folders[fid];
        while (f && f.parent) f = PD.data.deck.folders[f.parent];
        return f && f.id === PD.profile().root;
    };

    // Okno z polem tekstowym (window.prompt w Electronie nie działa)
    PD.ask = (title, value = '', placeholder = '') => new Promise((resolve) => {
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
    PD.confirm = (title, text, okLabel = 'Usuń') => new Promise((resolve) => {
        const el = document.createElement('div');
        el.className = 'm-modal-overlay active';
        el.innerHTML = `<div class="m-modal"><div class="m-modal-header"><span class="m-modal-title">${esc(title)}</span></div>
            <div class="m-modal-body"><div class="m-small" style="font-size:13.5px">${esc(text)}</div></div>
            <div class="m-modal-footer"><button class="m-btn small" data-r="0">Anuluj</button><button class="m-btn small danger" data-r="1">${esc(okLabel)}</button></div></div>`;
        document.body.appendChild(el);
        el.querySelector('[data-r="1"]').onclick = () => { el.remove(); resolve(true); };
        el.querySelector('[data-r="0"]').onclick = () => { el.remove(); resolve(false); };
    });

    // Po przypięciu: raport, gdzie widżet coś zasłoni albo się nie zmieści (i propozycja przeniesienia)
    PD.pinFlow = async (folderId, key) => {
        const r = await deck.pinReport(folderId, key);
        const pos = (k) => { const [x, y] = k.split(',').map(Number); return `kolumna ${x + 1}, wiersz ${y + 1}`; };
        if (!r.covers.length && !r.tooSmall.length && !r.blockedBy.length) return PD.toast(`Przypięto — widżet jest teraz w ${r.folders + 1} folderach profilu`, 'success');
        const el = document.createElement('div');
        el.className = 'm-modal-overlay active';
        el.innerHTML = `<div class="m-modal"><div class="m-modal-header"><span class="m-modal-title">Przypięto — ale są miejsca z kolizją</span></div>
            <div class="m-modal-body pin-report">
              ${r.covers.length ? `<div class="pr-sec"><b>Zasłoni widżety (${r.covers.length})</b>${r.covers.map((c) => `<div class="pr-row">${PD.icon('folder')}<span>${esc(c.folder)}</span><small>„${esc(c.label)}” · ${pos(c.key)}</small></div>`).join('')}</div>` : ''}
              ${r.tooSmall.length ? `<div class="pr-sec"><b>Nie zmieści się — za mała siatka (${r.tooSmall.length})</b>${r.tooSmall.map((c) => `<div class="pr-row">${PD.icon('grid-3x3')}<span>${esc(c.folder)}</span><small>siatka ${esc(c.grid)}</small></div>`).join('')}</div>` : ''}
              ${r.blockedBy.length ? `<div class="pr-sec"><b>Zajęte przez inny przypięty widżet (${r.blockedBy.length})</b>${r.blockedBy.map((c) => `<div class="pr-row">${PD.icon('pin')}<span>${esc(c.folder)}</span><small>„${esc(c.label)}” z folderu ${esc(c.from)}</small></div>`).join('')}</div>` : ''}
            </div>
            <div class="m-modal-footer">${r.covers.length ? '<button class="m-btn small accent" data-r="move">Przenieś zasłonięte w wolne miejsca</button>' : ''}<button class="m-btn small" data-r="ok">OK</button></div></div>`;
        document.body.appendChild(el);
        PD.fillIcons(el);
        await new Promise((resolve) => el.addEventListener('click', async (e) => {
            const b = e.target.closest('[data-r]');
            if (!b) return;
            if (b.dataset.r === 'move') {
                const res = await deck.pinRelocate(folderId, key);
                PD.toast(`Przeniesiono: ${res.moved.length}${res.failed.length ? ` · brak miejsca w: ${res.failed.map((f) => f.folder).join(', ')}` : ''}`, res.failed.length ? 'error' : 'success');
            }
            el.remove();
            resolve();
        }));
        await PD.reload();
        if (PD.page === 'deck' && PD.renderGrid) PD.renderGrid();
    };

    // Menu kontekstowe w miejscu kliknięcia: items = [[id, etykieta, ikona, klasa]] albo null (separator)
    PD.menu = (x, y, items, onPick) => {
        const m = $('ctxMenu');
        m.innerHTML = items.map((it) => (it ? `<button data-cmd="${it[0]}" class="${it[3] || ''}" ${it[4] ? 'disabled' : ''}>${PD.icon(it[2] || 'dot')}${esc(it[1])}</button>` : '<div class="ctx-sep"></div>')).join('');
        m.hidden = false;
        const r = m.getBoundingClientRect();
        m.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`;
        m.style.top = `${Math.min(y, innerHeight - r.height - 8)}px`;
        m.onclick = (e) => { const b = e.target.closest('[data-cmd]'); if (!b || b.disabled) return; m.hidden = true; onPick(b.dataset.cmd); };
    };
    addEventListener('mousedown', (e) => { if (!e.target.closest('#ctxMenu')) $('ctxMenu').hidden = true; }, true);
    addEventListener('keydown', (e) => { if (e.key === 'Escape') $('ctxMenu').hidden = true; });

    // ───── Strony ─────
    // Ostatnio otwarte miejsce (profil, folder, strona) — edytor wraca tam po uruchomieniu
    PD.saveLast = (extra) => {
        try {
            const prev = JSON.parse(localStorage.getItem('pd-last') || '{}');
            localStorage.setItem('pd-last', JSON.stringify({ ...prev, profileId: PD.profileId, folderId: PD.folderId, ...extra }));
        } catch {}
    };
    PD.go = (page, arg) => {
        if (PD.hooks.beforeLeave) { const fn = PD.hooks.beforeLeave; PD.hooks.beforeLeave = null; fn(); }
        PD.page = page;
        if (PD.closeColorPicker) PD.closeColorPicker();
        if (!['integration'].includes(page)) PD.saveLast({ page, arg: page === 'widget' || page === 'store' ? arg || null : null });
        document.querySelectorAll('.page').forEach((p) => { p.hidden = p.dataset.page !== page; });
        const railPage = { widget: 'deck', integration: 'integrations' }[page] || page;
        document.querySelectorAll('#rail [data-page]').forEach((a) => a.classList.toggle('active', a.dataset.page === railPage));
        const h = PD.hooks[page];
        if (h && h.show) h.show(arg);
        PD.fillIcons();
    };
    $('rail').addEventListener('click', (e) => { const a = e.target.closest('[data-page]'); if (a) PD.go(a.dataset.page); });
    document.addEventListener('click', (e) => { const g = e.target.closest('[data-goto]'); if (g) PD.go(g.dataset.goto); });
    $('btnRail').onclick = () => {
        document.body.classList.toggle('rail-collapsed');
        try { localStorage.setItem('pd-rail', document.body.classList.contains('rail-collapsed') ? '1' : '0'); } catch {}
    };
    try { if (localStorage.getItem('pd-rail') === '1') document.body.classList.add('rail-collapsed'); } catch {}

    // ───── Profil (u góry, jak w Macro Deck) ─────
    PD.renderProfiles = () => {
        const p = PD.profile();
        $('ppName').textContent = p.name;
        $('ppBadge').textContent = (p.name || '?').trim()[0].toUpperCase();
        $('ppMenu').innerHTML = PD.data.deck.profiles.map((x) => `<button data-pid="${esc(x.id)}" class="${x.id === p.id ? 'active' : ''}"><span class="pp-badge">${esc((x.name || '?').trim()[0].toUpperCase())}</span>${esc(x.name)}<small>${x.cols}×${x.rows}</small></button>`).join('') +
            `<div class="ctx-sep"></div>
             <button data-pact="add">${PD.icon('plus')}Nowy profil</button>
             <button data-pact="rename">${PD.icon('pencil')}Zmień nazwę</button>
             <button data-pact="size">${PD.icon('grid-3x3')}Rozmiar siatki profilu</button>
             <button data-pact="delete" class="danger">${PD.icon('trash-2')}Usuń profil</button>`;
    };
    $('ppBtn').onclick = (e) => { e.stopPropagation(); $('ppMenu').hidden = !$('ppMenu').hidden; };
    addEventListener('click', (e) => { if (!e.target.closest('#profilePicker')) $('ppMenu').hidden = true; });
    $('ppMenu').onclick = async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        $('ppMenu').hidden = true;
        if (b.dataset.pid) {
            PD.profileId = b.dataset.pid;
            PD.folderId = PD.profile().root;
            await PD.reload();
            return PD.go('deck');
        }
        const p = PD.profile();
        const act = b.dataset.pact;
        if (act === 'add') {
            const name = await PD.ask('Nowy profil', '', 'np. Gry, Stream, Praca');
            if (!name) return;
            const np = await deck.addProfile(name);
            PD.profileId = np.id; PD.folderId = np.root;
        }
        if (act === 'rename') { const name = await PD.ask('Nazwa profilu', p.name); if (name) await deck.updateProfile(p.id, { name }); }
        if (act === 'size') {
            const v = await PD.ask('Rozmiar siatki profilu (kolumny × wiersze)', `${p.cols}x${p.rows}`, 'np. 5x3');
            const m = v && v.match(/(\d+)\s*[x×*, ]\s*(\d+)/i);
            if (m) await deck.updateProfile(p.id, { cols: m[1], rows: m[2] });
        }
        if (act === 'delete') {
            if (PD.data.deck.profiles.length <= 1) return PD.toast('To jedyny profil — nie można go usunąć.', 'error');
            if (!(await PD.confirm('Usunąć profil?', `Profil „${p.name}” zostanie usunięty razem z folderami i przyciskami.`))) return;
            await deck.deleteProfile(p.id);
            PD.profileId = null;
        }
        await PD.reload();
        PD.go('deck');
    };

    // ───── Dane ─────
    PD.reload = async () => {
        PD.data = await deck.get();
        if (!PD.data.deck.profiles.some((p) => p.id === PD.profileId)) PD.profileId = PD.data.deck.profiles[0].id;
        if (!PD.data.deck.folders[PD.folderId] || !PD.inProfile(PD.folderId)) PD.folderId = PD.profile().root;
        PD.renderProfiles();
        PD.renderConnection();
        PD.renderDevicesBadge();
        PD.saveLast();
        return PD.data;
    };

    // ───── Połączenie i urządzenia ─────
    PD.renderConnection = () => {
        const online = (PD.data.devices || []).filter((d) => d.online).length;
        const url = PD.data.server.urls[0];
        $('connDot').classList.toggle('active', online > 0);
        $('connText').textContent = !PD.data.server.port ? 'Serwer nie działa' : online ? `Połączone: ${online}` : `Czeka na telefon · ${url ? url.url.replace('http://', '') : `port ${PD.data.server.port}`}`;
        $('statusRight').textContent = PD.data.server.port ? `Serwer: ${url ? url.url.replace('http://', '') : `port ${PD.data.server.port}`}` : '';
    };
    PD.renderDevicesBadge = () => {
        const pending = (PD.data.devices || []).filter((d) => !d.approved && !d.denied).length;
        $('devBadge').hidden = !pending;
        $('devBadge').textContent = pending;
    };
    let qrUrl = null;
    PD.openConnect = async () => {
        Object.assign(PD.data, await deck.get());
        const urls = PD.data.server.urls;
        if (!urls.length) $('urls').innerHTML = '<div class="m-small">Brak połączenia z siecią — podłącz komputer do Wi‑Fi albo kabla.</div>';
        else {
            qrUrl = qrUrl && urls.some((u) => u.url === qrUrl) ? qrUrl : urls[0].url;
            $('urls').innerHTML = urls.map((u) => `<div class="url-row${u.url === qrUrl ? ' active' : ''}" data-url="${esc(u.url)}"><code>${esc(u.url)}</code><small>${esc(u.name)}</small><button class="m-btn small" data-open>Otwórz</button></div>`).join('');
            $('qrImg').src = await deck.qr(qrUrl);
        }
        $('fApproval').checked = PD.data.deck.settings.requireApproval;
        PitayaUI.openModal('modalConnect');
    };
    $('connPill').onclick = PD.openConnect;
    $('urls').onclick = async (e) => {
        const row = e.target.closest('[data-url]');
        if (!row) return;
        if (e.target.hasAttribute('data-open')) return deck.openUrl(row.dataset.url);
        qrUrl = row.dataset.url;
        $('urls').querySelectorAll('.url-row').forEach((r) => r.classList.toggle('active', r === row));
        $('qrImg').src = await deck.qr(qrUrl);
    };
    $('fApproval').onchange = async () => { await deck.settings({ requireApproval: $('fApproval').checked }); PD.data.deck.settings.requireApproval = $('fApproval').checked; };

    const pairingQueue = [];
    function showPairing() {
        const d = pairingQueue[0];
        if (!d) return PitayaUI.closeModal('modalPairing');
        $('pairName').textContent = d.name;
        $('pairIp').textContent = d.ip ? `Adres: ${d.ip.replace('::ffff:', '')}` : '';
        PitayaUI.openModal('modalPairing');
    }
    async function answerPairing(ok) { const d = pairingQueue.shift(); if (d) await deck.approve(d.id, ok); showPairing(); }
    $('btnPairOk').onclick = () => answerPairing(true);
    $('btnPairDeny').onclick = () => answerPairing(false);
    $('btnMax').onclick = () => deck.maximize();
    // Plakietka aktualizacji z Pitaya Core prowadzi do Ustawień
    $('updatePill').addEventListener('click', () => PD.go('settings'));

    // ───── Zdarzenia z procesu głównego ─────
    deck.on('notify', (text, kind) => PD.toast(text, kind));
    deck.on('devices', (list) => {
        if (!PD.data) return;
        PD.data.devices = list;
        PD.renderConnection();
        PD.renderDevicesBadge();
        if (PD.page === 'devices' && PD.hooks.devices) PD.hooks.devices.show();
    });
    deck.on('pairing', (d) => { if (!pairingQueue.some((x) => x.id === d.id)) pairingQueue.push(d); showPairing(); });
    deck.on('plugins', (list) => { if (!PD.data) return; PD.data.plugins = list; if (PD.hooks.onPlugins) PD.hooks.onPlugins(); });
    deck.on('ready', async () => {
        if (!PD.data) return;
        const d = await deck.get();
        Object.assign(PD.data, { plugins: d.plugins, variables: d.variables, server: d.server, devices: d.devices });
        PD.renderConnection();
        if (PD.hooks.onPlugins) PD.hooks.onPlugins();
    });
    deck.on('vars-changed', () => { if (PD.data && PD.hooks.onVars) PD.hooks.onVars(); });

    // ───── Start ─────
    PD.start = async () => {
        PD.lucide = await deck.lucide();
        PD.fillIcons();
        let last = {};
        try { last = JSON.parse(localStorage.getItem('pd-last') || '{}'); } catch {}
        PD.profileId = last.profileId || null;
        PD.folderId = last.folderId || null;
        await PD.reload();
        const info = await window.pitayaBridge.getAppInfo().catch(() => null);
        if (info) $('statusVersion').textContent = `Wersja ${info.version} · Pitaya Core ${info.coreVersion}`;
        const a = last.arg;
        if (last.page === 'widget' && a && PD.data.deck.folders[a.folderId] && PD.data.deck.folders[a.folderId].buttons[a.key]) PD.go('widget', { folderId: a.folderId, key: a.key });
        else if (last.page && last.page !== 'widget' && PD.hooks[last.page]) PD.go(last.page, a || undefined);
        else PD.go('deck');
    };
    setTimeout(() => PD.start(), 0);
})();
