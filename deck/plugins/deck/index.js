// Wtyczka „Deck”: nawigacja między folderami i profilami, zmienne użytkownika, opóźnienia.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseValue(raw, type) {
    if (type === 'number') { const n = parseFloat(String(raw).replace(',', '.')); return isNaN(n) ? 0 : n; }
    if (type === 'bool') return ['1', 'true', 'tak', 'on', 'wł', 'wł.'].includes(String(raw).trim().toLowerCase());
    return String(raw ?? '');
}

module.exports = {
    id: 'deck',
    name: 'Deck',
    description: 'Foldery, profile, zmienne i opóźnienia.',
    actions: [
        {
            id: 'open-folder',
            name: 'Otwórz folder',
            fields: [{ key: 'folder', label: 'Folder', type: 'select', options: (ctx) => ctx.deck.folders() }],
            run: async (c, ctx) => ctx.deck.openFolder(ctx.device, c.folder),
        },
        { id: 'back', name: 'Wstecz', description: 'Folder nadrzędny', run: async (c, ctx) => ctx.deck.back(ctx.device) },
        { id: 'home', name: 'Ekran startowy', description: 'Pierwszy folder profilu', run: async (c, ctx) => ctx.deck.home(ctx.device) },
        {
            id: 'switch-profile',
            name: 'Przełącz profil',
            fields: [{ key: 'profile', label: 'Profil', type: 'select', options: (ctx) => ctx.deck.profiles() }],
            run: async (c, ctx) => ctx.deck.switchProfile(ctx.device, c.profile),
        },
        {
            id: 'set-variable',
            name: 'Ustaw zmienną',
            fields: [
                { key: 'name', label: 'Zmienna', type: 'text', placeholder: 'np. licznik' },
                { key: 'type', label: 'Typ', type: 'select', default: 'text', options: [{ value: 'text', label: 'Tekst' }, { value: 'number', label: 'Liczba' }, { value: 'bool', label: 'Wł./wył.' }] },
                { key: 'value', label: 'Wartość', type: 'text', help: 'Można użyć innych zmiennych: {system.time}' },
            ],
            run: async (c, ctx) => {
                if (!c.name) throw new Error('Podaj nazwę zmiennej');
                ctx.setUserVariable(c.name.trim(), parseValue(c.value, c.type), c.type);
            },
        },
        {
            id: 'toggle-variable',
            name: 'Przełącz zmienną wł./wył.',
            description: 'Dobre do przycisków ze stanem',
            fields: [{ key: 'name', label: 'Zmienna', type: 'text', placeholder: 'np. tryb_nagrywania' }],
            run: async (c, ctx) => {
                if (!c.name) throw new Error('Podaj nazwę zmiennej');
                ctx.setUserVariable(c.name.trim(), !ctx.getVariable(c.name.trim()), 'bool');
            },
        },
        {
            id: 'change-variable',
            name: 'Zwiększ / zmniejsz zmienną',
            fields: [
                { key: 'name', label: 'Zmienna', type: 'text', placeholder: 'np. licznik' },
                { key: 'amount', label: 'O ile', type: 'number', default: 1, help: 'Liczba ujemna zmniejsza' },
            ],
            run: async (c, ctx) => {
                if (!c.name) throw new Error('Podaj nazwę zmiennej');
                const current = parseFloat(ctx.getVariable(c.name.trim())) || 0;
                ctx.setUserVariable(c.name.trim(), current + (parseFloat(c.amount) || 0), 'number');
            },
        },
        {
            id: 'set-state',
            name: 'Ustaw stan przycisku',
            description: 'Dla przycisków z kilkoma stanami (zakładka Stan)',
            fields: [
                { key: 'state', label: 'Stan', type: 'text', default: 'next', help: '„next” = następny, „previous” = poprzedni albo nazwa stanu, np. Wł.' },
            ],
            run: async (c, ctx) => {
                const { folderId, key } = ctx;
                if (!folderId || !key) throw new Error('Tę akcję trzeba wywołać z przycisku na decku');
                ctx.deck.setState(folderId, key, c.state || 'next');
            },
        },
        {
            id: 'run-script',
            name: 'Uruchom skrypt',
            description: 'Wykonuje jeden z Twoich skryptów (strona Skrypty) i czeka na jego koniec',
            fields: [{ key: 'script', label: 'Skrypt', type: 'select', options: async (ctx) => ctx.deck.scripts() }],
            run: async (c, ctx) => {
                if (!c.script) throw new Error('Wybierz skrypt');
                await ctx.deck.runScript(c.script, { device: ctx.device, button: ctx.button, folderId: ctx.folderId, key: ctx.key, locals: ctx.locals, scriptDepth: ctx.scriptDepth });
            },
        },
        {
            id: 'delay',
            name: 'Czekaj',
            description: 'Pauza między akcjami',
            fields: [{ key: 'ms', label: 'Milisekundy', type: 'number', default: 500 }],
            run: async (c) => sleep(Math.max(0, Math.min(600000, parseInt(c.ms, 10) || 0))),
        },
        {
            id: 'toast',
            name: 'Komunikat na urządzeniu',
            fields: [{ key: 'text', label: 'Tekst', type: 'text' }],
            run: async (c, ctx) => ctx.deck.toast(ctx.device, c.text),
        },
    ],
};
