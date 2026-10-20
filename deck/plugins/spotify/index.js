// Wtyczka „Spotify”.
// Bez logowania: sterowanie aplikacją Spotify na tym komputerze (MPRIS) — graj, pauza, utwory, playlisty, głośność.
// Po zalogowaniu (Spotify Web API, własna aplikacja z developer.spotify.com, logowanie PKCE bez hasła w decku):
// polubienia, lista playlist, urządzenia, top utwory, losowo/powtarzanie także na telefonie i głośniku.
const crypto = require('crypto');

const SCOPES = [
    'user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing',
    'user-library-read', 'user-library-modify', 'playlist-read-private', 'playlist-read-collaborative',
    'user-top-read', 'user-read-private',
].join(' ');
const API = 'https://api.spotify.com/v1';

let ctxRef = null;
let pollTimer = null;
let topTimer = null;
let stopped = true;
let pkce = null;              // { verifier, state, redirect }
let refreshing = null;
let lastTrack = '';
let apiState = null;          // ostatnia odpowiedź /me/player
let apiFailures = 0;

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fmt = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const loggedIn = () => Boolean(ctxRef && ctxRef.settings.refreshToken && ctxRef.settings.clientId);
const redirectUri = (ctx) => `http://127.0.0.1:${ctx.serverPort() || 8191}/p/spotify/callback`;

// spotify:typ:id z linku open.spotify.com albo z identyfikatora
function toUri(input) {
    const u = String(input || '').trim();
    const m = u.match(/open\.spotify\.com\/(?:intl-[\w-]+\/)?(playlist|album|track|artist|episode|show)\/([A-Za-z0-9]+)/);
    if (m) return `spotify:${m[1]}:${m[2]}`;
    if (/^spotify:(playlist|album|track|artist|episode|show|user:[^:]+:playlist):/.test(u)) return u;
    if (/^[A-Za-z0-9]{22}$/.test(u)) return `spotify:playlist:${u}`;
    return '';
}

// ───── Tokeny ─────
async function tokenRequest(params) {
    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error_description || body.error || `Spotify: błąd ${res.status}`);
    return body;
}
function saveTokens(t) {
    const patch = { accessToken: t.access_token, expiresAt: Date.now() + (t.expires_in || 3600) * 1000 - 60000 };
    if (t.refresh_token) patch.refreshToken = t.refresh_token;
    ctxRef.saveSettings(patch);
}
async function accessToken() {
    const s = ctxRef.settings;
    if (!s.refreshToken) throw new Error('Zaloguj się do Spotify: Ustawienia → Wtyczki → Spotify');
    if (s.accessToken && s.expiresAt > Date.now()) return s.accessToken;
    if (!refreshing) {
        refreshing = tokenRequest({ grant_type: 'refresh_token', refresh_token: s.refreshToken, client_id: s.clientId })
            .then((t) => { saveTokens(t); return t.access_token; })
            .catch((err) => {
                if (/invalid_grant|revoked/i.test(err.message)) { ctxRef.saveSettings({ refreshToken: '', accessToken: '' }); setOffline('Sesja Spotify wygasła — zaloguj się ponownie'); }
                throw err;
            })
            .finally(() => { refreshing = null; });
    }
    return refreshing;
}

async function api(method, pathname, body, retry = true) {
    const token = await accessToken();
    const res = await fetch(API + pathname, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && retry) { ctxRef.saveSettings({ expiresAt: 0 }); return api(method, pathname, body, false); }
    if (res.status === 429) throw new Error('Spotify: za dużo zapytań, spróbuj za chwilę');
    if (res.status === 204 || res.status === 202) return null;
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) {
        const msg = (json && json.error && (json.error.message || json.error.reason)) || `błąd ${res.status}`;
        const err = new Error(/premium/i.test(msg) || (json && json.error && json.error.reason === 'PREMIUM_REQUIRED')
            ? 'Spotify: sterowanie odtwarzaniem przez internet wymaga konta Premium'
            : /no active device/i.test(msg) || (json && json.error && json.error.reason === 'NO_ACTIVE_DEVICE')
                ? 'NO_ACTIVE_DEVICE' : `Spotify: ${msg}`);
        err.status = res.status;
        throw err;
    }
    return json;
}

// Polecenie odtwarzacza; gdy nic nie gra, wybiera urządzenie (najlepiej ten komputer) i próbuje jeszcze raz
async function player(method, pathname, body) {
    try { return await api(method, pathname, body); } catch (err) {
        if (err.message !== 'NO_ACTIVE_DEVICE') throw err;
        const { devices = [] } = (await api('GET', '/me/player/devices')) || {};
        const pick = devices.find((d) => d.id === ctxRef.settings.device) || devices.find((d) => d.type === 'Computer') || devices[0];
        if (!pick) throw new Error('Spotify nie jest otwarty na żadnym urządzeniu — uruchom aplikację Spotify');
        const sep = pathname.includes('?') ? '&' : '?';
        return api(method, `${pathname}${sep}device_id=${encodeURIComponent(pick.id)}`, body);
    }
}

// ───── Stan ─────
function set(patch) { for (const [k, v] of Object.entries(patch)) ctxRef.setVariable(k, v); }
function setOffline(text) {
    ctxRef.setStatus(text || (ctxRef.settings.clientId ? 'Nie zalogowano — działa sterowanie aplikacją na tym komputerze' : 'Bez logowania: steruje aplikacją Spotify na tym komputerze'), false);
    set({ connected: false });
}

async function pollApi() {
    const st = await api('GET', '/me/player?additional_types=episode');
    apiFailures = 0;
    apiState = st;
    if (!st || !st.item) {
        set({ connected: true, playing: false, state: 'stopped', device: st && st.device ? st.device.name : '', deviceType: st && st.device ? st.device.type : '' });
        return;
    }
    const it = st.item;
    const images = (it.album && it.album.images) || it.images || (it.show && it.show.images) || [];
    const duration = (it.duration_ms || 0) / 1000;
    const position = (st.progress_ms || 0) / 1000;
    set({
        connected: true,
        running: true,
        playing: Boolean(st.is_playing),
        state: st.is_playing ? 'playing' : 'paused',
        title: it.name || '',
        artist: (it.artists || []).map((a) => a.name).join(', ') || (it.show && it.show.name) || '',
        album: (it.album && it.album.name) || '',
        art: (images[0] && images[0].url) || '',
        url: (it.external_urls && it.external_urls.spotify) || '',
        uri: it.uri || '',
        duration: Math.round(duration),
        position: Math.round(position),
        durationText: fmt(duration),
        positionText: fmt(position),
        progress: duration ? Math.round((position / duration) * 100) : 0,
        shuffle: Boolean(st.shuffle_state),
        repeat: st.repeat_state || 'off',
        repeatOn: st.repeat_state && st.repeat_state !== 'off',
        volume: st.device ? st.device.volume_percent : null,
        device: st.device ? st.device.name : '',
        deviceType: st.device ? st.device.type : '',
    });
    if (it.id && it.type === 'track' && it.id !== lastTrack) {
        lastTrack = it.id;
        api('GET', `/me/tracks/contains?ids=${it.id}`).then((r) => set({ liked: Boolean(r && r[0]) })).catch(() => {});
    }
}

async function pollLocal() {
    const np = await ctxRef.platform.nowPlaying('spotify');
    const running = Boolean(np.player);
    const art = np.artUrl && np.artUrl.startsWith('https://open.spotify.com/image/') ? np.artUrl.replace('open.spotify.com/image/', 'i.scdn.co/image/') : np.artUrl;
    set({
        running,
        playing: np.status === 'Playing',
        state: { Playing: 'playing', Paused: 'paused' }[np.status] || 'stopped',
        title: np.title, artist: np.artist, album: np.album, art,
        url: np.url && np.url.startsWith('https://open.spotify.com') ? np.url : '',
        duration: np.length, position: np.position,
        durationText: fmt(np.length), positionText: fmt(np.position),
        progress: np.length ? Math.round((np.position / np.length) * 100) : 0,
        shuffle: np.shuffle,
        repeat: { Track: 'track', Playlist: 'context' }[np.loop] || 'off',
        repeatOn: np.loop === 'Track' || np.loop === 'Playlist',
        volume: np.volume,
        device: running ? 'Ten komputer' : '',
        deviceType: running ? 'Computer' : '',
    });
}

async function poll() {
    clearTimeout(pollTimer);
    if (stopped) return;
    let delay = 1500;
    try {
        if (loggedIn() && apiFailures < 3) { await pollApi(); delay = apiState && apiState.is_playing ? 2000 : 4000; } else await pollLocal();
    } catch (err) {
        if (loggedIn()) {
            apiFailures++;
            if (apiFailures >= 3) { ctxRef.log('Web API niedostępne, przełączam na sterowanie lokalne:', err.message); setTimeout(() => { apiFailures = 0; }, 60000); }
        }
        await pollLocal().catch(() => {});
    }
    pollTimer = setTimeout(poll, delay);
}

async function loadTop() {
    clearTimeout(topTimer);
    if (stopped || !loggedIn()) return;
    try {
        const tracks = (await api('GET', '/me/top/tracks?limit=5&time_range=short_term')).items || [];
        const artists = (await api('GET', '/me/top/artists?limit=5&time_range=short_term')).items || [];
        set({
            topTrack: tracks[0] ? `${tracks[0].name} — ${tracks[0].artists.map((a) => a.name).join(', ')}` : '',
            topTracks: tracks.map((t) => t.name).join(', '),
            topArtist: artists[0] ? artists[0].name : '',
            topArtists: artists.map((a) => a.name).join(', '),
        });
        const me = await api('GET', '/me');
        set({ account: me.display_name || me.id || '' });
        ctxRef.setStatus(`Zalogowano jako ${me.display_name || me.id}${me.product === 'premium' ? ' · Premium' : ' · bez Premium (sterowanie przez aplikację na komputerze)'}`, true);
    } catch (err) { ctxRef.log('Top / konto:', err.message); }
    topTimer = setTimeout(loadTop, 3600 * 1000);
}

// Lokalnie (MPRIS) albo przez Web API — zależnie od tego, co jest dostępne
async function control(apiCall, localCall) {
    if (loggedIn()) {
        try { await apiCall(); setTimeout(poll, 350); return; } catch (err) {
            if (!localCall || !/Premium|NO_ACTIVE_DEVICE|nie jest otwarty/.test(err.message)) throw err;
        }
    }
    if (!localCall) throw new Error('Ta akcja wymaga zalogowania do Spotify (Ustawienia → Wtyczki → Spotify)');
    await localCall();
    setTimeout(poll, 300);
}
const cur = (name) => ctxRef.getVariable(`spotify.${name}`);

const playlistOptions = async (ctx) => {
    ctxRef = ctx;
    if (!loggedIn()) return [{ value: '', label: 'Zaloguj się do Spotify, żeby zobaczyć swoje playlisty (albo wklej link poniżej)' }];
    const out = [{ value: 'spotify:collection:tracks', label: '❤ Polubione utwory' }];
    let url = '/me/playlists?limit=50';
    for (let i = 0; url && i < 6; i++) {
        const page = await api('GET', url);
        for (const p of page.items || []) if (p) out.push({ value: p.uri, label: p.name });
        url = page.next ? page.next.replace(API, '') : null;
    }
    return out;
};

module.exports = {
    id: 'spotify',
    name: 'Spotify',
    description: 'Odtwarzanie, playlisty, polubienia, losowo, powtarzanie, głośność, urządzenia i statystyki.',
    settings: [
        { key: 'guide', type: 'info', label: 'Bez logowania wtyczka steruje aplikacją Spotify na tym komputerze. Logowanie dodaje polubienia, listę playlist, urządzenia (telefon, głośnik) i top utwory.', help: 'Logowanie: developer.spotify.com/dashboard → Create app → w „Redirect URIs” wpisz adres pokazany poniżej, zaznacz „Web API” → zapisz → skopiuj Client ID tutaj → Zaloguj.' },
        { key: 'clientId', label: 'Client ID aplikacji Spotify', type: 'text', default: '', placeholder: 'np. 3f2a…' },
        { key: 'redirect', type: 'info', label: 'Redirect URI do wpisania w aplikacji Spotify: http://127.0.0.1:8191/p/spotify/callback', help: 'Jeśli zmienisz port serwera decka, zmień go też w tym adresie.' },
        { key: 'login', type: 'button', label: 'Zaloguj do Spotify' },
        { key: 'logout', type: 'button', label: 'Wyloguj' },
    ],
    variables: [
        { id: 'connected', label: 'Zalogowano do Spotify (Web API)' },
        { id: 'running', label: 'Spotify jest uruchomiony' },
        { id: 'playing', label: 'Gra' },
        { id: 'state', label: 'Stan (playing / paused / stopped)' },
        { id: 'title', label: 'Tytuł utworu' },
        { id: 'artist', label: 'Wykonawca' },
        { id: 'album', label: 'Album' },
        { id: 'art', label: 'Adres okładki' },
        { id: 'url', label: 'Link do utworu' },
        { id: 'liked', label: 'Utwór polubiony' },
        { id: 'position', label: 'Pozycja (s)' },
        { id: 'duration', label: 'Długość (s)' },
        { id: 'positionText', label: 'Pozycja (m:ss)' },
        { id: 'durationText', label: 'Długość (m:ss)' },
        { id: 'progress', label: 'Postęp utworu (%)' },
        { id: 'shuffle', label: 'Losowo włączone' },
        { id: 'repeat', label: 'Powtarzanie (off / context / track)' },
        { id: 'repeatOn', label: 'Powtarzanie włączone' },
        { id: 'volume', label: 'Głośność Spotify (%)' },
        { id: 'device', label: 'Urządzenie' },
        { id: 'deviceType', label: 'Typ urządzenia' },
        { id: 'account', label: 'Konto' },
        { id: 'topTrack', label: 'Najczęściej słuchany utwór (4 tygodnie)' },
        { id: 'topTracks', label: 'Top 5 utworów' },
        { id: 'topArtist', label: 'Najczęściej słuchany wykonawca' },
        { id: 'topArtists', label: 'Top 5 wykonawców' },
    ],
    start: async (ctx) => {
        ctxRef = ctx;
        stopped = false;
        set({ connected: false, liked: false });
        if (loggedIn()) { ctx.setStatus('Łączenie ze Spotify…', false); loadTop(); } else setOffline();
        poll();
    },
    settingsChanged: async (ctx) => { ctxRef = ctx; if (!loggedIn()) setOffline(); },
    stop: async () => { stopped = true; clearTimeout(pollTimer); clearTimeout(topTimer); },

    commands: {
        login: async (ctx) => {
            ctxRef = ctx;
            const clientId = String(ctx.settings.clientId || '').trim();
            if (!/^[0-9a-f]{32}$/i.test(clientId)) throw new Error('Wklej Client ID (32 znaki) z developer.spotify.com/dashboard');
            const verifier = b64url(crypto.randomBytes(48));
            pkce = { verifier, state: b64url(crypto.randomBytes(16)), redirect: redirectUri(ctx), clientId };
            const url = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
                client_id: clientId, response_type: 'code', redirect_uri: pkce.redirect, scope: SCOPES, state: pkce.state,
                code_challenge_method: 'S256', code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()),
            });
            await ctx.platform.open(url);
            ctx.setStatus('Dokończ logowanie w przeglądarce…', false);
            return 'Otworzono stronę logowania Spotify w przeglądarce';
        },
        logout: async (ctx) => {
            ctxRef = ctx;
            ctx.saveSettings({ refreshToken: '', accessToken: '', expiresAt: 0 });
            clearTimeout(topTimer);
            setOffline();
            set({ account: '', topTrack: '', topTracks: '', topArtist: '', topArtists: '' });
            return 'Wylogowano ze Spotify';
        },
    },

    // Powrót z logowania: http://127.0.0.1:<port>/p/spotify/callback?code=…&state=…
    http: async (req, res, url, ctx) => {
        ctxRef = ctx;
        const page = (title, text, ok) => {
            res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!doctype html><meta charset="utf-8"><title>Pitaya Deck</title><body style="font-family:system-ui;background:#121116;color:#eee;display:grid;place-items:center;height:100vh;margin:0">
                <div style="text-align:center"><div style="font-size:48px">${ok ? '✅' : '⚠️'}</div><h2>${title}</h2><p style="opacity:.7">${text}</p></div>`);
        };
        if (!url.pathname.endsWith('/callback')) return page('Nie znaleziono', '', false);
        if (url.searchParams.get('error')) return page('Logowanie anulowane', url.searchParams.get('error'), false);
        if (!pkce || url.searchParams.get('state') !== pkce.state) return page('Nieważne logowanie', 'Kliknij „Zaloguj do Spotify” w Pitaya Deck jeszcze raz.', false);
        const p = pkce;
        pkce = null;
        try {
            const t = await tokenRequest({ grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: p.redirect, client_id: p.clientId, code_verifier: p.verifier });
            saveTokens(t);
            apiFailures = 0;
            lastTrack = '';
            await loadTop();
            poll();
            page('Połączono ze Spotify', 'Możesz zamknąć tę kartę i wrócić do Pitaya Deck.', true);
        } catch (err) {
            ctx.setStatus(`Logowanie nie powiodło się: ${err.message}`, false);
            page('Logowanie nie powiodło się', err.message, false);
        }
    },

    actions: [
        {
            id: 'play-pause',
            name: 'Graj / pauza',
            fields: [{ key: 'mode', label: 'Co zrobić', type: 'select', default: 'toggle', options: [{ value: 'toggle', label: 'Przełącz' }, { value: 'play', label: 'Graj' }, { value: 'pause', label: 'Pauza' }] }],
            run: async (c, ctx) => {
                ctxRef = ctx;
                const play = c.mode === 'play' || (c.mode === 'toggle' && !cur('playing'));
                await control(() => player('PUT', play ? '/me/player/play' : '/me/player/pause'), () => ctx.platform.media({ toggle: 'play-pause', play: 'play', pause: 'pause' }[c.mode], 'spotify'));
            },
        },
        { id: 'next', name: 'Następny utwór', run: async (c, ctx) => { ctxRef = ctx; await control(() => player('POST', '/me/player/next'), () => ctx.platform.media('next', 'spotify')); } },
        { id: 'previous', name: 'Poprzedni utwór', run: async (c, ctx) => { ctxRef = ctx; await control(() => player('POST', '/me/player/previous'), () => ctx.platform.media('previous', 'spotify')); } },
        {
            id: 'play-playlist',
            name: 'Odtwórz playlistę',
            description: 'Wybierz ze swoich playlist albo wklej link',
            fields: [
                { key: 'playlist', label: 'Playlista', type: 'select', options: playlistOptions },
                { key: 'uri', label: 'albo link / URI (ma pierwszeństwo)', type: 'text', placeholder: 'https://open.spotify.com/playlist/…' },
                { key: 'shuffle', label: 'Losowa kolejność', type: 'select', default: '', options: [{ value: '', label: 'Bez zmian' }, { value: 'on', label: 'Włącz' }, { value: 'off', label: 'Wyłącz' }] },
            ],
            run: async (c, ctx) => {
                ctxRef = ctx;
                const uri = toUri(c.uri) || c.playlist;
                if (!uri) throw new Error('Wybierz playlistę albo wklej link');
                await control(async () => {
                    if (c.shuffle) await player('PUT', `/me/player/shuffle?state=${c.shuffle === 'on'}`).catch(() => {});
                    if (uri === 'spotify:collection:tracks') {
                        const me = await api('GET', '/me');
                        await player('PUT', '/me/player/play', { context_uri: `spotify:user:${me.id}:collection` });
                    } else await player('PUT', '/me/player/play', { context_uri: uri });
                }, async () => {
                    await ctx.platform.openUri(uri === 'spotify:collection:tracks' ? 'spotify:collection:tracks' : uri, 'spotify');
                    if (c.shuffle) await ctx.platform.setShuffle(c.shuffle, 'spotify').catch(() => {});
                });
            },
        },
        {
            id: 'play-uri',
            name: 'Odtwórz utwór / album / wykonawcę',
            fields: [{ key: 'uri', label: 'Link albo URI Spotify', type: 'text', placeholder: 'https://open.spotify.com/track/…' }],
            run: async (c, ctx) => {
                ctxRef = ctx;
                const uri = toUri(c.uri);
                if (!uri) throw new Error('To nie wygląda na link Spotify');
                const single = /^spotify:(track|episode):/.test(uri);
                await control(() => player('PUT', '/me/player/play', single ? { uris: [uri] } : { context_uri: uri }), () => ctx.platform.openUri(uri, 'spotify'));
            },
        },
        {
            id: 'like',
            name: 'Polub utwór',
            description: 'Dodaje lub usuwa obecny utwór z Polubionych',
            fields: [{ key: 'mode', label: 'Co zrobić', type: 'select', default: 'toggle', options: [{ value: 'toggle', label: 'Przełącz' }, { value: 'like', label: 'Polub' }, { value: 'unlike', label: 'Usuń z polubionych' }] }],
            run: async (c, ctx) => {
                ctxRef = ctx;
                if (!loggedIn()) throw new Error('Polubienia wymagają zalogowania do Spotify (Ustawienia → Wtyczki → Spotify)');
                const id = String(cur('uri') || '').split(':')[2] || lastTrack;
                if (!id) throw new Error('Nic teraz nie gra');
                const like = c.mode === 'like' || (c.mode === 'toggle' && !cur('liked'));
                await api(like ? 'PUT' : 'DELETE', `/me/tracks?ids=${id}`);
                set({ liked: like });
                ctx.notify(like ? `❤ Polubiono: ${cur('title')}` : `Usunięto z polubionych: ${cur('title')}`, 'success');
            },
        },
        {
            id: 'shuffle',
            name: 'Losowo',
            fields: [{ key: 'mode', label: 'Co zrobić', type: 'select', default: 'toggle', options: [{ value: 'toggle', label: 'Przełącz' }, { value: 'on', label: 'Włącz' }, { value: 'off', label: 'Wyłącz' }] }],
            run: async (c, ctx) => {
                ctxRef = ctx;
                const on = c.mode === 'on' || (c.mode === 'toggle' && !cur('shuffle'));
                await control(() => player('PUT', `/me/player/shuffle?state=${on}`), () => ctx.platform.setShuffle(on ? 'on' : 'off', 'spotify'));
                set({ shuffle: on });
            },
        },
        {
            id: 'repeat',
            name: 'Powtarzanie',
            fields: [{ key: 'mode', label: 'Tryb', type: 'select', default: 'cycle', options: [{ value: 'cycle', label: 'Następny tryb (wył. → playlista → utwór)' }, { value: 'off', label: 'Wyłącz' }, { value: 'context', label: 'Playlista / album' }, { value: 'track', label: 'Jeden utwór' }] }],
            run: async (c, ctx) => {
                ctxRef = ctx;
                const order = ['off', 'context', 'track'];
                const mode = c.mode === 'cycle' ? order[(order.indexOf(cur('repeat') || 'off') + 1) % 3] : c.mode;
                await control(() => player('PUT', `/me/player/repeat?state=${mode}`), () => ctx.platform.setLoop({ off: 'off', context: 'playlist', track: 'track' }[mode], 'spotify'));
                set({ repeat: mode, repeatOn: mode !== 'off' });
            },
        },
        {
            id: 'volume',
            name: 'Głośność Spotify',
            fields: [
                { key: 'mode', label: 'Co zrobić', type: 'select', default: 'up', options: [{ value: 'up', label: 'Głośniej' }, { value: 'down', label: 'Ciszej' }, { value: 'set', label: 'Ustaw' }] },
                { key: 'value', label: 'O ile / na ile (%)', type: 'number', default: 10, help: 'Na suwaku wpisz {value}' },
            ],
            run: async (c, ctx) => {
                ctxRef = ctx;
                const now = Number(cur('volume')) || 0;
                const v = Math.max(0, Math.min(100, Math.round(c.mode === 'set' ? Number(c.value) : now + (c.mode === 'up' ? 1 : -1) * Number(c.value || 10))));
                await control(() => player('PUT', `/me/player/volume?volume_percent=${v}`), () => ctx.platform.setPlayerVolume(v, 'spotify'));
                set({ volume: v });
            },
        },
        {
            id: 'seek',
            name: 'Przewiń',
            fields: [
                { key: 'mode', label: 'Co zrobić', type: 'select', default: 'forward', options: [{ value: 'forward', label: 'Do przodu' }, { value: 'back', label: 'Do tyłu' }, { value: 'to', label: 'Do pozycji (s)' }, { value: 'restart', label: 'Od początku' }] },
                { key: 'seconds', label: 'Sekundy', type: 'number', default: 10 },
            ],
            run: async (c, ctx) => {
                ctxRef = ctx;
                const pos = Number(cur('position')) || 0;
                const s = Number(c.seconds) || 0;
                const target = Math.max(0, { forward: pos + s, back: pos - s, to: s, restart: 0 }[c.mode]);
                await control(() => player('PUT', `/me/player/seek?position_ms=${Math.round(target * 1000)}`), () => ctx.platform.seek(target - pos, 'spotify'));
            },
        },
        {
            id: 'device',
            name: 'Przełącz urządzenie',
            description: 'Przenosi odtwarzanie na telefon, głośnik albo komputer',
            fields: [
                { key: 'device', label: 'Urządzenie', type: 'select', options: async (ctx) => {
                    ctxRef = ctx;
                    if (!loggedIn()) return [{ value: '', label: 'Zaloguj się do Spotify' }];
                    const { devices = [] } = (await api('GET', '/me/player/devices')) || {};
                    return devices.map((d) => ({ value: d.name, label: `${d.name} (${d.type})${d.is_active ? ' · teraz' : ''}` }));
                } },
                { key: 'play', label: 'Graj po przełączeniu', type: 'bool', default: true },
            ],
            run: async (c, ctx) => {
                ctxRef = ctx;
                if (!loggedIn()) throw new Error('Przełączanie urządzeń wymaga zalogowania do Spotify');
                const { devices = [] } = (await api('GET', '/me/player/devices')) || {};
                // Zapisujemy nazwę, bo identyfikatory urządzeń Spotify potrafią się zmieniać
                const d = devices.find((x) => x.name === c.device || x.id === c.device);
                if (!d) throw new Error(`Urządzenie „${c.device}” nie jest teraz dostępne w Spotify`);
                await api('PUT', '/me/player', { device_ids: [d.id], play: Boolean(c.play) });
                setTimeout(poll, 600);
            },
        },
        {
            id: 'open',
            name: 'Otwórz aplikację Spotify',
            run: async (c, ctx) => { await ctx.platform.open('spotify:'); },
        },
    ],
};
