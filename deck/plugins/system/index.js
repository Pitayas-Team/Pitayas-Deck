// Wtyczka „System”: skróty klawiszowe, wpisywanie tekstu, programy, polecenia, blokada ekranu.
// Zmienne: godzina, data, obciążenie procesora i pamięci.
const os = require('os');

let timer = null;
let lastCpu = null;

function cpuUsage() {
    const totals = os.cpus().reduce((acc, c) => {
        const t = c.times;
        acc.idle += t.idle;
        acc.total += t.user + t.nice + t.sys + t.idle + t.irq;
        return acc;
    }, { idle: 0, total: 0 });
    let pct = 0;
    if (lastCpu) {
        const dt = totals.total - lastCpu.total;
        pct = dt > 0 ? Math.round(100 * (1 - (totals.idle - lastCpu.idle) / dt)) : 0;
    }
    lastCpu = totals;
    return Math.max(0, Math.min(100, pct));
}

function tick(ctx) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    ctx.setVariable('time', `${pad(now.getHours())}:${pad(now.getMinutes())}`);
    ctx.setVariable('seconds', `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);
    ctx.setVariable('date', `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`);
    ctx.setVariable('weekday', now.toLocaleDateString('pl-PL', { weekday: 'long' }));
    ctx.setVariable('cpu', cpuUsage());
    const used = os.totalmem() - os.freemem();
    ctx.setVariable('ram', Math.round((100 * used) / os.totalmem()));
    ctx.setVariable('ramUsed', Math.round((used / 1073741824) * 10) / 10);
}

module.exports = {
    id: 'system',
    name: 'System',
    description: 'Skróty klawiszowe, tekst, programy, polecenia i informacje o komputerze.',
    variables: [
        { id: 'time', label: 'Godzina (12:34)' },
        { id: 'seconds', label: 'Godzina z sekundami' },
        { id: 'date', label: 'Data' },
        { id: 'weekday', label: 'Dzień tygodnia' },
        { id: 'cpu', label: 'Procesor %' },
        { id: 'ram', label: 'Pamięć %' },
        { id: 'ramUsed', label: 'Pamięć zajęta (GB)' },
    ],
    start: async (ctx) => {
        cpuUsage();
        tick(ctx);
        timer = setInterval(() => tick(ctx), 1000);
    },
    stop: async () => clearInterval(timer),
    actions: [
        {
            id: 'hotkey',
            name: 'Skrót klawiszowy',
            description: 'Np. ctrl+shift+m, alt+tab, super, f13',
            fields: [{ key: 'combo', label: 'Skrót', type: 'hotkey', placeholder: 'ctrl+shift+m' }],
            run: async (c, ctx) => ctx.platform.pressCombo(c.combo),
        },
        {
            id: 'type',
            name: 'Wpisz tekst',
            description: 'Wkleja tekst w aktywnym oknie (działa z polskimi znakami)',
            fields: [
                { key: 'text', label: 'Tekst', type: 'textarea' },
                { key: 'enter', label: 'Naciśnij Enter po wpisaniu', type: 'bool', default: false },
            ],
            run: async (c, ctx) => {
                await ctx.platform.typeText(c.text);
                if (c.enter) { await new Promise((r) => setTimeout(r, 80)); await ctx.platform.pressCombo('enter'); }
            },
        },
        {
            id: 'open',
            name: 'Otwórz program, plik lub link',
            fields: [{ key: 'target', label: 'Ścieżka albo adres', type: 'file', placeholder: '/usr/bin/firefox albo https://…' }],
            run: async (c, ctx) => ctx.platform.open(c.target.trim()),
        },
        {
            id: 'command',
            name: 'Uruchom polecenie',
            fields: [
                { key: 'command', label: 'Polecenie', type: 'text', placeholder: 'np. obs --startrecording' },
                { key: 'wait', label: 'Czekaj na zakończenie (kolejne akcje po nim)', type: 'bool', default: false },
                { key: 'saveTo', label: 'Zapisz wynik do zmiennej (opcjonalnie)', type: 'text', placeholder: 'np. wynik' },
            ],
            run: async (c, ctx) => {
                const out = await ctx.platform.runCommand(c.command, { wait: c.wait || Boolean(c.saveTo) });
                if (c.saveTo) ctx.setUserVariable(c.saveTo.trim(), out, 'text');
            },
        },
        {
            id: 'lock',
            name: 'Zablokuj ekran',
            run: async (c, ctx) => {
                if (process.platform === 'win32') return ctx.platform.runCommand('rundll32.exe user32.dll,LockWorkStation');
                return ctx.platform.runCommand('loginctl lock-session', { wait: true });
            },
        },
        {
            id: 'notify',
            name: 'Powiadomienie na komputerze',
            fields: [{ key: 'text', label: 'Treść', type: 'text' }],
            run: async (c, ctx) => ctx.desktopNotify(c.text),
        },
    ],
};
