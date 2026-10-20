// Wtyczka „Muzyka i dźwięk”: Spotify, przeglądarka, VLC… (MPRIS), głośność systemu i mikrofon.
let timer = null;
let busy = false;

const playerField = { key: 'player', label: 'Odtwarzacz', type: 'select', default: '', help: 'Puste = ten, który właśnie gra', options: async (ctx) => [{ value: '', label: 'Automatycznie (ten, który gra)' }, ...(await ctx.platform.listPlayers().catch(() => []))] };

async function poll(ctx) {
    if (busy) return;
    busy = true;
    try {
        const out = await ctx.platform.getVolume('sink').catch(() => null);
        if (out && out.volume !== null) { ctx.setVariable('volume', out.volume); ctx.setVariable('muted', out.muted); }
        const mic = await ctx.platform.getVolume('source').catch(() => null);
        if (mic && mic.muted !== null) { ctx.setVariable('micMuted', mic.muted); ctx.setVariable('micVolume', mic.volume); }
        const np = await ctx.platform.nowPlaying(ctx.settings.player || '').catch(() => null);
        if (np) {
            ctx.setVariable('title', np.title);
            ctx.setVariable('artist', np.artist);
            ctx.setVariable('album', np.album);
            ctx.setVariable('artUrl', np.artUrl);
            ctx.setVariable('playing', np.status === 'Playing');
            ctx.setVariable('player', np.player);
            ctx.setVariable('position', np.position);
            ctx.setVariable('length', np.length);
            ctx.setVariable('shuffle', np.shuffle);
            if (np.volume !== null && np.volume !== undefined) ctx.setVariable('playerVolume', np.volume);
            ctx.setVariable('repeatOn', np.loop !== 'None' && np.loop !== '');
            ctx.setVariable('loop', { None: 'wył.', Track: 'utwór', Playlist: 'playlista' }[np.loop] || np.loop);
            ctx.setVariable('nowPlaying', np.title ? (np.artist ? `${np.artist} – ${np.title}` : np.title) : '');
        }
    } finally {
        busy = false;
    }
}
const after = (ctx) => setTimeout(() => poll(ctx), 250);

module.exports = {
    id: 'media',
    name: 'Muzyka i dźwięk',
    description: 'Spotify i inne odtwarzacze, głośność systemu, mikrofon.',
    settings: [
        { key: 'player', label: 'Odtwarzacz dla zmiennych i widżetu (puste = ten, który gra)', type: 'text', placeholder: 'np. spotify' },
    ],
    variables: [
        { id: 'volume', label: 'Głośność %' },
        { id: 'muted', label: 'Dźwięk wyciszony' },
        { id: 'micVolume', label: 'Głośność mikrofonu %' },
        { id: 'micMuted', label: 'Mikrofon wyciszony' },
        { id: 'nowPlaying', label: 'Teraz gra (wykonawca – tytuł)' },
        { id: 'title', label: 'Tytuł utworu' },
        { id: 'artist', label: 'Wykonawca' },
        { id: 'album', label: 'Album' },
        { id: 'artUrl', label: 'Okładka (adres)' },
        { id: 'playing', label: 'Odtwarzanie trwa' },
        { id: 'position', label: 'Pozycja (s)' },
        { id: 'length', label: 'Długość utworu (s)' },
        { id: 'shuffle', label: 'Losowo' },
        { id: 'playerVolume', label: 'Głośność odtwarzacza %' },
        { id: 'loop', label: 'Powtarzanie' },
        { id: 'repeatOn', label: 'Powtarzanie włączone' },
        { id: 'player', label: 'Odtwarzacz' },
    ],
    start: async (ctx) => {
        await poll(ctx);
        timer = setInterval(() => poll(ctx), 1000);
    },
    stop: async () => clearInterval(timer),
    actions: [
        {
            id: 'media',
            name: 'Odtwarzanie',
            fields: [
                { key: 'command', label: 'Polecenie', type: 'select', default: 'play-pause', options: [
                    { value: 'play-pause', label: 'Graj / pauza' }, { value: 'next', label: 'Następny' },
                    { value: 'previous', label: 'Poprzedni' }, { value: 'stop', label: 'Stop' },
                    { value: 'play', label: 'Graj' }, { value: 'pause', label: 'Pauza' },
                ] },
                playerField,
            ],
            run: async (c, ctx) => { await ctx.platform.media(c.command, c.player); after(ctx); },
        },
        {
            id: 'play-uri',
            name: 'Odtwórz playlistę, album lub utwór',
            description: 'Link ze Spotify: Udostępnij → Kopiuj link',
            fields: [
                { key: 'uri', label: 'Link albo identyfikator', type: 'text', placeholder: 'https://open.spotify.com/playlist/…' },
                playerField,
            ],
            run: async (c, ctx) => { await ctx.platform.openUri(c.uri, c.player); after(ctx); },
        },
        {
            id: 'shuffle',
            name: 'Losowo',
            fields: [
                { key: 'mode', label: 'Co zrobić', type: 'select', default: 'toggle', options: [{ value: 'toggle', label: 'Przełącz' }, { value: 'on', label: 'Włącz' }, { value: 'off', label: 'Wyłącz' }] },
                playerField,
            ],
            run: async (c, ctx) => { await ctx.platform.setShuffle(c.mode, c.player); after(ctx); },
        },
        {
            id: 'repeat',
            name: 'Powtarzanie',
            fields: [
                { key: 'mode', label: 'Tryb', type: 'select', default: 'cycle', options: [
                    { value: 'cycle', label: 'Następny tryb (wył. → playlista → utwór)' }, { value: 'off', label: 'Wyłącz' },
                    { value: 'playlist', label: 'Playlista' }, { value: 'track', label: 'Utwór' },
                ] },
                playerField,
            ],
            run: async (c, ctx) => { await ctx.platform.setLoop(c.mode, c.player); after(ctx); },
        },
        {
            id: 'seek',
            name: 'Przewiń',
            fields: [
                { key: 'seconds', label: 'Sekundy (ujemne = do tyłu)', type: 'number', default: 10 },
                playerField,
            ],
            run: async (c, ctx) => { await ctx.platform.seek(parseFloat(c.seconds) || 0, c.player); after(ctx); },
        },
        {
            id: 'player-volume',
            name: 'Głośność odtwarzacza',
            description: 'Tylko w samym odtwarzaczu (np. Spotify), bez zmiany głośności systemu',
            fields: [
                { key: 'value', label: 'Poziom (%)', type: 'number', default: 50 },
                playerField,
            ],
            run: async (c, ctx) => ctx.platform.setPlayerVolume(parseFloat(c.value) || 0, c.player),
        },
        {
            id: 'volume',
            name: 'Głośność systemu',
            fields: [
                { key: 'mode', label: 'Co zrobić', type: 'select', default: 'up', options: [
                    { value: 'up', label: 'Głośniej' }, { value: 'down', label: 'Ciszej' },
                    { value: 'set', label: 'Ustaw na' }, { value: 'mute', label: 'Wycisz / przywróć' },
                ] },
                { key: 'step', label: 'Krok (%)', type: 'number', default: 5 },
                { key: 'value', label: 'Poziom dla „Ustaw na” (%)', type: 'number', default: 50 },
            ],
            run: async (c, ctx) => {
                await ctx.platform.setVolume(c.mode, parseInt(c.step, 10) || 5, parseInt(c.value, 10) || 0);
                await poll(ctx);
            },
        },
        {
            id: 'mic',
            name: 'Mikrofon',
            fields: [{ key: 'mode', label: 'Co zrobić', type: 'select', default: 'toggle', options: [
                { value: 'toggle', label: 'Wycisz / włącz' }, { value: 'mute', label: 'Wycisz' }, { value: 'unmute', label: 'Włącz' },
            ] }],
            run: async (c, ctx) => { await ctx.platform.setMic(c.mode); await poll(ctx); },
        },
        {
            id: 'mic-volume',
            name: 'Głośność mikrofonu',
            fields: [{ key: 'value', label: 'Poziom (%)', type: 'number', default: 80 }],
            run: async (c, ctx) => { await ctx.platform.setMicVolume(parseFloat(c.value) || 0); await poll(ctx); },
        },
    ],
};
