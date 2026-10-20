// Wtyczka „Discord”: wyciszanie mikrofonu i dźwięku przez skróty klawiszowe Discorda.
// W Discordzie: Ustawienia → Skróty klawiszowe → dodaj „Przełącz wyciszenie” i „Przełącz wyłączenie dźwięku”
// z tymi samymi skrótami co w ustawieniach wtyczki (domyślnie ctrl+shift+f9 i ctrl+shift+f10).
module.exports = {
    id: 'discord',
    name: 'Discord',
    description: 'Wycisz mikrofon i dźwięk w Discordzie (przez skróty klawiszowe Discorda).',
    settings: [
        { key: 'muteKey', label: 'Skrót „Przełącz wyciszenie” w Discordzie', type: 'text', default: 'ctrl+shift+f9' },
        { key: 'deafenKey', label: 'Skrót „Przełącz wyłączenie dźwięku” w Discordzie', type: 'text', default: 'ctrl+shift+f10' },
    ],
    variables: [{ id: 'muted', label: 'Mikrofon w Discordzie wyciszony (wg decka)' }, { id: 'deafened', label: 'Dźwięk w Discordzie wyłączony (wg decka)' }],
    start: async (ctx) => { ctx.setVariable('muted', false); ctx.setVariable('deafened', false); },
    actions: [
        {
            id: 'mute',
            name: 'Wycisz mikrofon',
            description: 'Naciska skrót „Przełącz wyciszenie” Discorda',
            run: async (c, ctx) => {
                await ctx.platform.pressCombo(ctx.settings.muteKey);
                ctx.setVariable('muted', !ctx.getVariable('discord.muted'));
            },
        },
        {
            id: 'deafen',
            name: 'Wyłącz dźwięk',
            description: 'Naciska skrót „Przełącz wyłączenie dźwięku” Discorda',
            run: async (c, ctx) => {
                await ctx.platform.pressCombo(ctx.settings.deafenKey);
                const d = !ctx.getVariable('discord.deafened');
                ctx.setVariable('deafened', d);
                if (d) ctx.setVariable('muted', true);
            },
        },
    ],
};
