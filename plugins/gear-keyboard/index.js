// Dodatek „Klawiatura RGB” — podświetlenie klawiatury laptopa GIGABYTE przez aplikację Pitaya Gear.
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

let timer = null;
let ctxRef = null;

function setVars(kb) {
    ctxRef.setVariable('color', kb.color);
    ctxRef.setVariable('brightness', kb.brightness);
    ctxRef.setVariable('on', !kb.autonomous && kb.brightness > 0);
    ctxRef.setVariable('mode', kb.autonomous ? 'Efekt wbudowany' : kb.brightness > 0 ? 'Kolor' : 'Wyłączona');
}

async function poll(launch = false) {
    try {
        const { keyboard: kb } = await gear('summary', { part: 'keyboard' }, { launch });
        setVars(kb);
        ctxRef.setStatus(kb.autonomous ? 'Efekt wbudowany' : `${kb.color} · ${kb.brightness}%`);
    } catch (err) {
        ctxRef.setStatus(err.message, false);
    }
}

const normColor = (c) => (/^#?[0-9a-f]{6}$/i.test(String(c).trim()) ? `#${String(c).trim().replace('#', '')}` : null);

module.exports = {
    id: 'gear-keyboard',
    name: 'Klawiatura RGB',
    description: 'Kolor i jasność podświetlenia klawiatury GIGABYTE (przez Pitaya Gear).',
    variables: [
        { id: 'color', label: 'Kolor (#rrggbb)' },
        { id: 'brightness', label: 'Jasność (%)' },
        { id: 'on', label: 'Podświetlenie włączone' },
        { id: 'mode', label: 'Tryb (Kolor / Efekt wbudowany / Wyłączona)' },
    ],
    start: async (ctx) => { ctxRef = ctx; await poll(true); timer = setInterval(poll, 5000); },
    settingsChanged: async (ctx) => { ctxRef = ctx; },
    stop: async () => { clearInterval(timer); },
    actions: [
        {
            id: 'color',
            name: 'Kolor podświetlenia',
            fields: [
                { key: 'color', label: 'Kolor (#rrggbb)', type: 'text', default: '#ff4fa6', placeholder: '#ff4fa6' },
                { key: 'brightness', label: 'Jasność (%) — puste = bez zmian', type: 'number', default: '' },
            ],
            run: async (c, ctx) => {
                ctxRef = ctx;
                const color = normColor(c.color);
                if (!color) throw new Error('Kolor w formacie #rrggbb, np. #ff4fa6');
                const args = { color, autonomous: false };
                if (c.brightness !== '' && c.brightness != null) args.brightness = Math.max(0, Math.min(100, Number(c.brightness)));
                setVars(await gear('keyboard', args));
            },
        },
        {
            id: 'brightness',
            name: 'Jasność podświetlenia',
            fields: [
                { key: 'mode', label: 'Co zrobić', type: 'select', default: 'toggle', options: [{ value: 'toggle', label: 'Włącz / wyłącz' }, { value: 'up', label: 'Jaśniej' }, { value: 'down', label: 'Ciemniej' }, { value: 'set', label: 'Ustaw' }] },
                { key: 'value', label: 'O ile / na ile (%)', type: 'number', default: 25, help: 'Na suwaku wpisz {value}' },
            ],
            run: async (c, ctx) => {
                ctxRef = ctx;
                const n = Math.abs(Number(c.value) || 0);
                const args = c.mode === 'toggle' ? { toggle: true }
                    : c.mode === 'set' ? { brightness: Math.min(100, n), autonomous: false }
                        : { brightness: `${c.mode === 'up' ? '+' : '-'}${n}`, autonomous: false };
                setVars(await gear('keyboard', args));
            },
        },
        {
            id: 'effect',
            name: 'Efekt wbudowany',
            description: 'Oddaje podświetlenie firmware klawiatury (efekty przełączane klawiszami Fn)',
            fields: [{ key: 'mode', label: 'Co zrobić', type: 'select', default: 'on', options: [{ value: 'on', label: 'Włącz efekt wbudowany' }, { value: 'off', label: 'Wróć do koloru' }] }],
            run: async (c, ctx) => { ctxRef = ctx; setVars(await gear('keyboard', { autonomous: c.mode === 'on' })); },
        },
        {
            id: 'open',
            name: 'Otwórz w Pitaya Gear',
            fields: [],
            run: async () => { await openGear('keyboard'); },
        },
    ],
};
