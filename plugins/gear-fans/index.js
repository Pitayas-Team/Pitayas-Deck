// Dodatek „Wentylatory GIGABYTE” — tryby wentylatorów, Turbo i temperatury przez aplikację Pitaya Gear.
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
    if (process.platform !== 'linux') return Promise.reject(new Error('Ten dodatek działa tylko na Linuksie (Pitaya Gear)'));
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

const PRESETS = { auto: 'Auto', silent: 'Cichy', normal: 'Normalny', gaming: 'Gaming' };
let timer = null;
let ctxRef = null;

function setVars(f) {
    if (!f || !f.available) {
        ctxRef.setStatus('Brak sterownika wentylatorów — uruchom install.sh z Pitaya Gear', false);
        return;
    }
    const v = {
        cpuTemp: f.cpu ? f.cpu.temp : '', gpuTemp: f.gpu ? f.gpu.temp : '',
        cpuRpm: f.cpu ? f.cpu.rpm : '', gpuRpm: f.gpu ? f.gpu.rpm : '',
        // W Turbo EC zgłasza wypełnienie ~80%, choć wentylatory kręcą się na maksimum — wtedy pokazujemy 100
        cpuFan: f.cpu ? (f.cpu.fullSpeed ? 100 : f.cpu.pwm) : '', gpuFan: f.gpu ? (f.gpu.fullSpeed ? 100 : f.gpu.pwm) : '',
        preset: f.turbo ? 'Turbo' : PRESETS[f.preset] || f.preset,
        presetId: f.preset, turbo: f.turbo, chargeLimit: f.chargeLimit,
    };
    for (const [k, val] of Object.entries(v)) ctxRef.setVariable(k, val);
    ctxRef.setStatus(`CPU ${v.cpuTemp}°C · ${v.preset}`);
}

async function poll(launch = false) {
    try {
        const { fans } = await gear('summary', { part: 'fans' }, { launch });
        setVars(fans);
    } catch (err) {
        ctxRef.setStatus(err.message, false);
    }
}

module.exports = {
    id: 'gear-fans',
    name: 'Wentylatory GIGABYTE',
    description: 'Tryby wentylatorów, Turbo, temperatury i limit baterii laptopa GIGABYTE (przez Pitaya Gear).',
    variables: [
        { id: 'cpuTemp', label: 'Temperatura CPU (°C)' },
        { id: 'gpuTemp', label: 'Temperatura GPU (°C)' },
        { id: 'cpuRpm', label: 'Wentylator CPU (RPM)' },
        { id: 'gpuRpm', label: 'Wentylator GPU (RPM)' },
        { id: 'cpuFan', label: 'Wentylator CPU (% mocy)' },
        { id: 'gpuFan', label: 'Wentylator GPU (% mocy)' },
        { id: 'preset', label: 'Tryb (Auto / Cichy / Normalny / Gaming / Turbo)' },
        { id: 'presetId', label: 'Tryb — identyfikator (auto, silent, normal, gaming)' },
        { id: 'turbo', label: 'Turbo włączone' },
        { id: 'chargeLimit', label: 'Limit ładowania baterii (%)' },
    ],
    start: async (ctx) => { ctxRef = ctx; await poll(true); timer = setInterval(poll, 2000); },
    settingsChanged: async (ctx) => { ctxRef = ctx; },
    stop: async () => { clearInterval(timer); },
    actions: [
        {
            id: 'preset',
            name: 'Tryb wentylatorów',
            fields: [{ key: 'preset', label: 'Tryb', type: 'select', default: 'cycle', options: [
                { value: 'cycle', label: 'Następny (Auto → Cichy → Normalny → Gaming)' },
                ...Object.entries(PRESETS).map(([value, label]) => ({ value, label })),
            ] }],
            run: async (c, ctx) => { ctxRef = ctx; setVars(await gear('fans', { preset: c.preset })); },
        },
        {
            id: 'turbo',
            name: 'Turbo (maksymalne obroty)',
            fields: [{ key: 'mode', label: 'Co zrobić', type: 'select', default: 'toggle', options: [{ value: 'toggle', label: 'Przełącz' }, { value: 'on', label: 'Włącz' }, { value: 'off', label: 'Wyłącz' }] }],
            run: async (c, ctx) => { ctxRef = ctx; setVars(await gear('fans', { turbo: c.mode === 'toggle' ? 'toggle' : c.mode === 'on' })); },
        },
        {
            id: 'chargeLimit',
            name: 'Limit ładowania baterii',
            fields: [{ key: 'value', label: 'Limit (60–100 %)', type: 'number', default: 80, help: 'Na suwaku wpisz {value}' }],
            run: async (c, ctx) => { ctxRef = ctx; setVars(await gear('fans', { chargeLimit: Math.max(60, Math.min(100, Number(c.value) || 80)) })); },
        },
        {
            id: 'open',
            name: 'Otwórz wentylatory w Pitaya Gear',
            fields: [],
            run: async () => { await openGear('fans'); },
        },
    ],
};
