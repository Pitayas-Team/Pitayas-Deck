// Wtyczka „Soundboard”: odtwarzanie efektów dźwiękowych na komputerze.
module.exports = {
    id: 'sound',
    name: 'Soundboard',
    description: 'Odtwarzaj dźwięki (MP3, WAV, OGG…) z przycisków.',
    actions: [
        {
            id: 'play',
            name: 'Odtwórz dźwięk',
            fields: [
                { key: 'file', label: 'Plik dźwiękowy', type: 'file', filters: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'opus'] },
                { key: 'volume', label: 'Głośność (%)', type: 'number', default: 100 },
                { key: 'exclusive', label: 'Zatrzymaj inne dźwięki', type: 'bool', default: false },
            ],
            run: async (c, ctx) => {
                if (c.exclusive) ctx.platform.stopSounds();
                ctx.platform.playSound(c.file, Math.max(0, Math.min(200, parseInt(c.volume, 10) || 100)));
            },
        },
        { id: 'stop', name: 'Zatrzymaj wszystkie dźwięki', run: async (c, ctx) => ctx.platform.stopSounds() },
    ],
};
