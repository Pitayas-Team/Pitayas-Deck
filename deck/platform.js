// ═══════ PITAYA DECK — OBSŁUGA SYSTEMU ═══════
// Klawiatura, multimedia, głośność, mikrofon, dźwięki i uruchamianie programów.
// Linux: wirtualna klawiatura /dev/uinput (pomocnik w Pythonie) → ydotool → xdotool → wtype,
//        odtwarzacze przez MPRIS (gdbus), głośność przez wpctl (PipeWire) albo pactl.
// Windows: PowerShell (SendKeys, klawisze multimedialne, odtwarzanie dźwięków).
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const isWin = process.platform === 'win32';

function which(cmd) {
    for (const dir of (process.env.PATH || '').split(path.delimiter)) {
        const p = path.join(dir, cmd + (isWin ? '.exe' : ''));
        try { if (fs.statSync(p).isFile()) return p; } catch {}
    }
    return null;
}

function exec(cmd, args, { timeout = 8000, input } = {}) {
    return new Promise((resolve, reject) => {
        const child = execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) return reject(new Error((stderr || err.message).toString().trim().split('\n').pop()));
            resolve(stdout.toString());
        });
        if (input !== undefined) { child.stdin.end(input); }
    });
}

function powershell(script) {
    return exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { timeout: 15000 });
}

function createPlatform({ clipboard, shell, log = () => {} }) {
    // ───── Klawiatura ─────
    let uinput = null;          // { proc, queue }
    let backend = null;         // 'uinput' | 'ydotool' | 'xdotool' | 'wtype' | 'windows' | null

    function startUinput() {
        return new Promise((resolve) => {
            const helper = path.join(__dirname, 'helpers', 'uinput-keyboard.py').replace('app.asar', 'app.asar.unpacked');
            if (!which('python3') || !fs.existsSync(helper)) return resolve(false);
            try { fs.accessSync('/dev/uinput', fs.constants.W_OK); } catch { return resolve(false); }
            const proc = spawn('python3', [helper], { stdio: ['pipe', 'pipe', 'pipe'] });
            const queue = [];
            let buf = '';
            let ready = false;
            proc.stdout.on('data', (d) => {
                buf += d.toString();
                let i;
                while ((i = buf.indexOf('\n')) >= 0) {
                    const line = buf.slice(0, i).trim();
                    buf = buf.slice(i + 1);
                    if (!ready) {
                        ready = line === 'ready';
                        if (!ready) log('Klawiatura uinput:', line);
                        resolve(ready);
                        continue;
                    }
                    const job = queue.shift();
                    if (job) line === 'ok' ? job.resolve() : job.reject(new Error(line.replace(/^error: /, '')));
                }
            });
            proc.on('exit', () => {
                if (!ready) resolve(false);
                for (const job of queue.splice(0)) job.reject(new Error('Wirtualna klawiatura została zamknięta'));
                if (uinput && uinput.proc === proc) { uinput = null; backend = null; }
            });
            proc.on('error', () => resolve(false));
            uinput = { proc, queue };
        });
    }

    async function keyboardBackend() {
        if (backend) return backend;
        if (isWin) return (backend = 'windows');
        if (await startUinput()) return (backend = 'uinput');
        uinput = null;
        if (which('ydotool')) return (backend = 'ydotool');
        if (process.env.XDG_SESSION_TYPE !== 'wayland' && which('xdotool')) return (backend = 'xdotool');
        if (which('wtype')) return (backend = 'wtype');
        if (which('xdotool')) return (backend = 'xdotool');
        throw new Error('Brak dostępu do klawiatury: zainstaluj ydotool (Wayland) albo xdotool (X11), albo daj prawo zapisu do /dev/uinput.');
    }

    // Nazwy klawiszy jak w polu „Skrót”: ctrl+shift+m, alt+f4, super, playpause…
    function parseCombo(text) {
        return String(text || '').toLowerCase().split('+').map((k) => k.trim()).filter(Boolean);
    }

    const WIN_SENDKEYS = { ctrl: '^', control: '^', shift: '+', alt: '%' };
    const WIN_NAMED = {
        enter: '{ENTER}', return: '{ENTER}', esc: '{ESC}', escape: '{ESC}', tab: '{TAB}', space: ' ', backspace: '{BACKSPACE}',
        delete: '{DELETE}', del: '{DELETE}', insert: '{INSERT}', home: '{HOME}', end: '{END}', pageup: '{PGUP}', pagedown: '{PGDN}',
        up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}', printscreen: '{PRTSC}',
    };
    const WIN_VK = { volumeup: 0xAF, volumedown: 0xAE, mute: 0xAD, playpause: 0xB3, 'play-pause': 0xB3, next: 0xB0, nextsong: 0xB0, previous: 0xB1, prev: 0xB1, previoussong: 0xB1, stop: 0xB2, stopcd: 0xB2, super: 0x5B, win: 0x5B, meta: 0x5B };
    // Klawisze wirtualne Windows (multimedia, Win) przez keybd_event
    function winKeybd(vks) {
        const sig = '[DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, System.UIntPtr e);';
        const down = vks.map((v) => `[W.K]::keybd_event(${v}, 0, 0, [UIntPtr]::Zero)`);
        const up = [...vks].reverse().map((v) => `[W.K]::keybd_event(${v}, 0, 2, [UIntPtr]::Zero)`);
        return powershell(`Add-Type -Name K -Namespace W -MemberDefinition '${sig}'; ${[...down, ...up].join('; ')}`);
    }

    async function pressCombo(combo) {
        const keys = Array.isArray(combo) ? combo : parseCombo(combo);
        if (!keys.length) throw new Error('Nie podano skrótu klawiszowego');
        const b = await keyboardBackend();
        if (b === 'uinput') {
            return new Promise((resolve, reject) => {
                uinput.queue.push({ resolve, reject });
                uinput.proc.stdin.write(JSON.stringify({ combo: keys }) + '\n');
            });
        }
        if (b === 'windows') {
            if (keys.some((k) => WIN_VK[k] && !['super', 'win', 'meta'].includes(k)) || keys.includes('super') || keys.includes('win')) {
                const VK_MOD = { ctrl: 0x11, control: 0x11, shift: 0x10, alt: 0x12 };
                const vks = keys.map((k) => WIN_VK[k] || VK_MOD[k] || (k.length === 1 ? k.toUpperCase().charCodeAt(0) : /^f\d+$/.test(k) ? 0x6F + parseInt(k.slice(1), 10) : null));
                if (vks.includes(null)) throw new Error(`Nieznany klawisz w „${keys.join('+')}”`);
                return winKeybd(vks);
            }
            const mods = keys.filter((k) => WIN_SENDKEYS[k]).map((k) => WIN_SENDKEYS[k]).join('');
            const main = keys.filter((k) => !WIN_SENDKEYS[k]).map((k) => WIN_NAMED[k] || (/^f\d+$/.test(k) ? `{${k.toUpperCase()}}` : k)).join('');
            return powershell(`(New-Object -ComObject WScript.Shell).SendKeys('${(mods + main).replace(/'/g, "''")}')`);
        }
        if (b === 'ydotool') return exec('ydotool', ['key', ...keys.map(ydotoolKey)]);
        if (b === 'xdotool') return exec('xdotool', ['key', keys.map(xKey).join('+')]);
        if (b === 'wtype') {
            const mods = keys.slice(0, -1).flatMap((m) => ['-M', m === 'super' ? 'logo' : m]);
            const last = keys[keys.length - 1];
            return exec('wtype', [...mods, '-k', xKey(last), ...keys.slice(0, -1).flatMap((m) => ['-m', m === 'super' ? 'logo' : m])]);
        }
    }
    function xKey(k) {
        const map = { ctrl: 'ctrl', shift: 'shift', alt: 'alt', super: 'super', win: 'super', meta: 'super', enter: 'Return', esc: 'Escape', escape: 'Escape', space: 'space', tab: 'Tab', backspace: 'BackSpace', delete: 'Delete', del: 'Delete', up: 'Up', down: 'Down', left: 'Left', right: 'Right', home: 'Home', end: 'End', pageup: 'Prior', pagedown: 'Next', printscreen: 'Print', playpause: 'XF86AudioPlay', 'play-pause': 'XF86AudioPlay', next: 'XF86AudioNext', previous: 'XF86AudioPrev', prev: 'XF86AudioPrev', stop: 'XF86AudioStop', volumeup: 'XF86AudioRaiseVolume', volumedown: 'XF86AudioLowerVolume', mute: 'XF86AudioMute', micmute: 'XF86AudioMicMute' };
        return map[k] || (/^f\d+$/.test(k) ? k.toUpperCase() : k);
    }
    // ydotool używa kodów linuksowych: 29:1 29:0 itd. — korzystamy z tej samej tabeli co pomocnik uinput
    let ydoCodes = null;
    function ydotoolKey(k) {
        if (!ydoCodes) {
            const src = fs.readFileSync(path.join(__dirname, 'helpers', 'uinput-keyboard.py'), 'utf8');
            ydoCodes = Object.fromEntries([...src.matchAll(/'([^']+)':\s*(\d+)/g)].map((m) => [m[1], +m[2]]));
        }
        const code = ydoCodes[k];
        if (code === undefined) throw new Error(`Nieznany klawisz „${k}”`);
        return `${code}:1 ${code}:0`;
    }

    // Tekst wpisujemy przez schowek (Ctrl+V) — działa z polskimi znakami i emoji
    async function typeText(text, { restore = true, paste = 'ctrl+v' } = {}) {
        const old = clipboard.readText();
        clipboard.writeText(String(text));
        await new Promise((r) => setTimeout(r, 60));
        await pressCombo(paste);
        if (restore) setTimeout(() => { try { clipboard.writeText(old); } catch {} }, 600);
    }

    // ───── Odtwarzacze (MPRIS) ─────
    async function mprisPlayers() {
        if (isWin || !which('gdbus')) return [];
        const out = await exec('gdbus', ['call', '--session', '--dest', 'org.freedesktop.DBus', '--object-path', '/org/freedesktop/DBus', '--method', 'org.freedesktop.DBus.ListNames']);
        return [...out.matchAll(/'(org\.mpris\.MediaPlayer2\.[^']+)'/g)].map((m) => m[1]);
    }
    const PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';
    function mprisGet(dest, prop) {
        return exec('gdbus', ['call', '--session', '--dest', dest, '--object-path', '/org/mpris/MediaPlayer2', '--method', 'org.freedesktop.DBus.Properties.Get', PLAYER_IFACE, prop], { timeout: 3000 });
    }
    function mprisSet(dest, prop, gvariant) {
        return exec('gdbus', ['call', '--session', '--dest', dest, '--object-path', '/org/mpris/MediaPlayer2', '--method', 'org.freedesktop.DBus.Properties.Set', PLAYER_IFACE, prop, gvariant], { timeout: 3000 });
    }
    function mprisCall(dest, method, ...args) {
        return exec('gdbus', ['call', '--session', '--dest', dest, '--object-path', '/org/mpris/MediaPlayer2', '--method', `${PLAYER_IFACE}.${method}`, ...args], { timeout: 4000 });
    }
    // Wybrany odtwarzacz ('spotify', 'firefox'…) albo aktywny: ten, który gra, inaczej pierwszy z listy
    async function findPlayer(prefer) {
        const players = await mprisPlayers();
        if (prefer) {
            const p = players.find((x) => x === prefer || x.replace('org.mpris.MediaPlayer2.', '').split('.')[0] === prefer);
            if (p) return p;
        }
        for (const p of players) {
            try { if (/Playing/.test(await mprisGet(p, 'PlaybackStatus'))) return p; } catch {}
        }
        return players[0] || null;
    }
    async function listPlayers() {
        const out = [];
        for (const p of await mprisPlayers()) {
            let name = p.replace('org.mpris.MediaPlayer2.', '');
            try {
                const id = await exec('gdbus', ['call', '--session', '--dest', p, '--object-path', '/org/mpris/MediaPlayer2', '--method', 'org.freedesktop.DBus.Properties.Get', 'org.mpris.MediaPlayer2', 'Identity'], { timeout: 2000 });
                name = (id.match(/'([^']+)'/) || [])[1] || name;
            } catch {}
            out.push({ value: p.replace('org.mpris.MediaPlayer2.', '').split('.')[0], label: name });
        }
        return out;
    }
    async function needPlayer(prefer) {
        const p = await findPlayer(prefer).catch(() => null);
        if (!p) throw new Error(prefer ? `Odtwarzacz „${prefer}” nie jest uruchomiony` : 'Nie znaleziono żadnego odtwarzacza (Spotify, przeglądarka, VLC…)');
        return p;
    }
    async function media(command, prefer) {
        const methods = { 'play-pause': 'PlayPause', play: 'Play', pause: 'Pause', next: 'Next', previous: 'Previous', stop: 'Stop' };
        if (!methods[command]) throw new Error(`Nieznane polecenie: ${command}`);
        const player = await findPlayer(prefer).catch(() => null);
        if (player) return mprisCall(player, methods[command]);
        if (prefer) throw new Error(`Odtwarzacz „${prefer}” nie jest uruchomiony`);
        // Bez MPRIS (Windows albo brak odtwarzacza) — klawisz multimedialny
        return pressCombo([{ 'play-pause': 'playpause', play: 'playpause', pause: 'playpause', next: 'next', previous: 'previous', stop: 'stop' }[command]]);
    }
    async function setShuffle(mode, prefer) {
        const p = await needPlayer(prefer);
        let on = mode === 'on';
        if (mode === 'toggle') on = !/true/.test(await mprisGet(p, 'Shuffle'));
        return mprisSet(p, 'Shuffle', `<${on}>`);
    }
    async function setLoop(mode, prefer) {
        const p = await needPlayer(prefer);
        const order = ['None', 'Playlist', 'Track'];
        let value = { off: 'None', none: 'None', playlist: 'Playlist', track: 'Track' }[mode];
        if (mode === 'cycle') {
            const cur = ((await mprisGet(p, 'LoopStatus')).match(/'(\w+)'/) || [])[1] || 'None';
            value = order[(order.indexOf(cur) + 1) % order.length];
        }
        if (!value) throw new Error(`Nieznany tryb powtarzania: ${mode}`);
        return mprisSet(p, 'LoopStatus', `<'${value}'>`);
    }
    // Link Spotify (https://open.spotify.com/playlist/…) albo spotify:playlist:… — odtwarzacz zaczyna grać
    async function openUri(uri, prefer) {
        let u = String(uri || '').trim();
        const m = u.match(/open\.spotify\.com\/(?:intl-\w+\/)?(playlist|album|track|artist|episode|show)\/([A-Za-z0-9]+)/);
        if (m) u = `spotify:${m[1]}:${m[2]}`;
        if (!u) throw new Error('Podaj link albo identyfikator');
        const p = await needPlayer(prefer || (u.startsWith('spotify:') ? 'spotify' : ''));
        return mprisCall(p, 'OpenUri', u);
    }
    async function seek(seconds, prefer) {
        const p = await needPlayer(prefer);
        return mprisCall(p, 'Seek', String(Math.round(seconds * 1e6)));
    }
    async function setPlayerVolume(value, prefer) {
        const p = await needPlayer(prefer);
        return mprisSet(p, 'Volume', `<${Math.max(0, Math.min(1, value / 100)).toFixed(2)}>`);
    }
    async function nowPlaying(prefer) {
        const player = await findPlayer(prefer).catch(() => null);
        const empty = { title: '', artist: '', album: '', artUrl: '', status: 'Stopped', player: '', length: 0, position: 0, shuffle: false, loop: 'None' };
        if (!player) return empty;
        let meta = '', status = '', pos = '', shuffle = '', loop = '', vol = '';
        try { vol = await mprisGet(player, 'Volume'); } catch {}
        try { meta = await mprisGet(player, 'Metadata'); } catch {}
        try { status = (await mprisGet(player, 'PlaybackStatus')).match(/'(\w+)'/)?.[1] || ''; } catch {}
        try { pos = await mprisGet(player, 'Position'); } catch {}
        try { shuffle = await mprisGet(player, 'Shuffle'); } catch {}
        try { loop = (await mprisGet(player, 'LoopStatus')).match(/'(\w+)'/)?.[1] || ''; } catch {}
        const str = (key) => {
            const m = meta.match(new RegExp(`'${key}':\\s*<\\[?'((?:[^'\\\\]|\\\\.)*)'`));
            return m ? m[1].replace(/\\'/g, "'") : '';
        };
        const num = (re, text) => { const m = (text || '').match(re); return m ? parseInt(m[1], 10) : 0; };
        return {
            ...empty,
            title: str('xesam:title'), url: str('xesam:url'), artist: str('xesam:artist'), album: str('xesam:album'), artUrl: str('mpris:artUrl'),
            status, player: player.replace('org.mpris.MediaPlayer2.', '').split('.')[0],
            length: Math.round(num(/'mpris:length':\s*<(?:uint64|int64)?\s*(\d+)>/, meta) / 1e6),
            position: Math.round(num(/(\d+)/, pos.replace(/^\(<(?:int64)?\s*/, '')) / 1e6),
            shuffle: /true/.test(shuffle), loop: loop || 'None',
            volume: (() => { const m = vol.match(/<(?:double\s*)?([\d.]+)>/); return m ? Math.round(parseFloat(m[1]) * 100) : null; })(),
        };
    }

    // ───── Głośność i mikrofon ─────
    const audio = which('wpctl') ? 'wpctl' : which('pactl') ? 'pactl' : isWin ? 'windows' : null;
    async function getVolume(kind = 'sink') {
        if (audio === 'wpctl') {
            const out = await exec('wpctl', ['get-volume', kind === 'sink' ? '@DEFAULT_AUDIO_SINK@' : '@DEFAULT_AUDIO_SOURCE@']);
            const m = out.match(/Volume:\s*([\d.]+)/);
            return { volume: m ? Math.round(parseFloat(m[1]) * 100) : 0, muted: /MUTED/.test(out) };
        }
        if (audio === 'pactl') {
            const dev = kind === 'sink' ? '@DEFAULT_SINK@' : '@DEFAULT_SOURCE@';
            const v = await exec('pactl', [kind === 'sink' ? 'get-sink-volume' : 'get-source-volume', dev]);
            const mu = await exec('pactl', [kind === 'sink' ? 'get-sink-mute' : 'get-source-mute', dev]);
            return { volume: parseInt((v.match(/(\d+)%/) || [])[1] || '0', 10), muted: /yes/.test(mu) };
        }
        return { volume: null, muted: null };
    }
    async function setVolume(mode, step = 5, value) {
        if (audio === 'wpctl') {
            const dev = '@DEFAULT_AUDIO_SINK@';
            if (mode === 'up') return exec('wpctl', ['set-volume', '-l', '1.0', dev, `${step}%+`]);
            if (mode === 'down') return exec('wpctl', ['set-volume', dev, `${step}%-`]);
            if (mode === 'set') return exec('wpctl', ['set-volume', '-l', '1.0', dev, `${Math.max(0, Math.min(100, value))}%`]);
            if (mode === 'mute') return exec('wpctl', ['set-mute', dev, 'toggle']);
        }
        if (audio === 'pactl') {
            const dev = '@DEFAULT_SINK@';
            if (mode === 'up') return exec('pactl', ['set-sink-volume', dev, `+${step}%`]);
            if (mode === 'down') return exec('pactl', ['set-sink-volume', dev, `-${step}%`]);
            if (mode === 'set') return exec('pactl', ['set-sink-volume', dev, `${value}%`]);
            if (mode === 'mute') return exec('pactl', ['set-sink-mute', dev, 'toggle']);
        }
        if (isWin) {
            if (mode === 'mute') return winKeybd([0xAD]);
            const times = Math.max(1, Math.round(step / 2));   // jeden klawisz = 2%
            return winKeybd(Array(times).fill(mode === 'down' ? 0xAE : 0xAF));
        }
        throw new Error('Nie znaleziono sterowania dźwiękiem (wpctl ani pactl).');
    }
    // ───── Wszystko, czym da się sterować głośnością ─────
    // Cele: system | mic | sink:<nazwa> | source:<nazwa> | app:<nazwa aplikacji> | player:<odtwarzacz MPRIS>
    const pactlJson = async (what) => { try { return JSON.parse(await exec('pactl', ['-f', 'json', 'list', what])); } catch { return []; } };
    const pct = (vol) => { const ch = vol && Object.values(vol)[0]; return ch ? parseInt(String(ch.value_percent || '0'), 10) : 0; };
    const appName = (si) => (si.properties && (si.properties['application.name'] || si.properties['application.process.binary'])) || '';
    async function audioTargets() {
        const out = [{ value: 'system', label: 'Głośność systemu (domyślne wyjście)' }, { value: 'mic', label: 'Mikrofon (domyślne wejście)' }];
        if (!isWin && (audio === 'pactl' || audio === 'wpctl') && which('pactl')) {
            for (const d of await pactlJson('sinks')) out.push({ value: `sink:${d.name}`, label: `Wyjście: ${d.description && d.description !== '(null)' ? d.description : d.name}` });
            for (const d of await pactlJson('sources')) if (!/\.monitor$/.test(d.name)) out.push({ value: `source:${d.name}`, label: `Wejście: ${d.description && d.description !== '(null)' ? d.description : d.name}` });
            const apps = new Set();
            for (const si of await pactlJson('sink-inputs')) { const n = appName(si); if (n && !apps.has(n)) { apps.add(n); out.push({ value: `app:${n}`, label: `Aplikacja: ${n}` }); } }
        }
        for (const pl of await listPlayers().catch(() => [])) out.push({ value: `player:${pl.value}`, label: `Odtwarzacz: ${pl.label}` });
        return out;
    }
    async function getTargetVolume(target = 'system') {
        const [kind, ...rest] = String(target).split(':');
        const id = rest.join(':');
        if (kind === 'system') return getVolume('sink');
        if (kind === 'mic') return getVolume('source');
        if (kind === 'player') { const np = await nowPlaying(id); return { volume: np.volume, muted: null }; }
        if (kind === 'sink' || kind === 'source') {
            const d = (await pactlJson(kind === 'sink' ? 'sinks' : 'sources')).find((x) => x.name === id);
            return d ? { volume: pct(d.volume), muted: Boolean(d.mute) } : { volume: null, muted: null };
        }
        if (kind === 'app') {
            const si = (await pactlJson('sink-inputs')).find((x) => appName(x) === id);
            return si ? { volume: pct(si.volume), muted: Boolean(si.mute) } : { volume: null, muted: null };
        }
        return { volume: null, muted: null };
    }
    async function setTargetVolume(target = 'system', mode = 'set', step = 5, value = 50) {
        const [kind, ...rest] = String(target).split(':');
        const id = rest.join(':');
        const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
        if (kind === 'system') return setVolume(mode, step, value);
        if (kind === 'mic') {
            if (mode === 'mute') return setMic('toggle');
            const cur = (await getVolume('source')).volume || 0;
            return setMicVolume(clamp(mode === 'set' ? value : cur + (mode === 'up' ? step : -step)));
        }
        if (kind === 'player') {
            const cur = (await nowPlaying(id)).volume || 0;
            if (mode === 'mute') return setPlayerVolume(cur > 0 ? 0 : 50, id);
            return setPlayerVolume(clamp(mode === 'set' ? value : cur + (mode === 'up' ? step : -step)), id);
        }
        if (isWin) throw new Error('Na Windowsie dostępna jest głośność systemu, mikrofonu i odtwarzaczy');
        const amount = mode === 'set' ? `${clamp(value)}%` : mode === 'up' ? `+${step}%` : `-${step}%`;
        if (kind === 'sink' || kind === 'source') {
            if (mode === 'mute') return exec('pactl', [`set-${kind}-mute`, id, 'toggle']);
            return exec('pactl', [`set-${kind}-volume`, id, amount]);
        }
        if (kind === 'app') {
            const list = (await pactlJson('sink-inputs')).filter((x) => appName(x) === id);
            if (!list.length) throw new Error(`Aplikacja „${id}” teraz nic nie gra`);
            for (const si of list) await exec('pactl', mode === 'mute' ? ['set-sink-input-mute', String(si.index), 'toggle'] : ['set-sink-input-volume', String(si.index), amount]);
            return;
        }
        throw new Error(`Nieznany cel głośności: ${target}`);
    }
    async function setMicVolume(value) {
        const v = Math.max(0, Math.min(100, Math.round(value)));
        if (audio === 'wpctl') return exec('wpctl', ['set-volume', '@DEFAULT_AUDIO_SOURCE@', `${v}%`]);
        if (audio === 'pactl') return exec('pactl', ['set-source-volume', '@DEFAULT_SOURCE@', `${v}%`]);
        throw new Error('Nie znaleziono sterowania mikrofonem.');
    }
    async function setMic(mode) {
        if (audio === 'wpctl') return exec('wpctl', ['set-mute', '@DEFAULT_AUDIO_SOURCE@', mode === 'toggle' ? 'toggle' : mode === 'mute' ? '1' : '0']);
        if (audio === 'pactl') return exec('pactl', ['set-source-mute', '@DEFAULT_SOURCE@', mode === 'toggle' ? 'toggle' : mode === 'mute' ? '1' : '0']);
        if (isWin) return pressCombo(['micmute']);
        throw new Error('Nie znaleziono sterowania mikrofonem.');
    }

    // ───── Dźwięki, programy, polecenia ─────
    let soundProcs = new Set();
    function playSound(file, volume = 100) {
        if (!file || !fs.existsSync(file)) throw new Error('Nie znaleziono pliku dźwiękowego');
        let proc;
        if (isWin) {
            const f = file.replace(/'/g, "''");
            proc = spawn('powershell.exe', ['-NoProfile', '-Command', `Add-Type -AssemblyName PresentationCore; $p=New-Object System.Windows.Media.MediaPlayer; $p.Open('${f}'); $p.Volume=${volume / 100}; $p.Play(); Start-Sleep -Milliseconds 300; while($p.Position -lt $p.NaturalDuration.TimeSpan){Start-Sleep -Milliseconds 200}`], { windowsHide: true });
        } else if (which('ffplay')) {
            proc = spawn('ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', '-volume', String(volume), file], { stdio: 'ignore' });
        } else if (which('pw-play')) {
            proc = spawn('pw-play', ['--volume', String(volume / 100), file], { stdio: 'ignore' });
        } else if (which('paplay')) {
            proc = spawn('paplay', [file], { stdio: 'ignore' });
        } else throw new Error('Nie znaleziono odtwarzacza dźwięku (ffplay, pw-play ani paplay).');
        soundProcs.add(proc);
        proc.on('exit', () => soundProcs.delete(proc));
        proc.on('error', () => soundProcs.delete(proc));
    }
    function stopSounds() {
        for (const p of soundProcs) { try { p.kill(); } catch {} }
        soundProcs.clear();
    }
    async function open(target) {
        if (!target) throw new Error('Nie podano, co otworzyć');
        if (/^[a-z][\w+.-]*:\/\//i.test(target) || /^mailto:/i.test(target)) return shell.openExternal(target);
        const err = await shell.openPath(target);
        if (err) throw new Error(err);
    }
    function runCommand(command, { cwd, wait = false } = {}) {
        if (!command) throw new Error('Nie podano polecenia');
        const opts = { cwd: cwd || require('os').homedir(), detached: !wait, stdio: wait ? 'pipe' : 'ignore', shell: true, windowsHide: true };
        const proc = spawn(command, [], opts);
        if (!wait) { proc.unref(); return Promise.resolve(''); }
        return new Promise((resolve, reject) => {
            let out = '', err = '';
            proc.stdout.on('data', (d) => { out += d; });
            proc.stderr.on('data', (d) => { err += d; });
            proc.on('error', reject);
            proc.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `kod wyjścia ${code}`))));
        });
    }

    function dispose() {
        stopSounds();
        if (uinput) { try { uinput.proc.stdin.end(); uinput.proc.kill(); } catch {} uinput = null; }
    }

    return { pressCombo, parseCombo, typeText, media, nowPlaying, listPlayers, audioTargets, getTargetVolume, setTargetVolume, setShuffle, setLoop, openUri, seek, setPlayerVolume, getVolume, setVolume, setMic, setMicVolume, playSound, stopSounds, open, runCommand, keyboardBackend, dispose, which, exec };
}

module.exports = { createPlatform, which };
