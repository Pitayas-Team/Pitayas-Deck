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
    function mprisGet(dest, prop) {
        return exec('gdbus', ['call', '--session', '--dest', dest, '--object-path', '/org/mpris/MediaPlayer2', '--method', 'org.freedesktop.DBus.Properties.Get', 'org.mpris.MediaPlayer2.Player', prop], { timeout: 3000 });
    }
    // Aktywny odtwarzacz: ten, który gra, inaczej pierwszy z listy
    async function activePlayer() {
        const players = await mprisPlayers();
        for (const p of players) {
            try { if (/Playing/.test(await mprisGet(p, 'PlaybackStatus'))) return p; } catch {}
        }
        return players[0] || null;
    }
    async function media(command) {
        const methods = { 'play-pause': 'PlayPause', play: 'Play', pause: 'Pause', next: 'Next', previous: 'Previous', stop: 'Stop' };
        if (!methods[command]) throw new Error(`Nieznane polecenie: ${command}`);
        const player = await activePlayer().catch(() => null);
        if (player) {
            return exec('gdbus', ['call', '--session', '--dest', player, '--object-path', '/org/mpris/MediaPlayer2', '--method', `org.mpris.MediaPlayer2.Player.${methods[command]}`]);
        }
        // Bez MPRIS (Windows albo brak odtwarzacza) — klawisz multimedialny
        return pressCombo([{ 'play-pause': 'playpause', play: 'playpause', pause: 'playpause', next: 'next', previous: 'previous', stop: 'stop' }[command]]);
    }
    async function nowPlaying() {
        const player = await activePlayer().catch(() => null);
        if (!player) return { title: '', artist: '', status: 'Stopped', player: '' };
        let meta = '', status = '';
        try { meta = await mprisGet(player, 'Metadata'); } catch {}
        try { status = (await mprisGet(player, 'PlaybackStatus')).match(/'(\w+)'/)?.[1] || ''; } catch {}
        const str = (key) => {
            const m = meta.match(new RegExp(`'${key}':\\s*<\\[?'((?:[^'\\\\]|\\\\.)*)'`));
            return m ? m[1].replace(/\\'/g, "'") : '';
        };
        return { title: str('xesam:title'), artist: str('xesam:artist'), album: str('xesam:album'), status, player: player.replace('org.mpris.MediaPlayer2.', '') };
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

    return { pressCombo, parseCombo, typeText, media, nowPlaying, getVolume, setVolume, setMic, playSound, stopSounds, open, runCommand, keyboardBackend, dispose, which };
}

module.exports = { createPlatform, which };
