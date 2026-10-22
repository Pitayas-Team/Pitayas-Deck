// ═══════ PITAYA DECK — EDYTOR: POZOSTAŁE STRONY ═══════
(function () {
    const { $, esc, clone, R } = PD;
    const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

    // ═════ SKRYPTY ═════
    let scriptSel = null, scriptEd = null, scriptTimer = null;
    const scripts = () => PD.data.deck.scripts || (PD.data.deck.scripts = []);
    const saveScripts = () => { clearTimeout(scriptTimer); scriptTimer = setTimeout(() => deck.setScripts(scripts()), 250); };
    function renderScripts() {
        $('scriptList').innerHTML = scripts().map((s) => `<button class="split-item${s.id === scriptSel ? ' active' : ''}" data-id="${esc(s.id)}">${PD.icon('list-video')}<span>${esc(s.name)}</span><span class="n">${PD.countBlocks(s.blocks)}</span></button>`).join('') || '<div class="empty-note">Brak skryptów.</div>';
        const s = scripts().find((x) => x.id === scriptSel);
        if (!s) { $('scriptMain').innerHTML = `<div class="empty-big">${PD.icon('list-video')}<b>Nie wybrano skryptu</b><span>Wybierz skrypt z listy albo utwórz nowy.</span></div>`; PD.fillIcons($('scriptMain')); return; }
        $('scriptMain').innerHTML = `<div class="sm-head"><input class="m-input title-in" id="scName" value="${esc(s.name)}"><button class="m-btn small" id="scRun">${PD.icon('play')}Uruchom</button><button class="m-btn small danger" id="scDel">${PD.icon('trash-2')}Usuń</button></div>
            <div class="m-small">Użyj w przycisku: akcja <b>Deck → Uruchom skrypt</b>.</div><div class="ab-list" id="scBlocks"></div>`;
        $('scName').oninput = () => { s.name = $('scName').value; saveScripts(); $('scriptList').querySelector(`[data-id="${CSS.escape(s.id)}"] span:nth-of-type(1)`).textContent = s.name; };
        $('scDel').onclick = async () => {
            if (!(await PD.confirm('Usunąć skrypt?', `Skrypt „${s.name}” zostanie usunięty. Przyciski, które go uruchamiają, zgłoszą błąd.`))) return;
            PD.data.deck.scripts = scripts().filter((x) => x !== s); scriptSel = null; await deck.setScripts(scripts()); renderScripts();
        };
        $('scRun').onclick = async () => { await deck.setScripts(scripts()); const r = await deck.testActions(clone(s.blocks || [])); PD.toast(r.ok ? 'Wykonano' : r.errors.join(' · '), r.ok ? 'success' : 'error'); };
        scriptEd = PD.createBlockEditor({ el: $('scBlocks'), getRoot: () => s, basePath: ['blocks'], emptyText: 'Skrypt nie ma jeszcze akcji.', mutate: (fn, rerender) => { fn(s); saveScripts(); if (rerender !== false) { scriptEd.render(); $('scriptList').querySelector('.split-item.active .n').textContent = PD.countBlocks(s.blocks); } } });
        scriptEd.render();
        PD.fillIcons($('scriptMain'));
    }
    $('scriptList').onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) { scriptSel = b.dataset.id; renderScripts(); } };
    $('btnScriptAdd').onclick = async () => {
        const name = await PD.ask('Nowy skrypt', '', 'np. Start streamu');
        if (!name) return;
        const s = { id: uid('sc'), name, blocks: [] };
        scripts().push(s); scriptSel = s.id;
        await deck.setScripts(scripts());
        renderScripts();
    };
    PD.hooks.scripts = { show: async () => { await PD.reload(); renderScripts(); } };

    // ═════ AUTOMATYZACJE ═════
    let autoSel = null, autoEd = null, autoTimer = null;
    const autos = () => PD.data.deck.automations || (PD.data.deck.automations = []);
    const saveAutos = () => { clearTimeout(autoTimer); autoTimer = setTimeout(() => deck.setAutomations(autos()), 300); };
    const TRIG = { variable: 'Gdy zmienna spełni warunek', change: 'Gdy zmienna się zmieni', time: 'O godzinie', interval: 'Co jakiś czas', start: 'Po uruchomieniu Pitaya Deck' };
    const DAYS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
    const trigText = (t) => {
        t = t || {};
        if (t.type === 'variable') return `{${t.var || '?'}} ${(PD.OPS.find((o) => o[0] === t.op) || ['', t.op || ''])[1]}${PD.UNARY.has(t.op) ? '' : ` ${t.value ?? ''}`}`;
        if (t.type === 'change') return `zmiana {${t.var || '?'}}`;
        if (t.type === 'time') return `${t.at || '--:--'}${(t.days || []).length && t.days.length < 7 ? ` · ${t.days.map((d) => DAYS[d]).join(', ')}` : ''}`;
        if (t.type === 'interval') return `co ${t.seconds || 60} s`;
        if (t.type === 'start') return 'przy starcie';
        return '';
    };
    function renderAutos() {
        $('autoList').innerHTML = autos().map((a) => `<button class="split-item${a.id === autoSel ? ' active' : ''}${a.enabled === false ? ' off' : ''}" data-id="${esc(a.id)}">${PD.icon('zap')}<span>${esc(a.name)}<small>${esc(trigText(a.trigger))}</small></span></button>`).join('') || '<div class="empty-note">Nie masz jeszcze automatyzacji.</div>';
        const a = autos().find((x) => x.id === autoSel);
        if (!a) { $('autoMain').innerHTML = `<div class="empty-big">${PD.icon('zap')}<b>Nie wybrano automatyzacji</b><span>Wybierz automatyzację po lewej albo utwórz nową.</span></div>`; PD.fillIcons($('autoMain')); return; }
        const t = a.trigger || { type: 'variable' };
        let trigBody = '';
        if (t.type === 'variable') trigBody = PD.condHtml({ join: 'and', rules: [{ left: t.var || '', op: t.op || 'isOn', right: t.value ?? '' }] }, ['__trig']).replace('<button class="chip" data-rule-add>＋ Warunek</button>', '').replace(/<button class="tool" data-rule-del[^>]*>[\s\S]*?<\/button>/, '');
        if (t.type === 'change') trigBody = `<button class="m-btn small var-btn" id="atVar">${t.var ? `{${esc(t.var)}}` : 'Wybierz zmienną…'}</button><div class="m-small">Nowa wartość jest w zmiennej {value}.</div>`;
        if (t.type === 'time') trigBody = `<div class="field-row"><input class="m-input" type="time" id="atTime" value="${esc(t.at || '08:00')}" style="max-width:140px"><div class="days" id="atDays">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button data-d="${d}" class="${!(t.days || []).length || (t.days || []).includes(d) ? 'active' : ''}">${DAYS[d]}</button>`).join('')}</div></div>`;
        if (t.type === 'interval') trigBody = `<div class="wait-row"><span>Co</span><input class="m-input" type="number" min="1" id="atSec" value="${esc(t.seconds || 60)}"><span>sekund</span></div>`;
        $('autoMain').innerHTML = `<div class="sm-head"><input class="m-input title-in" id="atName" value="${esc(a.name)}"><label class="toggle-row inline"><span>Włączona</span><input type="checkbox" class="switch" id="atOn" ${a.enabled === false ? '' : 'checked'}></label><button class="m-btn small" id="atRun">${PD.icon('play')}Uruchom</button><button class="m-btn small danger" id="atDel">${PD.icon('trash-2')}Usuń</button></div>
            <div class="card trig-card"><h3>${PD.icon('zap')}Wyzwalacz</h3><select class="m-select" id="atType">${Object.entries(TRIG).map(([k, l]) => `<option value="${k}" ${k === t.type ? 'selected' : ''}>${l}</option>`).join('')}</select><div id="atTrig">${trigBody}</div></div>
            <div class="card trig-card"><h3>${PD.icon('filter')}Uruchom tylko, gdy <span class="m-small">(opcjonalnie)</span></h3><div id="atCond">${PD.condHtml(a.cond, ['cond'])}</div></div>
            <div class="card"><h3>${PD.icon('play')}Akcje</h3><div class="ab-list" id="atBlocks"></div></div>`;
        const redraw = () => { saveAutos(); renderAutos(); };
        $('atName').oninput = () => { a.name = $('atName').value; saveAutos(); const it = $('autoList').querySelector('.split-item.active span'); if (it) it.firstChild.textContent = a.name; };
        $('atOn').onchange = () => { a.enabled = $('atOn').checked; redraw(); };
        $('atType').onchange = () => { a.trigger = { type: $('atType').value }; if (a.trigger.type === 'time') a.trigger.at = '08:00'; if (a.trigger.type === 'interval') a.trigger.seconds = 60; if (a.trigger.type === 'variable') a.trigger.op = 'isOn'; redraw(); };
        $('atDel').onclick = async () => { if (!(await PD.confirm('Usunąć automatyzację?', `„${a.name}” zostanie usunięta.`))) return; PD.data.deck.automations = autos().filter((x) => x !== a); autoSel = null; await deck.setAutomations(autos()); renderAutos(); };
        $('atRun').onclick = async () => { await deck.setAutomations(autos()); try { await deck.runAutomation(a.id); PD.toast('Uruchomiono', 'success'); } catch (err) { PD.toast(PD.errText(err), 'error'); } };
        if ($('atVar')) $('atVar').onclick = () => PD.pickVariable((n) => { a.trigger.var = n; redraw(); });
        if ($('atTime')) $('atTime').onchange = () => { a.trigger.at = $('atTime').value; redraw(); };
        if ($('atSec')) $('atSec').onchange = () => { a.trigger.seconds = Math.max(1, Number($('atSec').value) || 60); redraw(); };
        if ($('atDays')) $('atDays').onclick = (e) => {
            const b = e.target.closest('[data-d]'); if (!b) return;
            const all = [0, 1, 2, 3, 4, 5, 6];
            let days = (a.trigger.days || []).length ? a.trigger.days.slice() : all.slice();
            const d = Number(b.dataset.d);
            days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
            a.trigger.days = days.length === 7 ? [] : days;
            redraw();
        };
        // Warunek wyzwalacza „zmienna” korzysta z tego samego edytora warunku (jedna reguła)
        if (t.type === 'variable') {
            const holder = { __trig: { join: 'and', rules: [{ left: t.var || '', op: t.op || 'isOn', right: t.value ?? '' }] } };
            PD.wireCond($('atTrig'), () => holder, (fn, rerender) => { fn(holder); const r = holder.__trig.rules[0]; a.trigger.var = r.left; a.trigger.op = r.op; a.trigger.value = r.right; if (rerender !== false) redraw(); else saveAutos(); });
        }
        PD.wireCond($('atCond'), () => a, (fn, rerender) => { fn(a); if (rerender !== false) redraw(); else saveAutos(); });
        autoEd = PD.createBlockEditor({ el: $('atBlocks'), getRoot: () => a, basePath: ['blocks'], emptyText: 'Dodaj akcje, które mają się wykonać.', mutate: (fn, rerender) => { fn(a); saveAutos(); if (rerender !== false) autoEd.render(); } });
        autoEd.render();
        PD.fillIcons($('autoMain'));
    }
    $('autoList').onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) { autoSel = b.dataset.id; renderAutos(); } };
    $('btnAutoAdd').onclick = async () => {
        const name = await PD.ask('Nowa automatyzacja', '', 'np. Światło przy streamie');
        if (!name) return;
        const a = { id: uid('au'), name, enabled: true, trigger: { type: 'variable', var: '', op: 'isOn', value: '' }, cond: { join: 'and', rules: [] }, blocks: [] };
        autos().push(a); autoSel = a.id;
        await deck.setAutomations(autos());
        renderAutos();
    };
    PD.hooks.automations = { show: async () => { await PD.reload(); renderAutos(); } };

    // ═════ ZMIENNE ═════
    let varCat = 'all';
    async function renderVariables() {
        PD.data.variables = await deck.variables();
        const all = PD.data.variables;
        const groups = PD.varGroups(all);
        $('varCats').innerHTML = `<button class="split-item${varCat === 'all' ? ' active' : ''}" data-vc="all">${PD.icon('braces')}<span>Wszystkie zmienne</span><span class="n">${all.length}</span></button>
            <button class="split-item${varCat === 'user' ? ' active' : ''}" data-vc="user">${PD.icon('user')}<span>Twoje</span><span class="n">${(groups.get('user') || []).length}</span></button>
            <div class="split-sub">INTEGRACJE</div>` +
            [...groups.entries()].filter(([k]) => k !== 'user').map(([k, l]) => { const [, icon] = PD.lookOfPlugin(PD.plugin(k) || { id: k }); return `<button class="split-item${varCat === k ? ' active' : ''}" data-vc="${esc(k)}">${PD.icon(icon)}<span>${esc(PD.groupName(k))}</span><span class="n">${l.length}</span></button>`; }).join('');
        const q = $('varFilter').value.trim().toLowerCase();
        const list = all.filter((v) => (varCat === 'all' || (v.plugin === 'user' ? 'user' : v.plugin) === varCat) && (!q || `${v.name} ${v.label}`.toLowerCase().includes(q)));
        $('varTitle').textContent = varCat === 'all' ? 'Wszystkie zmienne' : PD.groupName(varCat);
        $('varCount').textContent = `Liczba zmiennych: ${list.length}`;
        $('varList').innerHTML = list.map((v) => v.plugin === 'user'
            ? `<div class="var-row" data-var="${esc(v.name)}"><div class="vr-main"><code>{${esc(v.name)}}</code><div class="vr-tags"><span class="vt ${PD.typeOf(v)[0]}">${PD.typeOf(v)[1]}</span><span class="vt src">Twoja</span></div></div><input class="m-input vr-edit" data-edit value="${esc(v.value)}"><button class="tool" data-del title="Usuń">${PD.icon('trash-2')}</button></div>`
            : PD.varRow(v, false)).join('') || '<div class="empty-note">Brak zmiennych.</div>';
        PD.fillIcons($('page-variables'));
    }
    $('varCats').onclick = (e) => { const b = e.target.closest('[data-vc]'); if (b) { varCat = b.dataset.vc; renderVariables(); } };
    $('varFilter').oninput = renderVariables;
    $('varList').addEventListener('change', async (e) => {
        if (!e.target.hasAttribute('data-edit')) return;
        const name = e.target.closest('[data-var]').dataset.var;
        const raw = e.target.value;
        const n = raw.trim() !== '' && !isNaN(Number(raw.replace(',', '.')));
        await deck.setVariable(name, n ? Number(raw.replace(',', '.')) : /^(true|false)$/i.test(raw.trim()) ? /true/i.test(raw) : raw, n ? 'number' : 'text');
    });
    $('varList').addEventListener('click', async (e) => {
        const d = e.target.closest('[data-del]');
        if (!d) return;
        await deck.deleteVariable(d.closest('[data-var]').dataset.var);
        renderVariables();
    });
    $('btnNewVar').onclick = async () => {
        const name = (await PD.ask('Nowa zmienna', '', 'np. licznik, tryb, scena'))?.replace(/\s+/g, '_');
        if (!name) return;
        if (!/^[\w.-]+$/.test(name)) return PD.toast('Nazwa może mieć litery, cyfry, _ . i -', 'error');
        await deck.setVariable(name, 0, 'number');
        varCat = 'user';
        renderVariables();
    };
    document.querySelector('[data-page="variables"].page').id = 'page-variables';
    PD.hooks.variables = { show: renderVariables };
    const prevVars = PD.hooks.onVars;
    PD.hooks.onVars = () => { if (prevVars) prevVars(); if (PD.page === 'variables' && !document.activeElement.matches('[data-edit],#varFilter')) renderVariables(); };

    // ═════ INTEGRACJE ═════
    function renderIntegrations() {
        const q = $('intFilter').value.trim().toLowerCase();
        const list = PD.data.plugins.filter((p) => !q || `${p.name} ${p.description}`.toLowerCase().includes(q));
        $('intCount').textContent = `Włączone: ${PD.data.plugins.filter((p) => !p.disabled && !p.error).length} z ${PD.data.plugins.length}`;
        $('intList').innerHTML = list.map((p) => {
            const [color, icon] = PD.lookOfPlugin(p);
            const caps = [`${PD.icon('zap')}Liczba akcji: ${p.actions.length}`, `${PD.icon('braces')}Liczba zmiennych: ${p.variables.length}`];
            if (p.settings.some((s) => s.type === 'button')) caps.push(`${PD.icon('link')}Logowanie`);
            return `<div class="int-row${p.disabled ? ' off' : ''}" data-plugin="${esc(p.id)}">
                <span class="int-ico" style="--bc:${esc(color)}">${PD.icon(icon)}</span>
                <div class="int-main"><div class="int-name">${esc(p.name)}${p.version ? `<span class="m-small"> v${esc(p.version)}</span>` : ''}${p.fromStore ? '<span class="pill feat">Dodatek</span>' : p.builtin ? '' : '<span class="pill">Twoja wtyczka</span>'}${p.error ? '<span class="pill err">Błąd</span>' : ''}</div>
                  <div class="int-caps">${caps.join('')}</div>
                  ${p.status ? `<div class="int-status ${p.status.ok ? 'ok' : ''}"><span class="m-status-dot${p.status.ok ? ' active' : ''}"></span>${esc(p.status.text)}</div>` : ''}</div>
                <input type="checkbox" class="switch" data-enable ${p.disabled ? '' : 'checked'} title="Włącz / wyłącz">
                <span class="int-go">${PD.icon('chevron-right')}</span></div>`;
        }).join('');
        PD.fillIcons($('intList'));
    }
    $('intFilter').oninput = renderIntegrations;
    $('intList').addEventListener('change', async (e) => {
        if (!e.target.matches('[data-enable]')) return;
        const id = e.target.closest('[data-plugin]').dataset.plugin;
        PD.data.plugins = await deck.pluginToggle(id, !e.target.checked);
        renderIntegrations();
    });
    $('intList').addEventListener('click', (e) => {
        if (e.target.closest('[data-enable]')) return;
        const row = e.target.closest('[data-plugin]');
        if (row) PD.go('integration', row.dataset.plugin);
    });
    PD.hooks.integrations = { show: async () => { await PD.reload(); renderIntegrations(); } };

    let intId = null;
    function renderIntegration() {
        const p = PD.plugin(intId);
        if (!p) return PD.go('integrations');
        const [color, icon] = PD.lookOfPlugin(p);
        $('intDetail').innerHTML = `<button class="m-btn small" data-goto="integrations">${PD.icon('arrow-left')}Integracje</button>
            <div class="intd-head"><span class="int-ico big" style="--bc:${esc(color)}">${PD.icon(icon)}</span><div><h1>${esc(p.name)}</h1><div class="m-small">${esc(p.description || '')}</div></div>
              <label class="toggle-row inline"><span>Włączona</span><input type="checkbox" class="switch" id="intEnable" ${p.disabled ? '' : 'checked'}></label></div>
            ${p.status ? `<div class="int-status big ${p.status.ok ? 'ok' : ''}"><span class="m-status-dot${p.status.ok ? ' active' : ''}"></span>${esc(p.status.text)}</div>` : ''}
            ${p.error ? `<div class="act-err">Błąd: ${esc(p.error)}</div>` : ''}
            <div class="intd-cols">
              <div class="card"><h3>Ustawienia</h3><div id="intFields">${p.settings.map((s) => PD.fieldHtml(s, p.values[s.key])).join('') || '<div class="m-small">Ta integracja nie ma ustawień.</div>'}</div></div>
              <div>
                <div class="card"><h3>Akcje <span class="m-small">${p.actions.length}</span></h3><ul class="intd-list">${p.actions.map((a) => `<li><b>${esc(a.name)}</b>${a.description ? `<small>${esc(a.description)}</small>` : ''}</li>`).join('')}</ul></div>
                <div class="card"><h3>Zmienne <span class="m-small">${p.variables.length}</span></h3><div class="var-list compact">${(PD.data.variables || []).filter((v) => v.plugin === p.id).map((v) => PD.varRow(v, false)).join('') || '<div class="m-small">Brak.</div>'}</div></div>
              </div>
            </div>`;
        $('intEnable').onchange = async () => { PD.data.plugins = await deck.pluginToggle(p.id, !$('intEnable').checked); renderIntegration(); };
        let t = null;
        const flushSettings = async () => {
            const patch = {};
            $('intFields').querySelectorAll('[data-key]').forEach((x) => { patch[x.dataset.key] = x.dataset.type === 'bool' ? x.checked : x.dataset.type === 'number' ? Number(x.value) : x.value; });
            if (Object.keys(patch).length) await deck.pluginSettings(p.id, patch);
            PD.optionsCache = {};
        };
        PD.wireFields($('intFields'), { onSet: () => { clearTimeout(t); t = setTimeout(flushSettings, 500); } });
        $('intFields').querySelectorAll('[data-insvar]').forEach((b) => b.remove());
        $('intFields').querySelectorAll('[data-cmd]').forEach((btn) => btn.onclick = async () => {
            btn.disabled = true;
            try {
                await flushSettings();
                const r = await deck.pluginCommand(p.id, btn.dataset.cmd);
                PD.data.plugins = r.plugins;
                if (r.result) PD.toast(String(r.result), 'success');
            } catch (err) { PD.toast(PD.errText(err), 'error'); }
            btn.disabled = false;
            renderIntegration();
        });
        PD.fillIcons($('intDetail'));
    }
    PD.hooks.integration = { show: async (id) => { if (id) intId = id; PD.data.variables = await deck.variables(); renderIntegration(); } };
    const prevPlugins = PD.hooks.onPlugins;
    PD.hooks.onPlugins = () => {
        if (prevPlugins) prevPlugins();
        if (PD.page === 'integrations') renderIntegrations();
        if (PD.page === 'integration' && !$('intDetail').contains(document.activeElement)) renderIntegration();
    };

    // ═════ BIBLIOTEKA ═════
    let libTab = 'lucide';
    async function renderLibrary() {
        $('libTabs').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === libTab));
        $('libSearch').hidden = libTab !== 'lucide';
        if (libTab === 'images') {
            const imgs = await deck.images();
            $('libGrid').innerHTML = imgs.map((n) => `<div class="lib-img" title="${esc(n)}"><img src="${esc(PD.imgBase())}/img/${encodeURIComponent(n)}" alt=""></div>`).join('') || '<div class="empty-note">Nie masz jeszcze obrazów. Dodaj je przyciskiem „Dodaj obraz” albo przeciągnij na przycisk w decku.</div>';
            return;
        }
        const q = $('libSearch').value.trim().toLowerCase();
        const names = PD.searchLucide(q);
        $('libGrid').innerHTML = `<div class="lib-count m-small">${names.length} ikon (Lucide, licencja ISC)</div>` + names.slice(0, 400).map((n) => `<div class="lib-ico" title="${esc(n)}">${R.lucide(PD.lucide.icons[n])}<small>${esc(n)}</small></div>`).join('');
    }
    $('libTabs').onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) { libTab = b.dataset.v; renderLibrary(); } };
    $('libSearch').oninput = () => { clearTimeout(window.__lib); window.__lib = setTimeout(renderLibrary, 120); };
    $('btnLibUpload').onclick = async () => { try { const n = await deck.pickFile({ image: true }); if (n) { libTab = 'images'; renderLibrary(); PD.toast('Dodano obraz', 'success'); } } catch (err) { PD.toast(PD.errText(err), 'error'); } };
    PD.hooks.library = { show: renderLibrary };

    // ═════ SKLEP ═════
    let storeData = null, storeCat = 'all', storeOpen = null;
    const icoBox = (it, big) => `<span class="store-ico${big ? ' big' : ''}" style="background:${esc(it.color || '#e6007e')}">${PD.icon(it.icon || 'puzzle')}</span>`;
    async function refreshStore(force) {
        storeData = await deck.storeList(force);
        const n = storeData.items.filter((x) => x.update).length;
        $('storeBadge').hidden = !n; $('storeBadge').textContent = n;
        if (PD.page === 'store') renderStore();
    }
    PD.refreshStore = refreshStore;
    const statusPill = (it) => it.error ? '<span class="pill err">Błąd</span>' : it.update ? `<span class="pill upd">Nowa wersja ${esc(it.version)}</span>` : it.installed ? (it.disabled ? '<span class="pill">Wyłączony</span>' : '<span class="pill ok">Zainstalowany</span>') : it.featured ? '<span class="pill feat">Polecany</span>' : '';
    const cardBtn = (it) => it.update ? `<button class="m-btn small accent" data-store="install" data-id="${esc(it.id)}">Aktualizuj</button>` : it.installed ? `<button class="m-btn small" data-store="open" data-id="${esc(it.id)}">Szczegóły</button>` : `<button class="m-btn small accent" data-store="install" data-id="${esc(it.id)}">Zainstaluj</button>`;
    function renderStore() {
        if (!storeData) return;
        const items = storeData.items;
        const count = (f) => items.filter(f).length;
        const chips = [['all', 'Wszystkie', items.length], ['installed', 'Zainstalowane', count((x) => x.installed)], ['updates', 'Aktualizacje', count((x) => x.update)],
            ...storeData.categories.map((c) => [c.id, c.name, count((x) => x.category === c.id)]).filter((c) => c[2])];
        $('storeCats').innerHTML = chips.map(([id, name, n]) => `<button data-cat="${id}" class="${id === storeCat ? 'active' : ''}">${esc(name)} <i>${n}</i></button>`).join('');
        $('btnStoreUpdateAll').hidden = !count((x) => x.update);
        $('storeUrlInput').value = storeData.storeUrl || '';
        $('storeUrlInput').placeholder = `Domyślnie: ${storeData.defaultStore || 'GitHub'}`;
        $('storeUrlErr').textContent = storeData.remoteError ? `Nie udało się wczytać: ${storeData.remoteError}` : '';
        const q = $('storeSearch').value.trim().toLowerCase();
        const shown = items.filter((x) => (storeCat === 'all' || (storeCat === 'installed' && x.installed) || (storeCat === 'updates' && x.update) || x.category === storeCat) && (!q || `${x.name} ${x.description} ${(x.tags || []).join(' ')} ${x.author}`.toLowerCase().includes(q)));
        $('storeHeading').textContent = (chips.find((c) => c[0] === storeCat) || [0, 'Wszystkie'])[1];
        $('storeGrid').innerHTML = shown.map((it) => `<div class="store-card" data-sid="${esc(it.id)}">
                <div class="sc-banner" style="--bc:${esc(it.color || '#e6007e')}">${icoBox(it, true)}</div>
                <div class="sc-body"><div class="sc-name">${esc(it.name)}</div><div class="sc-meta">autor: ${esc(it.author || '—')} · ${esc(it.version)}</div>
                <div class="tags">${statusPill(it)}</div>
                <div class="sc-desc">${esc(it.description)}</div></div>
                <div class="sc-foot">${cardBtn(it)}</div></div>`).join('') || '<div class="empty-note">Nic nie znaleziono.</div>';
        $('storeDetail').hidden = !storeOpen;
        if (storeOpen) renderStoreDetail(storeOpen);
        PD.fillIcons($('storeGrid'));
    }
    function renderStoreDetail(id) {
        const it = storeData.items.find((x) => x.id === id);
        if (!it) { storeOpen = null; $('storeDetail').hidden = true; return; }
        const cat = storeData.categories.find((c) => c.id === it.category);
        $('storeDetail').innerHTML = `<button class="m-btn small" data-store="back">${PD.icon('arrow-left')}Wróć do sklepu</button>
            <div class="sd-head">${icoBox(it, true)}<div><h2>${esc(it.name)}</h2><div class="sd-sub">${esc(it.author || '')} · wersja ${esc(it.version)}${cat ? ` · ${esc(cat.name)}` : ''}</div>
              <div class="tags">${statusPill(it)}${(it.tags || []).map((t) => `<span class="pill">${esc(t)}</span>`).join('')}</div></div>
              <div class="sd-actions">${it.installed ? `${it.update ? `<button class="m-btn accent" data-store="install" data-id="${esc(it.id)}">Aktualizuj do ${esc(it.version)}</button>` : ''}<button class="m-btn" data-store="settings" data-id="${esc(it.id)}">Ustawienia</button><button class="m-btn danger" data-store="uninstall" data-id="${esc(it.id)}">Odinstaluj</button>` : `<button class="m-btn accent" data-store="install" data-id="${esc(it.id)}">Zainstaluj</button>`}</div></div>
            <div class="sd-cols"><div>
                <div class="card"><h3>Opis</h3><p>${esc(it.longDescription || it.description)}</p></div>
                ${(it.features || []).length ? `<div class="card"><h3>Co dodaje</h3><ul>${it.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
                ${it.status ? `<div class="card"><h3>Stan</h3><p>${esc(it.status.text)}</p></div>` : ''}
              </div><div>
                <div class="card"><h3>Informacje</h3><dl><dt>Wersja</dt><dd>${esc(it.version)}${it.installed && it.installedVersion !== it.version ? ` (masz ${esc(it.installedVersion)})` : ''}</dd><dt>Autor</dt><dd>${esc(it.author || '—')}</dd><dt>Licencja</dt><dd>${esc(it.license || '—')}</dd><dt>Źródło</dt><dd>${it.source === 'remote' ? 'GitHub (Pitayas-Team)' : 'kopia w aplikacji (bez internetu)'}</dd></dl></div>
                ${(it.changelog || []).length ? `<div class="card"><h3>Historia zmian</h3>${it.changelog.map((c) => `<div class="sd-log"><b>${esc(c.version)}</b> ${esc(c.notes)}</div>`).join('')}</div>` : ''}
              </div></div>`;
        PD.fillIcons($('storeDetail'));
    }
    async function storeAction(op, id, btn) {
        if (op === 'back') { storeOpen = null; return renderStore(); }
        if (op === 'open') { storeOpen = id; return renderStore(); }
        if (op === 'settings') return PD.go('integration', id);
        if (btn) { btn.disabled = true; btn.textContent = op === 'uninstall' ? 'Usuwanie…' : 'Instalowanie…'; }
        try {
            if (op === 'install') { const r = await deck.storeInstall(id); PD.data.plugins = r.plugins; PD.toast(`Zainstalowano: ${r.name} ${r.version}`, 'success'); storeOpen = id; }
            if (op === 'uninstall') {
                const used = (await deck.storeUsed()).includes(id);
                if (!(await PD.confirm('Odinstalować dodatek?', used ? 'Twoje przyciski używają tego dodatku — ich akcje przestaną działać.' : 'Dodatek zostanie usunięty.', 'Odinstaluj'))) return renderStore();
                const r = await deck.storeUninstall(id); PD.data.plugins = r.plugins; PD.toast('Odinstalowano', 'success');
            }
            PD.optionsCache = {};
            PD.data.variables = await deck.variables();
        } catch (err) { PD.toast(PD.errText(err), 'error'); }
        await refreshStore();
    }
    $('storeGrid').addEventListener('click', (e) => { const b = e.target.closest('[data-store]'); if (b) { e.stopPropagation(); return storeAction(b.dataset.store, b.dataset.id, b); } const c = e.target.closest('[data-sid]'); if (c) storeAction('open', c.dataset.sid); });
    $('storeDetail').addEventListener('click', (e) => { const b = e.target.closest('[data-store]'); if (b) storeAction(b.dataset.store, b.dataset.id, b); });
    $('storeCats').onclick = (e) => { const b = e.target.closest('[data-cat]'); if (b) { storeCat = b.dataset.cat; storeOpen = null; renderStore(); } };
    $('storeSearch').oninput = () => { storeOpen = null; renderStore(); };
    $('storeUrlInput').onchange = async () => { storeData = await deck.storeUrl($('storeUrlInput').value); renderStore(); };
    $('btnStoreUpdateAll').onclick = async () => { try { const r = await deck.storeUpdateAll(); PD.data.plugins = r.plugins; PD.toast(`Zaktualizowano: ${r.updated.join(', ')}`, 'success'); } catch (err) { PD.toast(PD.errText(err), 'error'); } refreshStore(); };
    PD.hooks.store = { show: async (id) => { storeOpen = id || null; if (!storeData) $('storeGrid').innerHTML = '<div class="empty-note">Wczytywanie sklepu…</div>'; await refreshStore(); renderStore(); } };
    setTimeout(() => refreshStore().catch(() => {}), 2500);

    // ═════ URZĄDZENIA ═════
    function renderDevices() {
        const list = PD.data.devices || [];
        const profiles = PD.data.deck.profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
        $('devices').innerHTML = list.map((d) => {
            const pending = !d.approved && !d.denied;
            return `<div class="dev-row" data-dev="${esc(d.id)}">
                <span class="dev-ico${d.online ? ' on' : ''}">${PD.icon(/iphone|android|phone/i.test(d.name) ? 'smartphone' : 'monitor-smartphone')}</span>
                <div class="dev-main"><b class="dev-name" title="Kliknij dwa razy, żeby zmienić nazwę">${esc(d.name)}</b><div class="m-small">${d.online ? 'Połączone teraz' : d.lastSeen ? `Ostatnio: ${new Date(d.lastSeen).toLocaleString('pl')}` : 'Nie połączone'}${d.ip ? ` · ${esc(String(d.ip).replace('::ffff:', ''))}` : ''}</div></div>
                ${pending ? '<button class="m-btn small accent" data-act="ok">Zezwól</button><button class="m-btn small" data-act="deny">Odrzuć</button>'
                    : d.denied ? '<span class="pill err">Zablokowane</span><button class="m-btn small" data-act="ok">Odblokuj</button>'
                    : `<label class="dev-prof">Profil <select class="m-select" data-act="profile">${profiles}</select></label>`}
                <button class="tool" data-act="remove" title="Usuń urządzenie">${PD.icon('trash-2')}</button></div>`;
        }).join('') || `<div class="empty-big">${PD.icon('smartphone')}<b>Brak urządzeń</b><span>Kliknij „Połącz nowe” i zeskanuj kod QR telefonem.</span></div>`;
        for (const d of list) { const sel = $('devices').querySelector(`[data-dev="${CSS.escape(d.id)}"] select`); if (sel) sel.value = d.profile; }
        PD.fillIcons($('devices'));
    }
    $('devices').addEventListener('click', async (e) => {
        const box = e.target.closest('[data-dev]');
        const act = e.target.closest('[data-act]') && e.target.closest('[data-act]').dataset.act;
        if (!box || !act || act === 'profile') return;
        const id = box.dataset.dev;
        if (act === 'ok') await deck.approve(id, true);
        if (act === 'deny') await deck.approve(id, false);
        if (act === 'remove' && (await PD.confirm('Usunąć urządzenie?', 'Przy następnym połączeniu trzeba je będzie zatwierdzić ponownie.'))) PD.data.devices = await deck.removeDevice(id);
        renderDevices();
    });
    $('devices').addEventListener('change', async (e) => { if (e.target.dataset.act === 'profile') PD.data.devices = await deck.updateDevice(e.target.closest('[data-dev]').dataset.dev, { profile: e.target.value }); });
    $('devices').addEventListener('dblclick', async (e) => {
        if (!e.target.classList.contains('dev-name')) return;
        const id = e.target.closest('[data-dev]').dataset.dev;
        const name = await PD.ask('Nazwa urządzenia', e.target.textContent);
        if (name) { PD.data.devices = await deck.updateDevice(id, { name }); renderDevices(); }
    });
    $('btnConnect').onclick = PD.openConnect;
    PD.hooks.devices = { show: renderDevices };

    // ═════ USTAWIENIA ═════
    PD.hooks.settings = {
        show: async () => {
            Object.assign(PD.data, await deck.get());
            $('fPort').value = PD.data.deck.settings.port;
            $('fApproval2').checked = PD.data.deck.settings.requireApproval;
            $('fClock').checked = PD.data.deck.settings.showClock;
            $('importCard').hidden = !(await deck.macroDeckAvailable());
            deck.keyboardStatus().then((s) => {
                const names = { uinput: 'wirtualna klawiatura (uinput)', ydotool: 'ydotool', xdotool: 'xdotool', wtype: 'wtype', windows: 'Windows' };
                $('kbStatus').innerHTML = s.ok ? `<span class="t-ok">Działa — ${esc(names[s.backend] || s.backend)}</span>` : `<span class="t-err">${esc(s.error)}</span>`;
            });
        },
    };
    $('fPort').onchange = async () => { const res = await deck.settings({ port: parseInt($('fPort').value, 10) }); PD.data.server = res.server; PD.renderConnection(); PD.toast(`Serwer działa na porcie ${res.server.port}`, 'success'); };
    $('fApproval2').onchange = () => deck.settings({ requireApproval: $('fApproval2').checked });
    $('fClock').onchange = () => deck.settings({ showClock: $('fClock').checked });
    $('btnExport').onclick = async () => { const f = await deck.exportDeck(); if (f) PD.toast(`Zapisano: ${f}`, 'success'); };
    $('btnImport').onclick = async () => {
        if (!(await PD.confirm('Importować deck?', 'Import zastąpi wszystkie profile, foldery i przyciski.', 'Importuj'))) return;
        try { const r = await deck.importDeck(); if (r) { PD.profileId = null; await PD.reload(); PD.toast('Zaimportowano deck', 'success'); } } catch (err) { PD.toast(PD.errText(err), 'error'); }
    };
    $('btnPluginsDir').onclick = () => deck.openPluginsDir();
    $('btnQuit').onclick = () => deck.quit();
    $('btnImportMd').onclick = async () => {
        $('btnImportMd').disabled = true;
        $('importResult').textContent = 'Importowanie…';
        try {
            const s = await deck.importMacroDeck();
            const skipped = Object.entries(s.skipped).map(([k, n]) => `${k} ×${n}`).join(', ');
            $('importResult').innerHTML = `<span class="t-ok">Zaimportowano: ${s.profiles} profil(e), ${s.folders} folderów, ${s.widgets} widżetów, ${s.actions} akcji, ${s.icons} ikon.</span>` +
                (skipped ? `<br>Pominięte: ${esc(skipped)}.` : '') + (s.windowsPaths ? `<br>${s.windowsPaths} akcji wskazuje programy z Windowsa (C:\\…) — popraw je na ścieżki z tego komputera.` : '');
            await PD.reload();
            const p = PD.data.deck.profiles[PD.data.deck.profiles.length - 1];
            PD.profileId = p.id; PD.folderId = p.root;
            await PD.reload();
            PD.toast('Deck z Macro Deck zaimportowany', 'success');
        } catch (err) { $('importResult').innerHTML = `<span class="t-err">${esc(PD.errText(err))}</span>`; }
        finally { $('btnImportMd').disabled = false; }
    };
})();
