// Dodatek „Słuchawki Arctis” — SteelSeries Arctis Nova Pro Omni przez aplikację Pitaya Gear.
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

const NOISE = { 0: 'Wyłączona', 1: 'Transparency', 2: 'ANC' };
const CHARGING = { 1: 'Wyłączone', 2: 'Ładowanie', 4: 'Naładowane', 8: 'Na baterii' };
let timer = null;
let ctxRef = null;

async function poll(launch = false) {
    try {
        const { headset: st } = await gear('summary', { part: 'headset' }, { launch });
        if (!st || st.error) throw new Error(st ? st.error : 'Brak danych');
        const v = {
            connected: st.connected,
            battery: st.connected ? st.battery : '',
            batteryText: st.connected ? `${st.battery}%` : '—',
            spareBattery: st.spareBattery,
            charging: CHARGING[st.charging] || '',
            noiseMode: NOISE[st.noiseMode] || '',
            anc: st.noiseMode === 2,
            micMuted: st.micMuted,
        };
        for (const [k, val] of Object.entries(v)) ctxRef.setVariable(k, val);
        ctxRef.setStatus(st.connected ? `Połączone · bateria ${st.battery}%` : 'Stacja podłączona, słuchawki rozłączone');
    } catch (err) {
        ctxRef.setVariable('connected', false);
        ctxRef.setStatus(err.message, false);
    }
}

module.exports = {
    id: 'gear-headset',
    name: 'Słuchawki Arctis',
    description: 'Arctis Nova Pro Omni: ANC, mikrofon, sidetone, korektor i bateria (przez Pitaya Gear).',
    variables: [
        { id: 'battery', label: 'Bateria słuchawek (%)' },
        { id: 'batteryText', label: 'Bateria słuchawek (np. 62%)' },
        { id: 'spareBattery', label: 'Bateria zapasowa (%)' },
        { id: 'charging', label: 'Zasilanie (Na baterii / Ładowanie…)' },
        { id: 'connected', label: 'Słuchawki połączone' },
        { id: 'noiseMode', label: 'Redukcja szumów (ANC / Transparency / Wyłączona)' },
        { id: 'anc', label: 'ANC włączone' },
        { id: 'micMuted', label: 'Mikrofon wyciszony' },
    ],
    start: async (ctx) => { ctxRef = ctx; await poll(true); timer = setInterval(poll, 3000); },
    settingsChanged: async (ctx) => { ctxRef = ctx; },
    stop: async () => { clearInterval(timer); },
    actions: [
        {
            id: 'noise',
            name: 'Redukcja szumów',
            description: 'ANC, Transparency albo wyłączona',
            fields: [{ key: 'mode', label: 'Tryb', type: 'select', default: 'cycle', options: [
                { value: 'cycle', label: 'Następny (wył. → Transparency → ANC)' },
                { value: 'anc', label: 'ANC' }, { value: 'transparency', label: 'Transparency' }, { value: 'off', label: 'Wyłączona' },
            ] }],
            run: async (c, ctx) => { ctxRef = ctx; await gear('headset', { noiseMode: c.mode }); await poll(); },
        },
        {
            id: 'sidetone',
            name: 'Sidetone (słyszysz siebie)',
            fields: [
                { key: 'mode', label: 'Co zrobić', type: 'select', default: 'toggle', options: [{ value: 'toggle', label: 'Przełącz' }, { value: 'on', label: 'Włącz' }, { value: 'off', label: 'Wyłącz' }, { value: 'level', label: 'Ustaw poziom' }] },
                { key: 'level', label: 'Poziom 1–10', type: 'number', default: 5, help: 'Na suwaku wpisz {value}' },
            ],
            run: async (c) => {
                if (c.mode === 'level') await gear('headset', { sidetoneLevel: Math.max(1, Math.min(10, Number(c.level) || 5)) });
                else await gear('headset', { sidetone: c.mode === 'toggle' ? 'toggle' : c.mode === 'on' });
            },
        },
        {
            id: 'micVolume',
            name: 'Głośność mikrofonu',
            fields: [
                { key: 'mode', label: 'Co zrobić', type: 'select', default: 'up', options: [{ value: 'up', label: 'Głośniej' }, { value: 'down', label: 'Ciszej' }, { value: 'set', label: 'Ustaw' }] },
                { key: 'value', label: 'O ile / na ile (1–10)', type: 'number', default: 1, help: 'Na suwaku wpisz {value}' },
            ],
            run: async (c) => {
                const n = Math.round(Number(c.value) || 1);
                await gear('headset', { micVolume: c.mode === 'set' ? n : `${c.mode === 'up' ? '+' : '-'}${Math.abs(n)}` });
            },
        },
        {
            id: 'eq',
            name: 'Korektor',
            fields: [{ key: 'preset', label: 'Preset', type: 'select', default: 'cycle', options: [
                { value: 'cycle', label: 'Następny preset' }, { value: '0', label: 'Flat' }, { value: '1', label: 'Bass Boost' },
                { value: '2', label: 'Focus' }, { value: '3', label: 'Smiley' }, { value: '4', label: 'Własny' },
            ] }],
            run: async (c) => { await gear('headset', { eqPreset: c.preset }); },
        },
        {
            id: 'open',
            name: 'Otwórz w Pitaya Gear',
            fields: [],
            run: async () => { await openGear('headset'); },
        },
    ],
};
