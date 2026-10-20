// Wtyczka „Discord” — Discord RPC przez lokalne gniazdo aplikacji Discord (discord-ipc-N).
// Discord daje uprawnienia głosowe RPC tylko aplikacjom, których jesteś właścicielem, dlatego potrzebna jest
// własna aplikacja z discord.com/developers (Client ID + Client Secret). Bez niej działają skróty klawiszowe.
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const SCOPES = ['rpc', 'rpc.voice.read', 'rpc.voice.write', 'identify'];

let ctxRef = null;
let sock = null;
let buffer = Buffer.alloc(0);
let ready = false;
let authed = false;
let stopped = true;
let reconnectTimer = null;
let pending = new Map();
let me = null;
let channelId = null;
let speakingSub = null;

const settingsOf = () => ctxRef.settings;
const hasApp = () => /^\d{15,22}$/.test(String(settingsOf().clientId || '').trim()) && String(settingsOf().clientSecret || '').trim().length >= 20;
const set = (patch) => { for (const [k, v] of Object.entries(patch)) ctxRef.setVariable(k, v); };

// Gdzie Discord (także Flatpak, Snap, Vesktop) wystawia gniazdo IPC
function socketPaths() {
    if (process.platform === 'win32') return Array.from({ length: 10 }, (_, i) => `\\\\?\\pipe\\discord-ipc-${i}`);
    const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || os.tmpdir();
    const dirs = [base, path.join(base, 'app', 'com.discordapp.Discord'), path.join(base, 'app', 'com.discordapp.DiscordCanary'),
        path.join(base, 'app', 'dev.vencord.Vesktop'), path.join(base, '.flatpak', 'dev.vencord.Vesktop', 'xdg-run'), path.join(base, 'snap.discord'), '/tmp'];
    const out = [];
    for (const d of dirs) for (let i = 0; i < 10; i++) { const p = path.join(d, `discord-ipc-${i}`); if (fs.existsSync(p)) out.push(p); }
    return out;
}

function send(op, payload) {
    const json = Buffer.from(JSON.stringify(payload));
    const head = Buffer.alloc(8);
    head.writeInt32LE(op, 0);
    head.writeInt32LE(json.length, 4);
    sock.write(Buffer.concat([head, json]));
}
function rpc(cmd, args = {}, evt) {
    if (!sock || !ready) return Promise.reject(new Error('Discord nie jest połączony — uruchom aplikację Discord'));
    const nonce = crypto.randomUUID();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(nonce); reject(new Error('Discord nie odpowiedział')); }, cmd === 'AUTHORIZE' ? 120000 : 8000);
        pending.set(nonce, { resolve, reject, timer });
        send(1, { cmd, args, evt, nonce });
    });
}
const subscribe = (evt, args = {}) => rpc('SUBSCRIBE', args, evt).catch((err) => ctxRef.log('Subskrypcja', evt, err.message));

function onFrame(op, msg) {
    if (op === 2) { ctxRef.log('Discord zamknął połączenie:', msg.message); return; }
    if (op === 3) { send(4, msg); return; }
    if (msg.cmd === 'DISPATCH' && msg.evt === 'READY') { ready = true; onReady(msg.data).catch((e) => ctxRef.log(e.message)); return; }
    if (msg.nonce && pending.has(msg.nonce)) {
        const p = pending.get(msg.nonce);
        pending.delete(msg.nonce);
        clearTimeout(p.timer);
        if (msg.evt === 'ERROR') p.reject(new Error(`Discord: ${msg.data && msg.data.message}`));
        else p.resolve(msg.data);
        return;
    }
    if (msg.cmd === 'DISPATCH') onEvent(msg.evt, msg.data || {});
}

function connect() {
    clearTimeout(reconnectTimer);
    if (stopped || !hasApp()) return;
    const paths = socketPaths();
    if (!paths.length) { status('Discord nie jest uruchomiony', false); reconnectTimer = setTimeout(connect, 10000); return; }
    const tryPath = (i) => {
        if (i >= paths.length) { status('Nie udało się połączyć z Discordem', false); reconnectTimer = setTimeout(connect, 10000); return; }
        const s = net.createConnection(paths[i]);
        s.once('error', () => { s.destroy(); tryPath(i + 1); });
        s.once('connect', () => {
            sock = s;
            buffer = Buffer.alloc(0);
            s.removeAllListeners('error');
            s.on('error', () => {});
            s.on('data', (chunk) => {
                buffer = Buffer.concat([buffer, chunk]);
                while (buffer.length >= 8) {
                    const op = buffer.readInt32LE(0), len = buffer.readInt32LE(4);
                    if (buffer.length < 8 + len) break;
                    let msg = {};
                    try { msg = JSON.parse(buffer.slice(8, 8 + len).toString()); } catch {}
                    buffer = buffer.slice(8 + len);
                    onFrame(op, msg);
                }
            });
            s.on('close', () => {
                if (sock !== s) return;   // stare połączenie zamknięte przy ponownym łączeniu
                ready = false; authed = false; sock = null; channelId = null;
                for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Rozłączono z Discordem')); }
                pending.clear();
                set({ connected: false, inVoice: false, channel: '', server: '', speaking: false });
                if (!stopped && (settingsOf().accessToken || settingsOf().allowPrompt)) { status('Discord rozłączony — ponawiam…', false); reconnectTimer = setTimeout(connect, 5000); }
            });
            send(0, { v: 1, client_id: String(settingsOf().clientId).trim() });
        });
    };
    tryPath(0);
}

async function tokenRequest(params) {
    const s = settingsOf();
    const res = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: String(s.clientId).trim(), client_secret: String(s.clientSecret).trim(), ...params }).toString(),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error_description || body.error || `Discord: błąd ${res.status}`);
    ctxRef.saveSettings({ accessToken: body.access_token, refreshToken: body.refresh_token || settingsOf().refreshToken, expiresAt: Date.now() + (body.expires_in || 604800) * 1000 - 3600000 });
    return body.access_token;
}

// Po READY: logowanie (pierwszy raz Discord pokaże okno „Autoryzuj”), potem subskrypcje i stan
async function onReady() {
    const s = settingsOf();
    let token = s.accessToken;
    if (token && s.expiresAt < Date.now() && s.refreshToken) token = await tokenRequest({ grant_type: 'refresh_token', refresh_token: s.refreshToken }).catch(() => null);
    let auth = token ? await rpc('AUTHENTICATE', { access_token: token }).catch(() => null) : null;
    if (!auth) {
        if (!s.allowPrompt) { status('Kliknij „Połącz z Discordem” i zatwierdź w oknie Discorda', false); return; }
        status('Zatwierdź dostęp w oknie Discorda…', false);
        const { code } = await rpc('AUTHORIZE', { client_id: String(s.clientId).trim(), scopes: SCOPES });
        token = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: s.redirectUri || 'http://127.0.0.1' });
        auth = await rpc('AUTHENTICATE', { access_token: token });
        ctxRef.saveSettings({ allowPrompt: false });
    }
    authed = true;
    me = auth.user;
    set({ connected: true, user: me.global_name || me.username });
    status(`Połączono jako ${me.global_name || me.username}`, true);
    await subscribe('VOICE_SETTINGS_UPDATE');
    await subscribe('VOICE_CHANNEL_SELECT');
    await subscribe('VOICE_CONNECTION_STATUS');
    applySettings(await rpc('GET_VOICE_SETTINGS'));
    await refreshChannel();
}

function applySettings(v) {
    if (!v) return;
    set({
        muted: Boolean(v.mute || v.deaf), deafened: Boolean(v.deaf), selfMuted: Boolean(v.mute), selfDeafened: Boolean(v.deaf),
        inputVolume: Math.round(v.input ? v.input.volume : 0), outputVolume: Math.round(v.output ? v.output.volume : 0),
        voiceMode: v.mode && v.mode.type === 'PUSH_TO_TALK' ? 'ptt' : 'vad', pushToTalk: Boolean(v.mode && v.mode.type === 'PUSH_TO_TALK'),
        noiseSuppression: Boolean(v.noise_suppression), echoCancellation: Boolean(v.echo_cancellation), autoGain: Boolean(v.automatic_gain_control),
    });
}

async function refreshChannel() {
    const ch = await rpc('GET_SELECTED_VOICE_CHANNEL').catch(() => null);
    await setChannel(ch);
}
async function setChannel(ch) {
    if (speakingSub && speakingSub !== (ch && ch.id)) {
        rpc('UNSUBSCRIBE', { channel_id: speakingSub }, 'SPEAKING_START').catch(() => {});
        rpc('UNSUBSCRIBE', { channel_id: speakingSub }, 'SPEAKING_STOP').catch(() => {});
        speakingSub = null;
    }
    channelId = ch ? ch.id : null;
    if (!ch) { set({ inVoice: false, channel: '', server: '', serverMuted: false, serverDeafened: false, speaking: false, members: 0 }); return; }
    let guild = '';
    if (ch.guild_id) guild = ((await rpc('GET_GUILD', { guild_id: ch.guild_id }).catch(() => null)) || {}).name || '';
    const mine = (ch.voice_states || []).find((x) => x.user && me && x.user.id === me.id);
    set({
        inVoice: true, channel: ch.name || 'Rozmowa prywatna', server: guild, members: (ch.voice_states || []).length,
        serverMuted: Boolean(mine && mine.voice_state && mine.voice_state.mute), serverDeafened: Boolean(mine && mine.voice_state && mine.voice_state.deaf),
    });
    if (speakingSub !== ch.id) {
        speakingSub = ch.id;
        await subscribe('SPEAKING_START', { channel_id: ch.id });
        await subscribe('SPEAKING_STOP', { channel_id: ch.id });
    }
}

function onEvent(evt, d) {
    if (evt === 'VOICE_SETTINGS_UPDATE') applySettings(d);
    else if (evt === 'VOICE_CHANNEL_SELECT') refreshChannel().catch(() => {});
    else if (evt === 'VOICE_CONNECTION_STATUS') set({ voiceState: String(d.state || '').toLowerCase(), ping: Math.round(d.last_ping || d.average_ping || 0) });
    else if ((evt === 'SPEAKING_START' || evt === 'SPEAKING_STOP') && me && d.user_id === me.id) set({ speaking: evt === 'SPEAKING_START' });
}

function status(text, ok) { ctxRef.setStatus(text, ok); }
function needRpc() {
    if (!authed) throw new Error(hasApp() ? 'Discord nie jest połączony — uruchom Discorda i kliknij „Połącz z Discordem” w ustawieniach wtyczki' : 'Ta akcja wymaga połączenia z Discordem (Ustawienia → Wtyczki → Discord)');
}
const v = (name) => ctxRef.getVariable(`discord.${name}`);
const toggleField = (labels = ['Przełącz', 'Włącz', 'Wyłącz']) => ({ key: 'mode', label: 'Co zrobić', type: 'select', default: 'toggle', options: [{ value: 'toggle', label: labels[0] }, { value: 'on', label: labels[1] }, { value: 'off', label: labels[2] }] });
const pick = (mode, current) => (mode === 'toggle' ? !current : mode === 'on');
const volumeFields = (max) => [
    { key: 'mode', label: 'Co zrobić', type: 'select', default: 'set', options: [{ value: 'set', label: 'Ustaw' }, { value: 'up', label: 'Głośniej' }, { value: 'down', label: 'Ciszej' }] },
    { key: 'value', label: `Wartość (0–${max})`, type: 'number', default: max === 200 ? 100 : 100, help: 'Na suwaku wpisz {value}' },
];
const calcVolume = (c, now, max) => Math.max(0, Math.min(max, Math.round(c.mode === 'set' ? Number(c.value) : now + (c.mode === 'up' ? 1 : -1) * Number(c.value || 10))));

module.exports = {
    id: 'discord',
    name: 'Discord',
    description: 'Wyciszenie, słuchawki, głośności, kanały głosowe, tryb mówienia i status mówienia.',
    settings: [
        { key: 'guide', type: 'info', label: 'Pełne sterowanie (stan wyciszenia, głośności, kanały) wymaga własnej aplikacji Discord. Bez niej działają tylko „Wycisz” i „Wyłącz dźwięk” przez skróty klawiszowe.', help: 'discord.com/developers/applications → New Application → OAuth2: skopiuj Client ID i Client Secret, dodaj Redirect „http://127.0.0.1” → zapisz → wklej tutaj → Połącz z Discordem → zatwierdź w Discordzie.' },
        { key: 'clientId', label: 'Client ID', type: 'text', default: '' },
        { key: 'clientSecret', label: 'Client Secret', type: 'password', default: '' },
        { key: 'connect', type: 'button', label: 'Połącz z Discordem' },
        { key: 'disconnect', type: 'button', label: 'Rozłącz' },
        { key: 'muteKey', label: 'Zapas bez aplikacji: skrót „Przełącz wyciszenie” w Discordzie', type: 'text', default: 'ctrl+shift+f9' },
        { key: 'deafenKey', label: 'Zapas bez aplikacji: skrót „Przełącz wyłączenie dźwięku”', type: 'text', default: 'ctrl+shift+f10' },
    ],
    variables: [
        { id: 'connected', label: 'Połączono z Discordem' },
        { id: 'user', label: 'Nazwa użytkownika' },
        { id: 'muted', label: 'Mikrofon wyciszony' },
        { id: 'deafened', label: 'Dźwięk wyłączony' },
        { id: 'selfMuted', label: 'Wyciszony przez siebie' },
        { id: 'selfDeafened', label: 'Dźwięk wyłączony przez siebie' },
        { id: 'serverMuted', label: 'Wyciszony przez serwer' },
        { id: 'serverDeafened', label: 'Dźwięk wyłączony przez serwer' },
        { id: 'speaking', label: 'Mówisz' },
        { id: 'inVoice', label: 'Na kanale głosowym' },
        { id: 'channel', label: 'Kanał głosowy' },
        { id: 'server', label: 'Serwer' },
        { id: 'members', label: 'Osób na kanale' },
        { id: 'voiceState', label: 'Stan połączenia głosowego' },
        { id: 'ping', label: 'Ping głosu (ms)' },
        { id: 'inputVolume', label: 'Głośność mikrofonu (0–100)' },
        { id: 'outputVolume', label: 'Głośność dźwięku (0–200)' },
        { id: 'voiceMode', label: 'Tryb mikrofonu (vad / ptt)' },
        { id: 'pushToTalk', label: 'Naciśnij, aby mówić' },
        { id: 'noiseSuppression', label: 'Tłumienie szumów' },
        { id: 'echoCancellation', label: 'Usuwanie echa' },
        { id: 'autoGain', label: 'Automatyczne wzmocnienie' },
    ],
    start: async (ctx) => {
        ctxRef = ctx;
        stopped = false;
        set({ connected: false, muted: false, deafened: false, inVoice: false, speaking: false });
        if (hasApp() && (settingsOf().accessToken || settingsOf().allowPrompt)) connect();
        else status(hasApp() ? 'Kliknij „Połącz z Discordem”' : 'Tryb skrótów klawiszowych (bez aplikacji Discord)', false);
    },
    settingsChanged: async (ctx) => { ctxRef = ctx; },
    stop: async () => { stopped = true; clearTimeout(reconnectTimer); try { if (sock) sock.destroy(); } catch {} },
    commands: {
        connect: async (ctx) => {
            ctxRef = ctx;
            if (!hasApp()) throw new Error('Wklej Client ID i Client Secret swojej aplikacji z discord.com/developers');
            ctx.saveSettings({ allowPrompt: true });
            stopped = false;
            const old = sock; sock = null; ready = false; authed = false;
            try { if (old) old.destroy(); } catch {}
            connect();
            return 'Łączenie z Discordem — zatwierdź dostęp w oknie Discorda';
        },
        disconnect: async (ctx) => {
            ctxRef = ctx;
            ctx.saveSettings({ accessToken: '', refreshToken: '', expiresAt: 0, allowPrompt: false });
            clearTimeout(reconnectTimer);
            const s = sock; sock = null; ready = false; authed = false;
            try { if (s) s.destroy(); } catch {}
            set({ connected: false, inVoice: false, channel: '', server: '' });
            status('Rozłączono — tryb skrótów klawiszowych', false);
            return 'Rozłączono z Discordem';
        },
    },
    actions: [
        {
            id: 'mute',
            name: 'Wycisz mikrofon',
            fields: [toggleField(['Przełącz', 'Wycisz', 'Włącz mikrofon'])],
            run: async (c, ctx) => {
                ctxRef = ctx;
                if (!authed) {
                    await ctx.platform.pressCombo(ctx.settings.muteKey);
                    set({ muted: !v('muted') });
                    return;
                }
                await rpc('SET_VOICE_SETTINGS', { mute: pick(c.mode || 'toggle', v('selfMuted')) });
            },
        },
        {
            id: 'deafen',
            name: 'Wyłącz dźwięk (słuchawki)',
            fields: [toggleField(['Przełącz', 'Wyłącz dźwięk', 'Włącz dźwięk'])],
            run: async (c, ctx) => {
                ctxRef = ctx;
                if (!authed) {
                    await ctx.platform.pressCombo(ctx.settings.deafenKey);
                    const d = !v('deafened');
                    set({ deafened: d, muted: d || v('muted') });
                    return;
                }
                await rpc('SET_VOICE_SETTINGS', { deaf: pick(c.mode || 'toggle', v('selfDeafened')) });
            },
        },
        {
            id: 'input-volume',
            name: 'Głośność mikrofonu',
            fields: volumeFields(100),
            run: async (c, ctx) => { ctxRef = ctx; needRpc(); await rpc('SET_VOICE_SETTINGS', { input: { volume: calcVolume(c, v('inputVolume') || 0, 100) } }); },
        },
        {
            id: 'output-volume',
            name: 'Głośność dźwięku',
            fields: volumeFields(200),
            run: async (c, ctx) => { ctxRef = ctx; needRpc(); await rpc('SET_VOICE_SETTINGS', { output: { volume: calcVolume(c, v('outputVolume') || 0, 200) } }); },
        },
        {
            id: 'voice-mode',
            name: 'Tryb mikrofonu',
            fields: [{ key: 'mode', label: 'Tryb', type: 'select', default: 'toggle', options: [{ value: 'toggle', label: 'Przełącz' }, { value: 'vad', label: 'Aktywność głosowa' }, { value: 'ptt', label: 'Naciśnij, aby mówić' }] }],
            run: async (c, ctx) => {
                ctxRef = ctx; needRpc();
                const ptt = c.mode === 'toggle' ? !v('pushToTalk') : c.mode === 'ptt';
                await rpc('SET_VOICE_SETTINGS', { mode: { type: ptt ? 'PUSH_TO_TALK' : 'VOICE_ACTIVITY' } });
            },
        },
        {
            id: 'audio-setting',
            name: 'Ustawienia dźwięku',
            description: 'Tłumienie szumów, usuwanie echa, automatyczne wzmocnienie',
            fields: [
                { key: 'setting', label: 'Ustawienie', type: 'select', default: 'noise_suppression', options: [{ value: 'noise_suppression', label: 'Tłumienie szumów' }, { value: 'echo_cancellation', label: 'Usuwanie echa' }, { value: 'automatic_gain_control', label: 'Automatyczne wzmocnienie' }] },
                toggleField(),
            ],
            run: async (c, ctx) => {
                ctxRef = ctx; needRpc();
                const now = { noise_suppression: v('noiseSuppression'), echo_cancellation: v('echoCancellation'), automatic_gain_control: v('autoGain') }[c.setting];
                await rpc('SET_VOICE_SETTINGS', { [c.setting]: pick(c.mode, now) });
            },
        },
        {
            id: 'join',
            name: 'Dołącz do kanału głosowego',
            fields: [{ key: 'channel', label: 'Kanał', type: 'select', options: async (ctx) => {
                ctxRef = ctx;
                if (!authed) return [{ value: '', label: 'Najpierw połącz się z Discordem' }];
                const { guilds = [] } = (await rpc('GET_GUILDS')) || {};
                const out = [];
                for (const g of guilds) {
                    const { channels = [] } = (await rpc('GET_CHANNELS', { guild_id: g.id }).catch(() => ({}))) || {};
                    for (const ch of channels) if (ch.type === 2 || ch.type === 13) out.push({ value: ch.id, label: `${g.name} › ${ch.name}` });
                }
                return out;
            } }],
            run: async (c, ctx) => { ctxRef = ctx; needRpc(); if (!c.channel) throw new Error('Wybierz kanał'); await rpc('SELECT_VOICE_CHANNEL', { channel_id: c.channel, force: true }); },
        },
        {
            id: 'leave',
            name: 'Rozłącz z kanału głosowego',
            run: async (c, ctx) => { ctxRef = ctx; needRpc(); await rpc('SELECT_VOICE_CHANNEL', { channel_id: null }); },
        },
    ],
};
