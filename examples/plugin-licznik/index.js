// Przykładowa wtyczka Pitaya Deck: licznik z krokiem ustawianym w ustawieniach wtyczki.
// Skopiuj ten folder do ~/.config/Pitayas/Deck/data/plugins/ i uruchom Pitaya Deck ponownie.
// Na przycisku wpisz napis „Licznik: {licznik.wartosc}”.
let value = 0;

module.exports = {
    id: 'licznik',
    name: 'Licznik (przykład)',
    description: 'Przykładowa wtyczka — liczy naciśnięcia.',
    settings: [{ key: 'step', label: 'Krok', type: 'number', default: 1 }],
    variables: [{ id: 'wartosc', label: 'Wartość licznika' }],
    start: async (ctx) => ctx.setVariable('wartosc', value),
    actions: [
        {
            id: 'plus',
            name: 'Dodaj',
            run: async (config, ctx) => {
                value += Number(ctx.settings.step) || 1;
                ctx.setVariable('wartosc', value);
            },
        },
        {
            id: 'reset',
            name: 'Wyzeruj',
            fields: [{ key: 'notify', label: 'Pokaż komunikat na telefonie', type: 'bool', default: true }],
            run: async (config, ctx) => {
                value = 0;
                ctx.setVariable('wartosc', value);
                if (config.notify) ctx.deck.toast(ctx.device, 'Licznik wyzerowany');
            },
        },
    ],
};
