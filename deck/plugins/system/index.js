// Wtyczka „System”: skróty klawiszowe, wpisywanie tekstu, programy, polecenia, blokada ekranu.
// Zmienne: godzina, data, obciążenie procesora i pamięci.
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

let timer = null;
let slowTimer = null;
let lastCpu = null;
const read = (f) => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return null; } };

// Czujniki Linuxa: temperatura procesora (k10temp / coretemp), GPU AMD, bateria
function hwmon(name) {
    try {
        for (const h of fs.readdirSync('/sys/class/hwmon')) {
            if (read(`/sys/class/hwmon/${h}/name`) === name) return `/sys/class/hwmon/${h}`;
        }
    } catch {}
    return null;
}
let nvidia = null;
function slowTick(ctx) {
    if (process.platform !== 'linux') return;
    const cpuSensor = hwmon('k10temp') || hwmon('coretemp') || hwmon('zenpower');
    const t = cpuSensor && read(`${cpuSensor}/temp1_input`);
    if (t) ctx.setVariable('cpuTemp', Math.round(parseInt(t, 10) / 1000));
    try {
        for (const c of fs.readdirSync('/sys/class/drm')) {
            const busy = read(`/sys/class/drm/${c}/device/gpu_busy_percent`);
            if (busy !== null) { ctx.setVariable('gpuAmd', parseInt(busy, 10)); break; }
        }
    } catch {}
    for (const b of ['BAT0', 'BAT1', 'BAT2']) {
        const cap = read(`/sys/class/power_supply/${b}/capacity`);
        if (cap !== null) {
            ctx.setVariable('battery', parseInt(cap, 10));
            ctx.setVariable('charging', /Charging|Full/.test(read(`/sys/class/power_supply/${b}/status`) || ''));
            break;
        }
    }
    if (nvidia !== false) {
        execFile('nvidia-smi', ['--query-gpu=utilization.gpu,temperature.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'], { timeout: 3000 }, (err, out) => {
            if (err) { nvidia = false; return; }
            nvidia = true;
            const [util, temp, used, total] = out.split('\n')[0].split(',').map((x) => parseFloat(x));
            ctx.setVariable('gpu', util);
            ctx.setVariable('gpuTemp', temp);
            ctx.setVariable('gpuMem', Math.round((used / total) * 100));
        });
    }
}

// Zainstalowane aplikacje: pliki .desktop (Linux, też Flatpak) albo skróty menu Start (Windows)
function installedApps() {
    const out = new Map();
    if (process.platform === 'win32') {
        const roots = [path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'), path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs')];
        const walk = (d, depth = 0) => {
            let list = [];
            try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
            for (const e of list) {
                const full = path.join(d, e.name);
                if (e.isDirectory() && depth < 3) walk(full, depth + 1);
                else if (/\.(lnk|url)$/i.test(e.name)) out.set(full, e.name.replace(/\.(lnk|url)$/i, ''));
            }
        };
        roots.forEach((r) => walk(r));
    } else {
        const dirs = [...(process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':'), path.join(os.homedir(), '.local', 'share'), '/var/lib/flatpak/exports/share', path.join(os.homedir(), '.local/share/flatpak/exports/share')]
            .map((d) => path.join(d, 'applications'));
        for (const d of dirs) {
            let files = [];
            try { files = fs.readdirSync(d).filter((f) => f.endsWith('.desktop')); } catch { continue; }
            for (const f of files) {
                const text = read(path.join(d, f)) || '';
                const entry = text.split(/^\[/m).find((sect) => sect.startsWith('Desktop Entry]')) || '';
                if (/^NoDisplay=true/m.test(entry) || /^Hidden=true/m.test(entry) || !/^Type=Application/m.test(entry)) continue;
                const name = (entry.match(/^Name\[pl\]=(.+)$/m) || entry.match(/^Name=(.+)$/m) || [])[1];
                // Ten sam plik w kilku miejscach — pierwszy wygrywa (kolejność jak w XDG_DATA_DIRS)
                if (name && ![...out.keys()].some((k) => path.basename(k) === f)) out.set(path.join(d, f), name.trim());
            }
        }
    }
    return [...out.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'pl'));
}

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
    ctx.setVariable('uptime', Math.floor(os.uptime() / 3600) + ' h');
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
        { id: 'cpuTemp', label: 'Temperatura procesora (°C)' },
        { id: 'gpu', label: 'Karta graficzna NVIDIA %' },
        { id: 'gpuTemp', label: 'Temperatura GPU NVIDIA (°C)' },
        { id: 'gpuMem', label: 'Pamięć GPU NVIDIA %' },
        { id: 'gpuAmd', label: 'Karta graficzna AMD %' },
        { id: 'battery', label: 'Bateria %' },
        { id: 'charging', label: 'Ładowanie' },
        { id: 'uptime', label: 'Czas pracy komputera' },
    ],
    start: async (ctx) => {
        cpuUsage();
        tick(ctx);
        timer = setInterval(() => tick(ctx), 1000);
        slowTick(ctx);
        slowTimer = setInterval(() => slowTick(ctx), 2000);
    },
    stop: async () => { clearInterval(timer); clearInterval(slowTimer); },
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
            id: 'launch',
            name: 'Uruchom aplikację',
            description: 'Wybierz z listy zainstalowanych programów',
            fields: [{ key: 'app', label: 'Aplikacja', type: 'select', options: async () => installedApps() }],
            run: async (c, ctx) => {
                if (!c.app) throw new Error('Wybierz aplikację');
                if (process.platform === 'win32') return ctx.platform.open(c.app);
                // gio uruchamia też aplikacje Flatpak i rozumie pola %U, %F itp.
                if (ctx.platform.which('gio')) return ctx.platform.exec('gio', ['launch', c.app], { timeout: 15000 });
                return ctx.platform.exec('gtk-launch', [path.basename(c.app, '.desktop')], { timeout: 15000 });
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
