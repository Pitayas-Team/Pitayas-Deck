# Własne wtyczki Pitaya Deck

Wtyczka to folder z plikiem `index.js`, wrzucony do:

- Linux: `~/.config/Pitayas/Deck/data/plugins/<nazwa>/index.js`
- Windows: `%APPDATA%\Pitayas\Deck\data\plugins\<nazwa>\index.js`

Folder otworzysz w *Ustawienia → Wtyczki → Folder wtyczek*. Po dodaniu wtyczki uruchom Pitaya Deck ponownie.

## Najprostsza wtyczka

```js
module.exports = {
    id: 'powitanie',
    name: 'Powitanie',
    description: 'Przykładowa wtyczka',
    actions: [
        {
            id: 'hello',
            name: 'Przywitaj się',
            fields: [{ key: 'imie', label: 'Imię', type: 'text', default: 'świecie' }],
            run: async (config, ctx) => {
                ctx.desktopNotify(`Cześć, ${config.imie}!`);
            },
        },
    ],
};
```

Gotowy przykład z ustawieniami i zmienną: [examples/plugin-licznik](../examples/plugin-licznik/index.js).

## Opis wtyczki

| Pole | Opis |
| --- | --- |
| `id` | unikalny identyfikator (małe litery, bez spacji); zmienne wtyczki mają nazwy `<id>.<zmienna>` |
| `name`, `description` | widoczne w edytorze |
| `settings` | ustawienia wtyczki: `[{ key, label, type, default, placeholder }]` (typy: `text`, `password`, `number`, `bool`) |
| `variables` | zmienne, które wtyczka ustawia: `[{ id, label }]` |
| `actions` | akcje do przypisania przyciskom (niżej) |
| `start(ctx)` | wywoływane przy starcie (np. połączenie z usługą, odpytywanie co sekundę) |
| `stop()` | przy zamykaniu aplikacji |
| `settingsChanged(ctx)` | po zmianie ustawień wtyczki w edytorze |

## Akcje

```js
{
    id: 'scena',
    name: 'Przełącz scenę',
    description: 'Krótki opis pod nazwą',
    fields: [
        { key: 'scena', label: 'Scena', type: 'select', options: async (ctx) => [{ value: 'a', label: 'Scena A' }] },
    ],
    run: async (config, ctx) => { /* … */ },
}
```

Typy pól: `text`, `textarea`, `number`, `bool`, `select` (lista `options` albo funkcja zwracająca listę), `file` (z przyciskiem „Wybierz…”), `hotkey` (nagrywanie skrótu), `password`.

W polach tekstowych użytkownik może wpisywać zmienne, np. `{system.time}` — do `run` trafia już gotowy tekst.
Akcja, która rzuci wyjątek, pokaże jego treść w edytorze; kolejne akcje przycisku i tak się wykonają.

## Kontekst `ctx`

| | |
| --- | --- |
| `ctx.settings` | aktualne ustawienia wtyczki |
| `ctx.setVariable(id, wartość)` | ustawia zmienną `<id wtyczki>.<id>` — przyciski z nią odświeżą się same |
| `ctx.getVariable(nazwa)` | odczyt dowolnej zmiennej (`system.cpu`, `licznik`…) |
| `ctx.setUserVariable(nazwa, wartość)` | zmienna użytkownika (zapisywana na dysku) |
| `ctx.platform` | klawiatura (`pressCombo('ctrl+c')`, `typeText('…')`), multimedia (`media('next')`), głośność, `open(ścieżka/URL)`, `runCommand(…)`, `playSound(plik)` |
| `ctx.deck` | `openFolder(ctx.device, id)`, `back(ctx.device)`, `home(ctx.device)`, `switchProfile(ctx.device, id)`, `toast(ctx.device, tekst)` |
| `ctx.device` | urządzenie, które nacisnęło przycisk (`'editor'` przy testowaniu w edytorze) |
| `ctx.notify(tekst, 'error')` | komunikat w edytorze |
| `ctx.desktopNotify(tekst)` | powiadomienie systemowe |
| `ctx.log(...)` | wpis w `logs/app.log` |
