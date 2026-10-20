// Wtyczka „Media”: odtwarzanie (Spotify, przeglądarka, VLC… przez MPRIS), głośność i mikrofon.
let timer = null;
let busy = false;

async function poll(ctx) {
    if (busy) return;
    busy = true;
    try {
        const out = await ctx.platform.getVolume('sink').catch(() => null);
        if (out && out.volume !== null) { ctx.setVariable('volume', out.volume); ctx.setVariable('muted', out.muted); }
        const mic = await ctx.platform.getVolume('source').catch(() => null);
        if (mic && mic.muted !== null) ctx.setVariable('micMuted', mic.muted);
        const np = await ctx.platform.nowPlaying().catch(() => null);
        if (np) {
            ctx.setVariable('title', np.title);
            ctx.setVariable('artist', np.artist);
            ctx.setVariable('playing', np.status === 'Playing');
            ctx.setVariable('player', np.player);
            ctx.setVariable('nowPlaying', np.title ? (np.artist ? `${np.artist} – ${np.title}` : np.title) : '');
        }
    } finally {
        busy = false;
    }
}

module.exports = {
    id: 'media',
    name: 'Media i dźwięk',
    description: 'Odtwarzanie muzyki i filmów, głośność, mikrofon.',
    variables: [
        { id: 'volume', label: 'Głośność %' },
        { id: 'muted', label: 'Dźwięk wyciszony' },
        { id: 'micMuted', label: 'Mikrofon wyciszony' },
        { id: 'nowPlaying', label: 'Teraz gra (wykonawca – tytuł)' },
        { id: 'title', label: 'Tytuł utworu' },
        { id: 'artist', label: 'Wykonawca' },
        { id: 'playing', label: 'Odtwarzanie trwa' },
        { id: 'player', label: 'Odtwarzacz' },
    ],
    start: async (ctx) => {
        await poll(ctx);
        timer = setInterval(() => poll(ctx), 1500);
    },
    stop: async () => clearInterval(timer),
    actions: [
        {
            id: 'media',
            name: 'Odtwarzanie',
            fields: [{
                key: 'command', label: 'Polecenie', type: 'select', default: 'play-pause', options: [
                    { value: 'play-pause', label: 'Graj / pauza' }, { value: 'next', label: 'Następny' },
                    { value: 'previous', label: 'Poprzedni' }, { value: 'stop', label: 'Stop' },
                    { value: 'play', label: 'Graj' }, { value: 'pause', label: 'Pauza' },
                ],
            }],
            run: async (c, ctx) => { await ctx.platform.media(c.command); setTimeout(() => poll(ctx), 300); },
        },
        {
            id: 'volume',
            name: 'Głośność',
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
    ],
};
