// Wtyczka „OBS Studio” — protokół obs-websocket 5 (wbudowany w OBS od wersji 28).
// W OBS: Narzędzia → Ustawienia serwera WebSocket → włącz serwer, skopiuj hasło.
const crypto = require('crypto');
const WebSocket = require('ws');

let ws = null;
let ctxRef = null;
let identified = false;
let reconnectTimer = null;
let pending = new Map();
let seq = 0;
let stopped = false;

const sha256b64 = (s) => crypto.createHash('sha256').update(s).digest('base64');

function setState(patch) {
    for (const [k, v] of Object.entries(patch)) ctxRef.setVariable(k, v);
}

function connect() {
    clearTimeout(reconnectTimer);
    if (stopped || !ctxRef) return;
    const { url = 'ws://127.0.0.1:4455', password = '' } = ctxRef.settings;
    try { if (ws) ws.terminate(); } catch {}
    identified = false;
    ws = new WebSocket(url, 'obswebsocket.json', { handshakeTimeout: 4000 });
    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }
        if (msg.op === 0) {
            // Hello → Identify (z hasłem, jeśli OBS go wymaga)
            const d = { rpcVersion: 1, eventSubscriptions: (1 << 0) | (1 << 2) | (1 << 3) | (1 << 6) | (1 << 7) };
            if (msg.d.authentication) {
                const { challenge, salt } = msg.d.authentication;
                d.authentication = sha256b64(sha256b64(password + salt) + challenge);
            }
            ws.send(JSON.stringify({ op: 1, d }));
        } else if (msg.op === 2) {
            identified = true;
            setState({ connected: true });
            refresh().catch(() => {});
        } else if (msg.op === 7) {
            const p = pending.get(msg.d.requestId);
            if (!p) return;
            pending.delete(msg.d.requestId);
            clearTimeout(p.timer);
            if (msg.d.requestStatus.result) p.resolve(msg.d.responseData || {});
            else p.reject(new Error(msg.d.requestStatus.comment || `OBS: błąd ${msg.d.requestStatus.code}`));
        } else if (msg.op === 5) {
            onEvent(msg.d.eventType, msg.d.eventData || {});
        }
    });
    ws.on('close', (code) => {
        identified = false;
        setState({ connected: false });
        for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Rozłączono z OBS')); }
        pending.clear();
        if (code === 4009) ctxRef.log('OBS odrzucił hasło');
        if (!stopped) reconnectTimer = setTimeout(connect, 5000);
    });
    ws.on('error', () => {});
}

function onEvent(type, d) {
    if (type === 'CurrentProgramSceneChanged') setState({ scene: d.sceneName });
    else if (type === 'StreamStateChanged') setState({ streaming: Boolean(d.outputActive) });
    else if (type === 'RecordStateChanged') setState({ recording: Boolean(d.outputActive), recordPaused: d.outputState === 'OBS_WEBSOCKET_OUTPUT_PAUSED' });
    else if (type === 'ReplayBufferStateChanged') setState({ replayBuffer: Boolean(d.outputActive) });
    else if (type === 'InputMuteStateChanged') ctxRef.setVariable(`muted.${d.inputName}`, Boolean(d.inputMuted));
    else if (type === 'ExitStarted') setState({ connected: false });
}

function call(requestType, requestData = {}) {
    if (!ws || !identified) return Promise.reject(new Error('Brak połączenia z OBS — włącz serwer WebSocket w OBS i sprawdź ustawienia wtyczki'));
    const requestId = `pd${++seq}`;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('OBS nie odpowiedział')); }, 8000);
        pending.set(requestId, { resolve, reject, timer });
        ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
    });
}

async function refresh() {
    const scene = await call('GetCurrentProgramScene');
    const stream = await call('GetStreamStatus').catch(() => ({}));
    const record = await call('GetRecordStatus').catch(() => ({}));
    const replay = await call('GetReplayBufferStatus').catch(() => ({}));
    setState({
        scene: scene.currentProgramSceneName || scene.sceneName || '',
        streaming: Boolean(stream.outputActive),
        recording: Boolean(record.outputActive),
        recordPaused: Boolean(record.outputPaused),
        replayBuffer: Boolean(replay.outputActive),
    });
    const inputs = await call('GetInputList').catch(() => ({ inputs: [] }));
    for (const i of inputs.inputs || []) {
        const m = await call('GetInputMute', { inputName: i.inputName }).catch(() => null);
        if (m) ctxRef.setVariable(`muted.${i.inputName}`, Boolean(m.inputMuted));
    }
}

const sceneOptions = async () => ((await call('GetSceneList')).scenes || []).reverse().map((s) => ({ value: s.sceneName, label: s.sceneName }));
const modeField = (labels) => ({ key: 'mode', label: 'Co zrobić', type: 'select', default: 'toggle', options: labels });

module.exports = {
    id: 'obs',
    name: 'OBS Studio',
    description: 'Sceny, transmisja, nagrywanie, powtórki i źródła dźwięku.',
    settings: [
        { key: 'url', label: 'Adres serwera WebSocket', type: 'text', default: 'ws://127.0.0.1:4455' },
        { key: 'password', label: 'Hasło (OBS → Narzędzia → Ustawienia serwera WebSocket)', type: 'password', default: '' },
    ],
    variables: [
        { id: 'connected', label: 'Połączono z OBS' },
        { id: 'scene', label: 'Aktualna scena' },
        { id: 'streaming', label: 'Transmisja trwa' },
        { id: 'recording', label: 'Nagrywanie trwa' },
        { id: 'recordPaused', label: 'Nagrywanie wstrzymane' },
        { id: 'replayBuffer', label: 'Bufor powtórek włączony' },
    ],
    start: async (ctx) => { ctxRef = ctx; stopped = false; setState({ connected: false }); connect(); },
    settingsChanged: async (ctx) => { ctxRef = ctx; connect(); },
    stop: async () => { stopped = true; clearTimeout(reconnectTimer); try { if (ws) ws.close(); } catch {} },
    actions: [
        {
            id: 'scene',
            name: 'Przełącz scenę',
            fields: [{ key: 'scene', label: 'Scena', type: 'select', options: sceneOptions }],
            run: async (c) => call('SetCurrentProgramScene', { sceneName: c.scene }),
        },
        {
            id: 'stream',
            name: 'Transmisja',
            fields: [modeField([{ value: 'toggle', label: 'Włącz / wyłącz' }, { value: 'start', label: 'Rozpocznij' }, { value: 'stop', label: 'Zakończ' }])],
            run: async (c) => call({ toggle: 'ToggleStream', start: 'StartStream', stop: 'StopStream' }[c.mode]),
        },
        {
            id: 'record',
            name: 'Nagrywanie',
            fields: [modeField([{ value: 'toggle', label: 'Włącz / wyłącz' }, { value: 'start', label: 'Rozpocznij' }, { value: 'stop', label: 'Zakończ' }, { value: 'pause', label: 'Pauza / wznów' }])],
            run: async (c) => call({ toggle: 'ToggleRecord', start: 'StartRecord', stop: 'StopRecord', pause: 'ToggleRecordPause' }[c.mode]),
        },
        {
            id: 'replay',
            name: 'Powtórka (bufor)',
            fields: [modeField([{ value: 'save', label: 'Zapisz powtórkę' }, { value: 'toggle', label: 'Włącz / wyłącz bufor' }])],
            run: async (c) => call(c.mode === 'save' ? 'SaveReplayBuffer' : 'ToggleReplayBuffer'),
        },
        {
            id: 'mute',
            name: 'Wycisz źródło dźwięku',
            fields: [
                { key: 'input', label: 'Źródło', type: 'select', options: async () => ((await call('GetInputList')).inputs || []).map((i) => ({ value: i.inputName, label: i.inputName })) },
                modeField([{ value: 'toggle', label: 'Wycisz / włącz' }, { value: 'mute', label: 'Wycisz' }, { value: 'unmute', label: 'Włącz' }]),
            ],
            run: async (c) => (c.mode === 'toggle'
                ? call('ToggleInputMute', { inputName: c.input })
                : call('SetInputMute', { inputName: c.input, inputMuted: c.mode === 'mute' })),
        },
        {
            id: 'source',
            name: 'Pokaż / ukryj źródło w scenie',
            fields: [
                { key: 'item', label: 'Scena › źródło', type: 'select', options: async () => {
                    const out = [];
                    for (const s of await sceneOptions()) {
                        const items = await call('GetSceneItemList', { sceneName: s.value }).catch(() => ({ sceneItems: [] }));
                        for (const it of items.sceneItems || []) out.push({ value: `${s.value}\u0000${it.sceneItemId}`, label: `${s.value} › ${it.sourceName}` });
                    }
                    return out;
                } },
                modeField([{ value: 'toggle', label: 'Przełącz' }, { value: 'show', label: 'Pokaż' }, { value: 'hide', label: 'Ukryj' }]),
            ],
            run: async (c) => {
                const [sceneName, id] = String(c.item || '').split('\u0000');
                const sceneItemId = parseInt(id, 10);
                if (!sceneName || !sceneItemId) throw new Error('Wybierz źródło');
                let enabled = c.mode === 'show';
                if (c.mode === 'toggle') enabled = !(await call('GetSceneItemEnabled', { sceneName, sceneItemId })).sceneItemEnabled;
                await call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: enabled });
            },
        },
        {
            id: 'virtualcam',
            name: 'Wirtualna kamera',
            run: async () => call('ToggleVirtualCam'),
        },
    ],
};
