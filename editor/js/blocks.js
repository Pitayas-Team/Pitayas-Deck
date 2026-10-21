// ═══════ PITAYA DECK — EDYTOR AKCJI (BLOKI JAK W MACRO DECK 3) ═══════
// Wspólny dla przycisków, skryptów i automatyzacji.
//   PD.createBlockEditor({ el, getRoot, basePath, mutate, label })
//     getRoot() → obiekt, w którym leży lista (np. button.actions albo script)
//     basePath  → ścieżka listy w tym obiekcie, np. ['press'] albo ['blocks']
//     mutate(fn, rerender) → zmiana: fn(root)
(function () {
    const { $, esc, clone } = PD;

    PD.LOGIC = {
        wait: { name: 'Czekaj', icon: 'hourglass', color: '#06b6d4', desc: 'Odczekaj chwilę przed następną akcją' },
        if: { name: 'Jeśli / W przeciwnym razie', icon: 'git-branch', color: '#a855f7', desc: 'Wykonaj akcje tylko, gdy warunek jest spełniony' },
        switch: { name: 'Przełącznik', icon: 'split', color: '#8b5cf6', desc: 'Różne akcje dla różnych wartości zmiennej' },
        repeat: { name: 'Powtórz', icon: 'repeat', color: '#22c55e', desc: 'Wykonaj akcje kilka razy' },
        while: { name: 'Dopóki', icon: 'refresh-cw', color: '#16a34a', desc: 'Powtarzaj, dopóki warunek jest spełniony' },
        break: { name: 'Przerwij pętlę', icon: 'corner-down-right', color: '#ef4444', desc: 'Wyjdź z Powtórz / Dopóki' },
        stop: { name: 'Zatrzymaj', icon: 'octagon-x', color: '#dc2626', desc: 'Nie wykonuj już kolejnych akcji' },
    };
    PD.PLUGIN_LOOK = { deck: ['#e6007e', 'layout-grid'], system: ['#64748b', 'monitor'], media: ['#22c55e', 'volume-2'], sound: ['#f97316', 'speaker'], http: ['#0ea5e9', 'globe'] };
    PD.lookOfPlugin = (p) => [(p && p.color) || (PD.PLUGIN_LOOK[p && p.id] || [])[0] || '#64748b', (p && p.icon) || (PD.PLUGIN_LOOK[p && p.id] || [])[1] || 'puzzle'];
    const OPS = [['is', 'jest'], ['isNot', 'nie jest'], ['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤'], ['contains', 'zawiera'], ['startsWith', 'zaczyna się od'], ['isOn', 'jest włączone'], ['isOff', 'jest wyłączone'], ['isEmpty', 'jest puste'], ['isNotEmpty', 'nie jest puste'], ['isAvailable', 'istnieje'], ['isNotAvailable', 'nie istnieje']];
    const UNARY = new Set(['isOn', 'isOff', 'isEmpty', 'isNotEmpty', 'isAvailable', 'isNotAvailable']);
    PD.OPS = OPS; PD.UNARY = UNARY;
    PD.blockClip = null;

    const J = (a) => esc(JSON.stringify(a));
    const P = (s) => JSON.parse(s);
    PD.resolve = (root, path, create) => {
        let cur = root;
        for (let i = 0; i < path.length; i++) {
            const k = path[i];
            if (cur[k] === undefined || cur[k] === null) { if (!create) return undefined; cur[k] = typeof path[i + 1] === 'number' || i === path.length - 1 ? [] : {}; }
            cur = cur[k];
        }
        return cur;
    };
    PD.countBlocks = (list) => {
        let n = 0;
        for (const x of list || []) {
            if (!x) continue;
            n++;
            for (const k of ['blocks', 'else', 'otherwise']) if (Array.isArray(x[k])) n += PD.countBlocks(x[k]);
            for (const br of x.branches || []) n += PD.countBlocks(br.blocks);
            for (const cs of x.cases || []) n += PD.countBlocks(cs.blocks);
        }
        return n;
    };
    PD.newLogic = (kind) => {
        if (kind === 'if') return { kind, branches: [{ cond: { join: 'and', rules: [{ left: '', op: 'isOn', right: '' }] }, blocks: [] }] };
        if (kind === 'switch') return { kind, subject: '', cases: [{ value: '', blocks: [] }], otherwise: [] };
        if (kind === 'repeat') return { kind, times: 3, blocks: [] };
        if (kind === 'while') return { kind, cond: { join: 'and', rules: [{ left: '', op: 'isOn', right: '' }] }, blocks: [] };
        if (kind === 'wait') return { kind, ms: 1000 };
        return { kind };
    };
    PD.condHtml = (cond, path) => {
        const c = cond || { join: 'and', rules: [] };
        const rules = c.rules || [];
        return `<div class="cond" data-cond='${J(path)}'>
            ${rules.map((r, i) => `<div class="cond-rule" data-rule="${i}">
                ${i ? `<button class="join" data-join title="Zmień i / lub">${c.join === 'or' ? 'lub' : 'i'}</button>` : '<span class="join ghost"></span>'}
                <button class="m-btn small var-btn" data-rule-var="${i}">${r.left ? `{${esc(r.left)}}` : 'Wybierz zmienną…'}</button>
                <select class="m-select" data-rule-op="${i}">${OPS.map(([v, l]) => `<option value="${v}" ${v === (r.op || 'is') ? 'selected' : ''}>${l}</option>`).join('')}</select>
                ${UNARY.has(r.op) ? '<span></span>' : `<input class="m-input" data-rule-right="${i}" value="${esc(r.right ?? '')}" placeholder="wartość">`}
                <button class="tool" data-rule-del="${i}" title="Usuń warunek">${PD.icon('x')}</button>
            </div>`).join('') || '<div class="m-small">Brak warunku — zawsze spełniony.</div>'}
            <button class="chip" data-rule-add>＋ Warunek</button>
        </div>`;
    };
    // Obsługa warunku (wspólna z automatyzacjami)
    PD.wireCond = (root, getCondHolder, mutate) => {
        root.addEventListener('click', (e) => {
            const condEl = e.target.closest('[data-cond]');
            if (!condEl || !root.contains(condEl)) return;
            const cp = P(condEl.dataset.cond);
            const q = (s) => e.target.closest(s);
            const get = (r) => { const parent = PD.resolve(getCondHolder(r), cp.slice(0, -1)); const k = cp[cp.length - 1]; parent[k] = parent[k] || { join: 'and', rules: [] }; return parent[k]; };
            if (q('[data-rule-add]')) { e.stopPropagation(); mutate((r) => { get(r).rules.push({ left: '', op: 'isOn', right: '' }); }); }
            else if (q('[data-rule-del]')) { e.stopPropagation(); mutate((r) => { get(r).rules.splice(Number(q('[data-rule-del]').dataset.ruleDel), 1); }); }
            else if (q('[data-join]')) { e.stopPropagation(); mutate((r) => { const c = get(r); c.join = c.join === 'or' ? 'and' : 'or'; }); }
            else if (q('[data-rule-var]')) { e.stopPropagation(); const i = Number(q('[data-rule-var]').dataset.ruleVar); PD.pickVariable((name) => mutate((r) => { get(r).rules[i].left = name; })); }
        });
        root.addEventListener('change', (e) => {
            const condEl = e.target.closest('[data-cond]');
            if (!condEl || e.target.dataset.ruleOp === undefined) return;
            const cp = P(condEl.dataset.cond);
            mutate((r) => { PD.resolve(getCondHolder(r), cp).rules[Number(e.target.dataset.ruleOp)].op = e.target.value; });
        });
        root.addEventListener('input', (e) => {
            const condEl = e.target.closest('[data-cond]');
            if (!condEl || e.target.dataset.ruleRight === undefined) return;
            const cp = P(condEl.dataset.cond);
            mutate((r) => { PD.resolve(getCondHolder(r), cp).rules[Number(e.target.dataset.ruleRight)].right = e.target.value; }, false);
        });
    };

    PD.createBlockEditor = ({ el, getRoot, basePath, mutate, emptyText }) => {
        const expanded = new Set();
        let dragPath = null;
        const ed = { basePath };

        const title = (x) => {
            const kind = x.kind || 'action';
            if (kind !== 'action') return PD.LOGIC[kind] ? PD.LOGIC[kind].name : kind;
            const a = PD.actionDef(x);
            return a ? a.name : x.action;
        };
        const lookOf = (x) => {
            const kind = x.kind || 'action';
            if (kind !== 'action') return [PD.LOGIC[kind].color, PD.LOGIC[kind].icon];
            return PD.lookOfPlugin(PD.plugin(x.plugin) || { id: x.plugin });
        };
        const isOpen = (x, path) => {
            const k = JSON.stringify(path);
            if (expanded.has(k)) return true;
            if (expanded.has(`-${k}`)) return false;
            return ['if', 'switch', 'repeat', 'while'].includes(x.kind);   // logika domyślnie rozwinięta
        };
        const toggleOpen = (x, path) => {
            const k = JSON.stringify(path);
            const open = isOpen(x, path);
            expanded.delete(k); expanded.delete(`-${k}`);
            expanded.add(open ? `-${k}` : k);
        };

        function list(items, path, root) {
            const rows = (items || []).map((x, i) => drop(path, i) + row(x, [...path, i])).join('');
            return `<div class="ab-blist${root ? ' root' : ''}">${rows}${drop(path, (items || []).length)}
                ${root && !(items || []).length ? `<div class="ab-empty">${esc(emptyText || 'Brak akcji.')}</div>` : ''}
                <button class="${root ? 'm-btn accent add-root' : 'add-inner'}" data-add-into='${J(path)}' data-index="${(items || []).length}">＋ Dodaj akcję</button></div>`;
        }
        const drop = (path, i) => `<div class="drop-zone" data-drop='${J(path)}' data-index="${i}"></div>`;

        function row(x, path) {
            const kind = x.kind || 'action';
            const [color, icon] = lookOf(x);
            const open = isOpen(x, path);
            const pl = kind === 'action' ? PD.plugin(x.plugin) : null;
            const a = kind === 'action' ? PD.actionDef(x) : null;
            let summary = '';
            if (kind === 'action') summary = !pl ? `Brak integracji „${x.plugin}”` : !a ? 'Akcja niedostępna' : PD.summary(x);
            if (kind === 'wait') summary = (Number(x.ms) || 0) >= 1000 ? `${(Number(x.ms) / 1000).toLocaleString('pl')} s` : `${Number(x.ms) || 0} ms`;
            if (kind === 'repeat') summary = `${x.times ?? 1} razy`;
            if (kind === 'switch') summary = x.subject || '';
            if (kind === 'if' || kind === 'while') {
                const c = kind === 'if' ? (x.branches && x.branches[0] && x.branches[0].cond) : x.cond;
                summary = ((c && c.rules) || []).map((r) => `{${r.left || '?'}} ${(OPS.find((o) => o[0] === r.op) || ['', r.op])[1]}${UNARY.has(r.op) ? '' : ` ${r.right ?? ''}`}`).join(c && c.join === 'or' ? ' lub ' : ' i ');
            }
            let body = '';
            if (open) body = bodyOf(x, path, kind, pl, a);
            return `<div class="ab-row${x.enabled === false ? ' off' : ''}${open ? ' open' : ''} k-${kind}${(kind === 'action' && (!pl || !a)) ? ' broken' : ''}" data-path='${J(path)}' style="--bc:${esc(color)}">
                <div class="ab-head" draggable="true">
                  <span class="ab-grip" title="Przeciągnij">${PD.icon('grip-vertical')}</span>
                  <input type="checkbox" class="switch sm" data-enable ${x.enabled === false ? '' : 'checked'} title="Włącz / wyłącz">
                  <span class="ab-ico">${PD.icon(icon)}</span>
                  <span class="ab-name">${esc(title(x))}</span>
                  <span class="ab-sum">${esc(summary)}</span>
                  <button class="tool" data-op="open" title="${open ? 'Zwiń' : 'Rozwiń'}">${PD.icon(open ? 'chevron-down' : 'chevron-right')}</button>
                  <button class="tool${x.comment !== undefined ? ' on' : ''}" data-op="comment" title="Komentarz">${PD.icon('message-square')}</button>
                  <button class="tool" data-op="delete" title="Usuń">${PD.icon('trash-2')}</button>
                </div>
                ${x.comment !== undefined ? `<div class="ab-comment"><textarea class="m-input" data-bkey="comment" rows="1" placeholder="Komentarz…">${esc(x.comment)}</textarea></div>` : ''}
                ${body ? `<div class="ab-body">${body}</div>` : ''}
            </div>`;
        }

        function bodyOf(x, path, kind, pl, a) {
            if (kind === 'action') {
                if (!pl) return `<div class="act-err">Ta akcja pochodzi z integracji „${esc(x.plugin)}”, której nie masz. <button class="m-btn small" data-open-store="${esc(x.plugin)}">Zainstaluj ze sklepu</button></div>`;
                if (!a) return '<div class="act-err">Integracja nie ma już tej akcji.</div>';
                return (a.description ? `<div class="f-help top">${esc(a.description)}</div>` : '') +
                    ((a.fields || []).map((f) => PD.fieldHtml(f, (x.config || {})[f.key])).join('') || '<div class="m-small">Ta akcja nie ma ustawień.</div>');
            }
            if (kind === 'wait') return `<div class="wait-row"><input class="m-input" type="number" min="0" step="100" data-bkey="ms" value="${esc(x.ms ?? 1000)}"><span>ms</span>${[250, 500, 1000, 3000].map((v) => `<button class="chip" data-set-ms="${v}">${v >= 1000 ? v / 1000 + ' s' : v + ' ms'}</button>`).join('')}</div>`;
            if (kind === 'repeat') return `<div class="wait-row"><input class="m-input" type="number" min="0" max="1000" data-bkey="times" value="${esc(x.times ?? 3)}"><span>razy · numer powtórzenia: <code>{index}</code></span></div>
                <div class="branch"><div class="branch-head">Wykonuj</div>${list(x.blocks, [...path, 'blocks'])}</div>`;
            if (kind === 'while') return `<div class="branch-head">Dopóki</div>${PD.condHtml(x.cond, [...path, 'cond'])}<div class="branch"><div class="branch-head">Wykonuj</div>${list(x.blocks, [...path, 'blocks'])}</div><div class="m-small">Najwyżej 1000 powtórzeń.</div>`;
            if (kind === 'if') return (x.branches || []).map((br, i) => `<div class="branch">
                    <div class="branch-head">${i === 0 ? 'Jeśli' : 'W przeciwnym razie, jeśli'}${i > 0 ? `<button class="tool" data-del-branch='${J([...path, 'branches', i])}' title="Usuń">${PD.icon('x')}</button>` : ''}</div>
                    ${PD.condHtml(br.cond, [...path, 'branches', i, 'cond'])}
                    <div class="branch-head then">to</div>${list(br.blocks, [...path, 'branches', i, 'blocks'])}
                </div>`).join('') +
                (Array.isArray(x.else) ? `<div class="branch"><div class="branch-head">W przeciwnym razie<button class="tool" data-del-else title="Usuń">${PD.icon('x')}</button></div>${list(x.else, [...path, 'else'])}</div>` : '') +
                `<div class="branch-add"><button class="chip" data-add-branch>＋ W przeciwnym razie, jeśli</button>${Array.isArray(x.else) ? '' : '<button class="chip" data-add-else>＋ W przeciwnym razie</button>'}</div>`;
            if (kind === 'switch') return `<div class="m-field"><label class="m-label">Wartość do sprawdzenia</label><div class="field-row"><input class="m-input" data-bkey="subject" value="${esc(x.subject || '')}" placeholder="{spotify.repeat}"><button class="m-btn small icon-only" data-ins-subject title="Wstaw zmienną">{ }</button></div></div>` +
                (x.cases || []).map((cs, i) => `<div class="branch"><div class="branch-head">Gdy równa się <input class="m-input mini-in" data-case-value='${J([...path, 'cases', i])}' value="${esc(cs.value ?? '')}" placeholder="wartość"><button class="tool" data-del-case='${J([...path, 'cases', i])}' title="Usuń">${PD.icon('x')}</button></div>${list(cs.blocks, [...path, 'cases', i, 'blocks'])}</div>`).join('') +
                (Array.isArray(x.otherwise) ? `<div class="branch"><div class="branch-head">W pozostałych przypadkach<button class="tool" data-del-otherwise title="Usuń">${PD.icon('x')}</button></div>${list(x.otherwise, [...path, 'otherwise'])}</div>` : '') +
                `<div class="branch-add"><button class="chip" data-add-case>＋ Przypadek</button>${Array.isArray(x.otherwise) ? '' : '<button class="chip" data-add-otherwise>＋ W pozostałych przypadkach</button>'}</div>`;
            if (kind === 'break') return '<div class="m-small">Kończy najbliższą pętlę Powtórz / Dopóki.</div>';
            if (kind === 'stop') return '<div class="m-small">Kolejne akcje nie wykonają się.</div>';
            return '';
        }

        const blockAt = (root, path) => PD.resolve(root, path);
        const listOf = (root, blockPath) => PD.resolve(root, blockPath.slice(0, -1), true);
        const mut = (fn, rerender = true) => mutate((root) => { PD.resolve(root, basePath, true); fn(root); }, rerender);

        ed.render = () => {
            const root = getRoot();
            const items = PD.resolve(root, basePath) || [];
            el.innerHTML = list(items, basePath, true) +
                (PD.blockClip ? `<div class="clip-bar">${PD.icon('clipboard')} W schowku: <b>${esc(title(PD.blockClip))}</b><button class="m-btn small" data-paste-end>Wklej na końcu</button><button class="tool" data-clip-clear title="Wyczyść schowek">${PD.icon('x')}</button></div>` : '');
            // Pola akcji
            el.querySelectorAll('.ab-row.k-action.open').forEach((rowEl) => {
                const path = P(rowEl.dataset.path);
                const x = blockAt(getRoot(), path);
                const a = x && PD.actionDef(x);
                const body = rowEl.querySelector(':scope > .ab-body');
                if (!body || !a) return;
                PD.wireFields(body, { pluginId: x.plugin, actionId: x.action, defs: a.fields || [], onSet: (key, value) => mut((r) => { const b = blockAt(r, path); b.config = { ...(b.config || {}), [key]: value }; }, false) });
            });
            // Przeciąganie
            el.querySelectorAll('.ab-head').forEach((h) => {
                h.addEventListener('dragstart', (e) => { dragPath = P(h.closest('.ab-row').dataset.path); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'block'); el.classList.add('dragging'); });
                h.addEventListener('dragend', () => { dragPath = null; el.classList.remove('dragging'); });
            });
            el.querySelectorAll('.drop-zone').forEach((z) => {
                z.addEventListener('dragover', (e) => { if (dragPath) { e.preventDefault(); z.classList.add('over'); } });
                z.addEventListener('dragleave', () => z.classList.remove('over'));
                z.addEventListener('drop', (e) => {
                    e.preventDefault();
                    z.classList.remove('over');
                    if (!dragPath) return;
                    const to = P(z.dataset.drop);
                    if (JSON.stringify(to.slice(0, dragPath.length)) === JSON.stringify(dragPath)) return PD.toast('Nie można przenieść akcji do jej wnętrza', 'error');
                    move(dragPath, to, Number(z.dataset.index));
                    dragPath = null;
                });
            });
            PD.fillIcons(el);
        };

        function move(fromPath, toList, toIndex) {
            mut((root) => {
                const src = listOf(root, fromPath);
                const i = fromPath[fromPath.length - 1];
                const [item] = src.splice(i, 1);
                const parent = fromPath.slice(0, -1);
                let idx = toIndex;
                if (JSON.stringify(parent) === JSON.stringify(toList) && i < toIndex) idx--;
                const fixed = toList.slice();
                if (fixed.length > parent.length && JSON.stringify(fixed.slice(0, parent.length)) === JSON.stringify(parent) && typeof fixed[parent.length] === 'number' && fixed[parent.length] > i) fixed[parent.length]--;
                PD.resolve(root, fixed, true).splice(idx, 0, item);
            });
        }

        function rowOp(op, path) {
            const x = blockAt(getRoot(), path);
            const i = path[path.length - 1];
            if (op === 'run') {
                return deck.testActions([clone(x)]).then((res) => PD.toast(res.ok ? 'Wykonano' : res.errors.join(' · '), res.ok ? 'success' : 'error'));
            }
            if (op === 'copy') { PD.blockClip = clone(x); PD.toast('Skopiowano'); return ed.render(); }
            if (op === 'open') { toggleOpen(x, path); return ed.render(); }
            mut((root) => {
                const l = listOf(root, path);
                const b = l[i];
                if (op === 'toggle') b.enabled = b.enabled === false;
                if (op === 'comment') { if (b.comment !== undefined) delete b.comment; else b.comment = ''; }
                if (op === 'duplicate') l.splice(i + 1, 0, clone(b));
                if (op === 'cut') { PD.blockClip = clone(b); l.splice(i, 1); }
                if (op === 'paste' && PD.blockClip) l.splice(i + 1, 0, clone(PD.blockClip));
                if (op === 'up' && i > 0) [l[i - 1], l[i]] = [l[i], l[i - 1]];
                if (op === 'down' && i < l.length - 1) [l[i + 1], l[i]] = [l[i], l[i + 1]];
                if (op === 'delete') l.splice(i, 1);
            });
        }

        el.addEventListener('click', (e) => {
            const t = e.target;
            const q = (s) => t.closest(s);
            const rowEl = q('.ab-row');
            const path = rowEl ? P(rowEl.dataset.path) : null;
            if (q('[data-add-into]')) { const b = q('[data-add-into]'); return PD.openActionPicker((block) => insert(P(b.dataset.addInto), Number(b.dataset.index), block), P(b.dataset.addInto).includes('blocks') && P(b.dataset.addInto).length > basePath.length); }
            if (q('[data-paste-end]')) return mut((root) => { PD.resolve(root, basePath, true).push(clone(PD.blockClip)); });
            if (q('[data-clip-clear]')) { PD.blockClip = null; return ed.render(); }
            if (q('[data-open-store]')) return PD.go('store', q('[data-open-store]').dataset.openStore);
            if (q('[data-enable]')) return;   // obsługiwane w change
            const op = q('[data-op]');
            if (op && rowEl) { e.stopPropagation(); return rowOp(op.dataset.op, path); }
            if (q('.ab-name, .ab-sum, .ab-ico') && rowEl && !q('.ab-body')) return rowOp('open', path);
            if (!rowEl) return;
            if (q('[data-set-ms]')) return mut((r) => { blockAt(r, path).ms = Number(q('[data-set-ms]').dataset.setMs); });
            if (q('[data-add-branch]')) return mut((r) => { blockAt(r, path).branches.push({ cond: { join: 'and', rules: [{ left: '', op: 'isOn', right: '' }] }, blocks: [] }); });
            if (q('[data-add-else]')) return mut((r) => { blockAt(r, path).else = []; });
            if (q('[data-del-else]')) return mut((r) => { delete blockAt(r, path).else; });
            if (q('[data-del-branch]')) { const bp = P(q('[data-del-branch]').dataset.delBranch); return mut((r) => { PD.resolve(r, bp.slice(0, -1)).splice(bp[bp.length - 1], 1); }); }
            if (q('[data-add-case]')) return mut((r) => { blockAt(r, path).cases.push({ value: '', blocks: [] }); });
            if (q('[data-add-otherwise]')) return mut((r) => { blockAt(r, path).otherwise = []; });
            if (q('[data-del-otherwise]')) return mut((r) => { delete blockAt(r, path).otherwise; });
            if (q('[data-del-case]')) { const cp = P(q('[data-del-case]').dataset.delCase); return mut((r) => { PD.resolve(r, cp.slice(0, -1)).splice(cp[cp.length - 1], 1); }); }
            if (q('[data-ins-subject]')) return PD.pickVariable((name) => mut((r) => { const b = blockAt(r, path); b.subject = `${b.subject || ''}{${name}}`; }));
        });
        el.addEventListener('change', (e) => {
            if (!e.target.matches('[data-enable]')) return;
            const path = P(e.target.closest('.ab-row').dataset.path);
            mut((r) => { const b = blockAt(r, path); b.enabled = e.target.checked; });
        });
        el.addEventListener('input', (e) => {
            const t = e.target;
            const rowEl = t.closest('.ab-row');
            if (!rowEl || t.closest('[data-cond]')) return;
            const path = P(rowEl.dataset.path);
            if (t.dataset.caseValue) { const cp = P(t.dataset.caseValue); return mut((r) => { PD.resolve(r, cp).value = t.value; }, false); }
            if (t.dataset.bkey) return mut((r) => { blockAt(r, path)[t.dataset.bkey] = t.type === 'number' ? (t.value === '' ? '' : Number(t.value)) : t.value; }, false);
        });
        el.addEventListener('contextmenu', (e) => {
            const rowEl = e.target.closest('.ab-row');
            if (!rowEl || e.target.closest('input,textarea,select')) return;
            e.preventDefault();
            const path = P(rowEl.dataset.path);
            const x = blockAt(getRoot(), path);
            PD.menu(e.clientX, e.clientY, [
                ['run', 'Uruchom tę akcję', 'play'],
                null,
                ['cut', 'Wytnij', 'scissors'], ['copy', 'Kopiuj', 'copy'], ['duplicate', 'Duplikuj', 'copy-plus'],
                ['paste', 'Wklej poniżej', 'clipboard-paste', '', !PD.blockClip],
                null,
                ['toggle', x.enabled === false ? 'Włącz' : 'Wyłącz', x.enabled === false ? 'eye' : 'eye-off'],
                ['comment', x.comment !== undefined ? 'Usuń komentarz' : 'Dodaj komentarz', 'message-square'],
                ['up', 'W górę', 'arrow-up'], ['down', 'W dół', 'arrow-down'],
                null,
                ['delete', 'Usuń', 'trash-2', 'danger'],
            ], (cmd) => rowOp(cmd, path));
        });
        PD.wireCond(el, (r) => r, mut);

        function insert(listPath, index, block) {
            mut((root) => { PD.resolve(root, listPath, true).splice(index, 0, block); });
            if (!block.kind) expanded.add(JSON.stringify([...listPath, index]));
            ed.render();
        }
        return ed;
    };

    // ───── Okno „Dodaj akcję”: kategorie po lewej, lista po prawej ─────
    let pickCb = null, pickCat = 'all', pickLoop = false;
    PD.openActionPicker = (cb, inLoop) => {
        pickCb = cb; pickLoop = Boolean(inLoop);
        $('actionSearch').value = '';
        renderPicker();
        PitayaUI.openModal('modalAction');
        setTimeout(() => $('actionSearch').focus(), 50);
    };
    function entries() {
        const out = [];
        for (const [k, l] of Object.entries(PD.LOGIC)) if (k !== 'break' || pickLoop) out.push({ cat: 'logic', catName: 'Logika', color: l.color, icon: l.icon, name: l.name, desc: l.desc, logic: k });
        for (const p of PD.data.plugins) {
            if (p.error || p.disabled) continue;
            const [color, icon] = PD.lookOfPlugin(p);
            for (const a of p.actions) out.push({ cat: p.id, catName: p.name, color, icon, name: a.name, desc: a.description, plugin: p.id, action: a.id });
        }
        return out;
    }
    function renderPicker() {
        const all = entries();
        const favs = PD.favList('actions');
        const keyOf = (e) => (e.logic ? `logic:${e.logic}` : `${e.plugin}/${e.action}`);
        all.forEach((e) => { e.key = keyOf(e); e.fav = favs.includes(e.key); });
        const cats = [['all', 'Wszystkie', 'layers', all.length], ['fav', 'Ulubione', 'star', all.filter((e) => e.fav).length]];
        const seen = new Map();
        for (const e of all) { if (!seen.has(e.cat)) seen.set(e.cat, [e.catName, e.cat === 'logic' ? 'code' : e.icon, 0]); seen.get(e.cat)[2]++; }
        const sorted = [...seen.entries()].sort((a, b) => (a[0] === 'logic' ? -1 : b[0] === 'logic' ? 1 : a[1][0].localeCompare(b[1][0], 'pl')));
        for (const [id, [name, icon, n]] of sorted) cats.push([id, name, icon, n]);
        $('amCats').innerHTML = cats.map(([id, name, icon, n]) => `<button data-cat="${esc(id)}" class="${id === pickCat ? 'active' : ''}">${PD.icon(icon)}<span class="c-name">${esc(name)}</span><span class="n">${n}</span></button>`).join('') +
            `<div class="ctx-sep"></div><button data-store-more>${PD.icon('store')}<span class="c-name">Więcej w sklepie</span></button>`;
        const q = $('actionSearch').value.trim().toLowerCase();
        if (pickCat === 'fav' && !all.some((e) => e.fav)) pickCat = 'all';
        const list = all.filter((e) => (pickCat === 'all' || (pickCat === 'fav' ? e.fav : e.cat === pickCat)) && (!q || `${e.name} ${e.desc} ${e.catName} ${e.action || ''}`.toLowerCase().includes(q)))
            .sort((a, b) => (pickCat === 'all' ? (b.fav ? 1 : 0) - (a.fav ? 1 : 0) : 0));
        $('actionPicker').innerHTML = list.map((e, i) => `<button class="am-item" style="--bc:${esc(e.color)}" data-pick="${i}">
            <span class="am-ico">${PD.icon(e.icon)}</span><span class="am-txt"><b>${esc(e.name)}</b>${e.desc ? `<small>${esc(e.desc)}</small>` : ''}</span><span class="am-tag">${esc(e.catName)}</span><span class="fav-star${e.fav ? ' on' : ''}" data-fava="${esc(e.key)}" title="${e.fav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}">${PD.icon('star')}</span></button>`).join('') ||
            '<div class="empty-note">Nic nie znaleziono. Może ta akcja jest w sklepie?</div>';
        $('actionPicker')._list = list;
    }
    $('actionSearch').oninput = renderPicker;
    $('amCats').onclick = (e) => {
        if (e.target.closest('[data-store-more]')) { PitayaUI.closeModal('modalAction'); return PD.go('store'); }
        const b = e.target.closest('[data-cat]');
        if (b) { pickCat = b.dataset.cat; renderPicker(); }
    };
    $('actionPicker').onclick = (e) => {
        const fs = e.target.closest('[data-fava]');
        if (fs) { e.stopPropagation(); PD.favToggle('actions', fs.dataset.fava); return renderPicker(); }
        const b = e.target.closest('[data-pick]');
        if (!b || !pickCb) return;
        const it = $('actionPicker')._list[Number(b.dataset.pick)];
        let block;
        if (it.logic) block = PD.newLogic(it.logic);
        else {
            const def = PD.plugin(it.plugin).actions.find((a) => a.id === it.action);
            const config = {};
            for (const f of def.fields) if (f.default !== undefined) config[f.key] = f.default;
            block = { plugin: it.plugin, action: it.action, config };
        }
        PitayaUI.closeModal('modalAction');
        const cb = pickCb; pickCb = null;
        cb(block, it);
    };
})();
