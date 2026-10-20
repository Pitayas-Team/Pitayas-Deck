// ═══════ PITAYA DECK — IMPORT Z MACRO DECK ═══════
// Czyta profile Macro Deck (~/.local/share/MacroDeck/data/profiles/*.json) i tworzy z nich profile Pitaya Deck.
// Przenosi foldery, rozmiary siatek, przyciski (ze stanami), suwaki, zegary, wskaźniki, odtwarzacz i ikony.
// Akcje są tłumaczone na wtyczki Pitaya Deck; to, czego nie da się przenieść, trafia do podsumowania.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { uid } = require('./store');

function macroDeckDir() {
    const candidates = process.platform === 'win32'
        ? [path.join(process.env.APPDATA || '', 'Macro Deck'), path.join(process.env.LOCALAPPDATA || '', 'MacroDeck')]
        : [path.join(os.homedir(), '.local', 'share', 'MacroDeck'), path.join(os.homedir(), '.config', 'MacroDeck')];
    return candidates.find((d) => fs.existsSync(path.join(d, 'data', 'profiles'))) || null;
}

// Zmienne Macro Deck → zmienne Pitaya Deck (dla reguł stanów, suwaków i wskaźników)
const VARS = {
    system_cpu_usage_percent: 'system.cpu', system_ram_usage_percent: 'system.ram', system_gpu_0_usage_percent: 'system.gpu',
    time: 'system.time', date: 'system.date', system_volume: 'media.volume', obs_streaming: 'obs.streaming', obs_recording: 'obs.recording',
    obs_obs_virtual_camera: 'obs.virtualcam', obs_virtual_camera: 'obs.virtualcam',
    // Spotify
    spotify_playing_shuffle: 'spotify.shuffle', spotify_shuffle_enabled: 'spotify.shuffle', spotify_is_playing: 'spotify.playing', spotify_playing: 'spotify.playing',
    spotify_volume: 'spotify.volume', spotify_playing_loop: 'spotify.repeatOn', spotify_repeat_mode: 'spotify.repeat', spotify_is_connected: 'spotify.connected',
    spotify_current_track_name: 'spotify.title', spotify_current_artist: 'spotify.artist', spotify_current_album: 'spotify.album', spotify_album_art_url: 'spotify.art',
    spotify_current_track_url: 'spotify.url', spotify_current_track_is_liked: 'spotify.liked', spotify_current_position: 'spotify.positionText',
    spotify_track_duration: 'spotify.durationText', spotify_progress_percentage: 'spotify.progress', spotify_device_name: 'spotify.device',
    spotify_device_type: 'spotify.deviceType', spotify_playback_state: 'spotify.state', spotify_top_track: 'spotify.topTrack', spotify_top_tracks: 'spotify.topTracks',
    spotify_top_artist: 'spotify.topArtist', spotify_top_artists: 'spotify.topArtists',
    // Discord
    discord_is_connected: 'discord.connected', discord_is_muted: 'discord.muted', discord_is_deafened: 'discord.deafened', discord_is_self_muted: 'discord.selfMuted',
    discord_is_self_deafened: 'discord.selfDeafened', discord_is_server_muted: 'discord.serverMuted', discord_is_server_deafened: 'discord.serverDeafened',
    discord_is_speaking: 'discord.speaking', discord_is_in_voice_channel: 'discord.inVoice', discord_voice_channel: 'discord.channel', discord_voice_server: 'discord.server',
    discord_voice_ping: 'discord.ping', discord_voice_connection_state: 'discord.voiceState', discord_voice_mode: 'discord.voiceMode', discord_input_volume: 'discord.inputVolume',
    discord_output_volume: 'discord.outputVolume', discord_noise_suppression: 'discord.noiseSuppression', discord_echo_cancellation: 'discord.echoCancellation',
    discord_automatic_gain_control: 'discord.autoGain', discord_user_name: 'discord.user',
};
const mapVar = (v) => VARS[v] || v;

const KEY_NAMES = { CapsLock: 'capslock', Enter: 'enter', Escape: 'esc', Space: 'space', Tab: 'tab', Backspace: 'backspace', Delete: 'delete', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Control: 'ctrl', Ctrl: 'ctrl', Shift: 'shift', Alt: 'alt', Meta: 'super', Win: 'super', MediaPlayPause: 'playpause', MediaNextTrack: 'next', MediaPreviousTrack: 'previous', VolumeUp: 'volumeup', VolumeDown: 'volumedown', VolumeMute: 'mute' };
const keyName = (k) => KEY_NAMES[k] || String(k || '').toLowerCase().replace(/^key/, '').replace(/^digit/, '');

function importMacroDeck(store, { log = () => {} } = {}) {
    const root = macroDeckDir();
    if (!root) throw new Error('Nie znaleziono danych Macro Deck na tym komputerze.');
    const summary = { profiles: 0, folders: 0, widgets: 0, actions: 0, icons: 0, skipped: {}, windowsPaths: 0 };
    const skip = (what) => { summary.skipped[what] = (summary.skipped[what] || 0) + 1; };

    // Ikony z paczek: icons/packs/<paczka>/icons/<id>/256.webp
    const iconCache = new Map();
    function icon(ref) {
        if (!ref || ref.type !== 'icon-pack' || !ref.reference) return null;
        if (iconCache.has(ref.reference)) return iconCache.get(ref.reference);
        let name = null;
        const packs = path.join(root, 'data', 'icons', 'packs');
        try {
            for (const pack of fs.readdirSync(packs)) {
                const dir = path.join(packs, pack, 'icons', ref.reference);
                const file = ['256.webp', '512.webp', 'master.webp', '128.webp', '256.png', 'master.png'].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
                if (file) { name = store.saveImage(fs.readFileSync(file), path.extname(file).slice(1)); summary.icons++; break; }
            }
        } catch {}
        iconCache.set(ref.reference, name);
        return name;
    }
    function iconOf(ref, display) {
        const name = icon(ref);
        if (!name) return { type: 'none' };
        return { type: 'image', value: name, fit: display && display.fit === 'cover' ? 'cover' : 'contain', zoom: (display && display.zoom) || 100, opacity: display && display.opacity !== undefined ? display.opacity : 100 };
    }
    function look(src) {
        const out = {};
        if (src.backgroundColor) out.bg = src.backgroundColor;
        if (src.labelColor) out.color = src.labelColor;
        if (src.labelPosition) out.labelPos = { top: 'top', center: 'center', bottom: 'bottom', hidden: 'hidden' }[src.labelPosition] || 'bottom';
        if (src.fontSize) out.fontSize = Math.max(8, Math.round(src.fontSize));
        if (src.icon) out.icon = iconOf(src.icon, src.iconDisplay);
        if (src.label !== undefined) out.label = String(src.label).replace(/^\s+$/, '').replace(/\{([\w.\-]+)\}/g, (m, n) => `{${mapVar(n)}}`);
        return out;
    }

    const folderMap = new Map();   // id Macro Deck → id Pitaya Deck
    function param(n, name) { const p = (n.parameters || []).find((x) => x.name === name); return p ? p.value : undefined; }
    function action(n) {
        const bt = n.blockType || '';
        const v = (name) => param(n, name);
        const winPath = (p) => { if (/^[A-Z]:\\/i.test(p || '')) summary.windowsPaths++; return p; };
        switch (bt) {
            case 'app.macro-deck.deck.change-folder': return { plugin: 'deck', action: 'open-folder', config: { folder: folderMap.get(v('folderId')) || '' } };
            case 'app.macro-deck.deck.go-back': return { plugin: 'deck', action: 'back' };
            case 'app.macro-deck.spotify.play-playlist': return { plugin: 'spotify', action: 'play-playlist', config: { uri: v('playlist') || v('uri') || '', playlist: '', shuffle: '' } };
            case 'app.macro-deck.spotify.play-track': return { plugin: 'spotify', action: 'play-uri', config: { uri: v('track') || v('uri') || '' } };
            case 'app.macro-deck.spotify.toggle-like': case 'app.macro-deck.spotify.toggle-liked': return { plugin: 'spotify', action: 'like', config: { mode: 'toggle' } };
            case 'app.macro-deck.spotify.set-volume': return { plugin: 'spotify', action: 'volume', config: { mode: 'set', value: v('volume') ?? v('value') ?? 50 } };
            case 'app.macro-deck.spotify.play-on-device': return { plugin: 'spotify', action: 'device', config: { device: v('device') || v('deviceName') || '', play: true } };
            case 'app.macro-deck.spotify.next': return { plugin: 'spotify', action: 'next' };
            case 'app.macro-deck.spotify.previous': return { plugin: 'spotify', action: 'previous' };
            case 'app.macro-deck.spotify.toggle-play-pause': return { plugin: 'spotify', action: 'play-pause', config: { mode: 'toggle' } };
            case 'app.macro-deck.spotify.toggle-shuffle': return { plugin: 'spotify', action: 'shuffle', config: { mode: v('mode') === 'on' || v('mode') === 'off' ? v('mode') : 'toggle' } };
            case 'app.macro-deck.spotify.set-repeat-mode': return { plugin: 'spotify', action: 'repeat', config: { mode: { track: 'track', context: 'context', playlist: 'context', off: 'off' }[String(v('mode') || '').toLowerCase()] || 'cycle' } };
            case 'app.macro-deck.discord.mute': case 'app.macro-deck.discord.toggle-mute': return { plugin: 'discord', action: 'mute', config: { mode: { mute: 'on', unmute: 'off', on: 'on', off: 'off' }[v('action') || v('mode')] || 'toggle' } };
            case 'app.macro-deck.discord.set-voice-mode': return { plugin: 'discord', action: 'voice-mode', config: { mode: 'toggle' } };
            case 'app.macro-deck.discord.leave-voice-channel': return { plugin: 'discord', action: 'leave' };
            case 'app.macro-deck.discord.set-input-volume': return { plugin: 'discord', action: 'input-volume', config: { mode: 'set', value: v('volume') ?? 100 } };
            case 'app.macro-deck.discord.set-output-volume': return { plugin: 'discord', action: 'output-volume', config: { mode: 'set', value: v('volume') ?? 100 } };
            case 'app.macro-deck.discord.deafen': case 'app.macro-deck.discord.toggle-deafen': return { plugin: 'discord', action: 'deafen', config: { mode: 'toggle' } };
            case 'app.macro-deck.obs.set-scene': return { plugin: 'obs', action: 'scene', config: { scene: v('scene') || '' } };
            case 'app.macro-deck.obs.toggle-virtual-camera': return { plugin: 'obs', action: 'virtualcam' };
            case 'app.macro-deck.obs.toggle-stream': return { plugin: 'obs', action: 'stream', config: { mode: 'toggle' } };
            case 'app.macro-deck.obs.toggle-record': return { plugin: 'obs', action: 'record', config: { mode: 'toggle' } };
            case 'app.macro-deck.system.launch-application': return { plugin: 'system', action: 'open', config: { target: winPath(v('path') || '') } };
            case 'app.macro-deck.system.open-file': return { plugin: 'system', action: 'open', config: { target: winPath(v('path') || '') } };
            case 'app.macro-deck.widget.set-state': return { plugin: 'deck', action: 'set-state', config: { state: v('state') || 'next' } };
            case 'app.macro-deck.keyboard.type-text': return { plugin: 'system', action: 'type', config: { text: v('text') || '' } };
            case 'app.macro-deck.keyboard.press-key': {
                const c = v('combo') || {};
                const keys = [...(c.modifiers || []).map(keyName), keyName(c.key)].filter(Boolean);
                return { plugin: 'system', action: 'hotkey', config: { combo: keys.join('+') } };
            }
            case 'app.macro-deck.migration.unsupported-action': {
                if (/DelayAction/.test(v('sourceAction') || '')) return { plugin: 'deck', action: 'delay', config: { ms: parseInt(v('sourceConfiguration'), 10) || 500 } };
                skip(`akcja z Macro Deck 2 (${String(v('sourceAction') || '').split(',')[0].split('.').pop()})`);
                return null;
            }
            default:
                skip(`akcja ${bt.replace('app.macro-deck.', '')}`);
                return null;
        }
    }
    function flows(raw) {
        const out = {};
        let list = [];
        try { list = typeof raw === 'string' ? JSON.parse(raw) : raw || []; } catch { return out; }
        const phases = { onShortPress: 'press', onPress: 'press', onLongPress: 'longPress', onTouchEnd: 'release', onRelease: 'release' };
        for (const t of list) {
            const phase = phases[t.triggerType];
            if (!phase) { skip(`wyzwalacz ${t.triggerType}`); continue; }
            const walk = (nodes) => {
                for (const n of nodes || []) {
                    if (n.type === 'action') {
                        const a = action(n);
                        if (a) { (out[phase] = out[phase] || []).push(a); summary.actions++; }
                    } else if (n.type) skip(`blok ${n.type}`);
                    walk(n.children);
                }
            };
            walk(t.children);
        }
        return out;
    }

    function widget(w) {
        let data = {};
        try { data = w.data ? JSON.parse(w.data) : {}; } catch {}
        const base = { w: Math.max(1, w.width || 1), h: Math.max(1, w.height || 1), border: data.border && data.border.style && data.border.style !== 'off' ? { width: 2, color: data.border.color || '#ff4fa6' } : undefined };
        if (w.type === 'ActionButton') {
            const b = {
                ...base, type: 'button', label: '', labelPos: 'bottom', fontSize: 14, bg: '#23222a', color: '#ffffff',
                textAlign: data.textAlign || 'center', labelShadow: data.labelShadow !== false, labelOutline: (data.labelOutlineWidth || 0) > 1,
                ...look(data), actions: flows(data.flows),
            };
            if (Array.isArray(data.states) && data.states.length) {
                b.states = data.states.map((s) => ({ id: s.id, name: s.label || s.id, look: look(s.appearance || {}) }));
                if (data.stateMapping && Array.isArray(data.stateMapping.rules) && data.stateMapping.rules.length) {
                    b.stateSource = 'variable';
                    b.stateRules = [];
                    for (const r of data.stateMapping.rules) {
                        const wh = r.when || {};
                        if (wh.kind === 'compare' && wh.left && wh.left.$var) b.stateRules.push({ state: r.stateId, var: mapVar(wh.left.$var), op: wh.operator || '==', value: wh.right });
                        else skip('złożona reguła stanu');
                    }
                } else b.stateSource = data.cycleStatesOnPress ? 'cycle' : 'manual';
            }
            return b;
        }
        if (w.type === 'Slider') {
            const v = data.valueVariable || '';
            const preset = /spotify.*volume/i.test(v) ? 'player' : /system.*volume|^volume$/i.test(v) ? 'volume' : /mic/i.test(v) ? 'mic' : 'custom';
            const label = data.showLabel === false ? '' : (data.label || '');
            // Głośność Spotify: przez wtyczkę Spotify (działa też z telefonem i głośnikiem po zalogowaniu)
            if (preset === 'player') {
                return { ...base, type: 'slider', label, bg: data.backgroundColor || '#23222a',
                    slider: { preset: 'custom', var: 'spotify.volume', orientation: data.orientation || 'vertical', showValue: Boolean(data.showValue), min: 0, max: 100, step: 1 },
                    actions: { change: [{ plugin: 'spotify', action: 'volume', config: { mode: 'set', value: '{value}' } }] } };
            }
            return { ...base, type: 'slider', label, bg: data.backgroundColor || '#23222a',
                slider: { preset, player: '', var: preset === 'custom' ? mapVar(v) : '', orientation: data.orientation || 'vertical', showValue: Boolean(data.showValue), min: 0, max: 100, step: 1 },
                actions: flows(data.flows) };
        }
        if (w.type === 'Clock') return { ...base, type: 'clock', bg: data.backgroundColor || '#23222a', clock: { seconds: Boolean(data.showSeconds), date: data.showDate !== false, h12: data.hourCycle === 'h12' }, actions: flows(data.flows) };
        if (w.type === 'Gauges') return { ...base, type: 'gauge', bg: data.backgroundColor || '#23222a', gaugeStyle: data.style === 'bar' || data.style === 'bars' ? 'bar' : 'ring',
            gauges: (data.gauges || []).map((g) => ({ var: mapVar(g.variable), name: g.name || '', max: g.max || 100, unit: '%' })), actions: flows(data.flows) };
        if (w.type === 'MusicPlayer') return { ...base, type: 'media', bg: data.backgroundColor || '#23222a', media: { album: Boolean(data.showAlbum), timeline: data.showTimeline !== false }, actions: {} };
        skip(`widżet ${w.type}`);
        return null;
    }

    const files = fs.readdirSync(path.join(root, 'data', 'profiles')).filter((f) => f.endsWith('.json'));
    for (const f of files) {
        let mdp;
        try { mdp = JSON.parse(fs.readFileSync(path.join(root, 'data', 'profiles', f), 'utf8')); } catch (err) { log('Import Macro Deck:', f, err.message); continue; }
        const folders = mdp.folders || [];
        const rootFolder = folders.find((x) => !x.parentId) || folders[0];
        if (!rootFolder) continue;
        // Najpierw identyfikatory wszystkich folderów — przyciski „zmień folder” muszą je znać
        for (const mf of folders) folderMap.set(mf.id, uid('f'));
        const profile = store.addProfile(`${mdp.name || 'Profil'} (Macro Deck)`);
        const deck = store.deck;
        delete deck.folders[profile.root];
        profile.root = folderMap.get(rootFolder.id);
        profile.cols = Math.max(1, Math.min(12, mdp.defaultColumns || 5));
        profile.rows = Math.max(1, Math.min(10, mdp.defaultRows || 3));
        profile.spacing = Math.max(0, Math.min(40, mdp.defaultWidgetSpacing ?? 10));
        profile.radius = Math.max(0, Math.min(50, Math.round(((mdp.defaultWidgetBorderRadius ?? 22) / 110) * 100)));
        if (mdp.defaultBackgroundColor) profile.background = mdp.defaultBackgroundColor;
        for (const mf of folders) {
            const id = folderMap.get(mf.id);
            const folder = { id, name: mf.id === rootFolder.id ? 'Start' : mf.name, parent: mf.parentId ? folderMap.get(mf.parentId) || profile.root : null, buttons: {} };
            if (mf.columns) folder.cols = Math.min(12, mf.columns);
            if (mf.rows) folder.rows = Math.min(10, mf.rows);
            deck.folders[id] = folder;
            summary.folders++;
        }
        for (const mf of folders) {
            const folder = deck.folders[folderMap.get(mf.id)];
            for (const w of mf.widgets || []) {
                const b = widget(w);
                if (!b) continue;
                folder.buttons[`${w.positionX},${w.positionY}`] = b;
                summary.widgets++;
            }
        }
        summary.profiles++;
        store.updateProfile(profile.id, {});   // zapis
    }
    store.flush();
    return summary;
}

module.exports = { importMacroDeck, macroDeckDir };
