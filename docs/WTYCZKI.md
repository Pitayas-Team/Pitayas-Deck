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

## Sklep z dodatkami

Dodatek do sklepu to zwykła wtyczka z dodatkowym plikiem `plugin.json` obok `index.js`:

```json
{
  "id": "spotify", "name": "Spotify", "version": "1.1.0", "author": "Pitayas", "license": "MIT",
  "icon": "music", "color": "#1db954", "category": "music",
  "description": "Krótki opis na karcie",
  "longDescription": "Dłuższy opis na stronie dodatku",
  "features": ["Co dodaje — lista punktów"],
  "tags": ["muzyka"],
  "changelog": [{ "version": "1.1.0", "notes": "Co się zmieniło" }]
}
```

- `icon` to nazwa ikony [Lucide](https://lucide.dev/icons), `category`: `music`, `communication`, `streaming`, `smart-home`, `productivity`, `system`, `gaming`.
- Oficjalne dodatki leżą w folderze [`plugins/`](../plugins) tego repozytorium. Aplikacja pobiera spis `plugins/index.json` i pliki dodatków prosto z GitHuba (każdy plik sprawdza sumą sha256) i instaluje je do `~/.config/Pitayas/Deck/data/plugins/<id>/`. Kopia folderu jest też w aplikacji, na wypadek braku internetu.
- Po zmianie dodatku podbij `version` w jego `plugin.json` i uruchom `npm run plugins-index`.
- Własny sklep: w oknie sklepu wpisz adres katalogu. Pod `<adres>/index.json` musi być
  `{ "plugins": [ { …plugin.json…, "package": { "url": "https://…/spotify-1.1.0.tgz", "sha256": "…" } } ] }`.
  Paczka `.tgz` zawiera folder z `plugin.json` i `index.js`; suma `sha256` jest sprawdzana przed instalacją.
- Wtyczki z folderu danych mogą używać bibliotek aplikacji (np. `require('ws')`).

## Bloki

Akcje przycisku to bloki, jak w Macro Deck 3. Wtyczka dostarcza bloki akcji; logikę (Jeśli, Przełącz,
Powtórz, Dopóki, Czekaj, Przerwij, Zatrzymaj) daje sam deck. W polach akcji działają zmienne, np. `{value}`
z suwaka, `{index}` w pętli albo `{state}` w wyzwalaczu „Zmiana stanu”.
