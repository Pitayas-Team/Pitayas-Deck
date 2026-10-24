// Dodatek „Mysz G502” — Logitech G502 HERO przez aplikację Pitaya Gear (DPI, profile, podświetlenie).
// ── Połączenie z Pitaya Gear przez kanał sterowania Pitaya Core (~/.config/Pitayas/run/gear.sock) ──
// Pitaya Gear trzyma urządzenia (HID, ratbagd, OpenRGB, sterownik wentylatorów); wtyczka tylko wysyła polecenia.
// Gdy Gear nie działa, wtyczka uruchamia go w tle (zasobnik) na podstawie wpisu w rejestrze aplikacji Pitayas.
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const PITAYAS = process.env.PITAYAS_HOME || (process.platform === 'win32'
    ? path.join(process.env.APPDATA || os.homedir(), 'Pitayas')
    : path.join(os.homedir(), '.config', 'Pitayas'));
const SOCKET = process.platform === 'win32' ? '\\\\.\\pipe\\pitayas-gear' : path.join(PITAYAS, 'run', 'gear.sock');

function send(cmd, args = {}, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const sock = net.createConnection(SOCKET);
        let buf = '';
        const timer = setTimeout(() => { sock.destroy(); reject(new Error('Pitaya Gear nie odpowiada')); }, timeout);
        sock.setEncoding('utf8');
        sock.on('connect', () => sock.write(`${JSON.stringify({ id: 1, cmd, args })}\n`));
        sock.on('data', (chunk) => {
            buf += chunk;
            const nl = buf.indexOf('\n');
            if (nl < 0) return;
            clearTimeout(timer);
            sock.end();
            let msg;
            try { msg = JSON.parse(buf.slice(0, nl)); } catch { reject(new Error('Niepoprawna odpowiedź Pitaya Gear')); return; }
            if (msg.ok) resolve(msg.result); else reject(new Error(msg.error || 'Błąd Pitaya Gear'));
        });
        sock.on('error', (err) => {
            clearTimeout(timer);
            const down = err.code === 'ENOENT' || err.code === 'ECONNREFUSED';
            reject(Object.assign(new Error(down ? 'Pitaya Gear nie jest uruchomiony' : err.message), { down }));
        });
    });
}

let launching = null;
function launchGear() {
    if (launching) return launching;
    launching = (async () => {
        let entry;
        try { entry = JSON.parse(fs.readFileSync(path.join(PITAYAS, 'apps', 'gear.json'), 'utf8')); } catch {
            throw new Error('Nie znaleziono Pitaya Gear — uruchom go raz ręcznie');
        }
        const { command, args = [], cwd } = entry.launch || {};
        if (!command) throw new Error('Rejestr Pitaya Gear nie ma polecenia uruchomienia');
        spawn(command, [...args, '--no-sandbox', '--hidden'], { cwd: cwd || undefined, detached: true, stdio: 'ignore' }).unref();
        for (let i = 0; i < 40; i++) {
            await new Promise((r) => setTimeout(r, 250));
            try { await send('ping', {}, 1000); return; } catch {}
        }
        throw new Error('Pitaya Gear nie uruchomił się');
    })().finally(() => { launching = null; });
    return launching;
}

async function gear(cmd, args, { launch = true } = {}) {
    try {
        return await send(cmd, args);
    } catch (err) {
        if (!err.down || !launch) throw err;
        await launchGear();
        return send(cmd, args);
    }
}

const openGear = (tab) => gear('open', { tab });

const LED = { static: 'Stały', breathing: 'Oddychanie', cycle: 'Tęcza', off: 'Wyłączone' };
let timer = null;
let ctxRef = null;

async function poll(launch = false) {
    try {
        const { mouse: m } = await gear('summary', { part: 'mouse' }, { launch });
        if (!m || m.error) throw new Error(m ? m.error : 'Brak danych');
        ctxRef.setVariable('dpi', m.dpi ?? '');
        ctxRef.setVariable('profile', m.profile ?? '');
        ctxRef.setVariable('reportRate', m.reportRate ?? '');
        ctxRef.setVariable('ledMode', m.led ? LED[m.led.mode] || m.led.mode : '');
        ctxRef.setVariable('ledColor', m.led ? m.led.color : '');
        ctxRef.setStatus(`${m.dpi} DPI · profil ${m.profile}`);
    } catch (err) {
        ctxRef.setStatus(err.message, false);
    }
}

module.exports = {
    id: 'gear-mouse',
    name: 'Mysz G502',
    description: 'Logitech G502: DPI, profile i kolor podświetlenia (przez Pitaya Gear).',
    variables: [
        { id: 'dpi', label: 'Aktualne DPI' },
        { id: 'profile', label: 'Aktywny profil' },
        { id: 'reportRate', label: 'Częstotliwość raportowania (Hz)' },
        { id: 'ledMode', label: 'Tryb podświetlenia' },
        { id: 'ledColor', label: 'Kolor podświetlenia (#rrggbb)' },
    ],
    start: async (ctx) => { ctxRef = ctx; await poll(true); timer = setInterval(poll, 5000); },
    settingsChanged: async (ctx) => { ctxRef = ctx; },
    stop: async () => { clearInterval(timer); },
    actions: [
        {
            id: 'dpi',
            name: 'DPI',
            fields: [
                { key: 'mode', label: 'Co zrobić', type: 'select', default: 'next', options: [{ value: 'next', label: 'Następny poziom' }, { value: 'prev', label: 'Poprzedni poziom' }, { value: 'set', label: 'Ustaw wartość' }] },
                { key: 'value', label: 'DPI (dla „Ustaw”)', type: 'number', default: 1600, help: 'Na suwaku wpisz {value}' },
            ],
            run: async (c, ctx) => {
                ctxRef = ctx;
                await gear('mouse', { dpi: c.mode === 'set' ? Math.max(100, Number(c.value) || 1600) : c.mode });
                await poll();
            },
        },
        {
            id: 'profile',
            name: 'Profil myszy',
            fields: [
                { key: 'profile', label: 'Profil', type: 'select', default: 'next', options: [{ value: 'next', label: 'Następny' }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `Profil ${n}` }))] },
            ],
            run: async (c, ctx) => { ctxRef = ctx; await gear('mouse', { profile: c.profile }); await poll(); },
        },
        {
            id: 'led',
            name: 'Podświetlenie',
            fields: [
                { key: 'mode', label: 'Tryb', type: 'select', default: 'static', options: Object.entries(LED).map(([value, label]) => ({ value, label })) },
                { key: 'color', label: 'Kolor (#rrggbb)', type: 'text', default: '#ff4fa6', placeholder: '#ff4fa6' },
                { key: 'speed', label: 'Szybkość efektu (0–100)', type: 'number', default: 50 },
            ],
            run: async (c, ctx) => {
                ctxRef = ctx;
                const color = /^#?[0-9a-f]{6}$/i.test(String(c.color).trim()) ? `#${String(c.color).trim().replace('#', '')}` : '#ff4fa6';
                await gear('mouse', { led: { mode: c.mode, color, speed: Number(c.speed) || 50 } });
                await poll();
            },
        },
        {
            id: 'open',
            name: 'Otwórz w Pitaya Gear',
            fields: [],
            run: async () => { await openGear('mouse'); },
        },
    ],
};
