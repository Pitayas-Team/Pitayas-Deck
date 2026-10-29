# Instrukcje dla Antigravity / Gemini

Cały kontekst projektu **Pitaya Deck** (cel, zasady od właściciela, struktura, uruchamianie i wdrażanie, testowanie, znane ograniczenia) jest w pliku **`AGENTS.md`** w tym samym katalogu – przeczytaj go najpierw i traktuj jako obowiązujący.

Najważniejsze w skrócie:
- Electron + serwer HTTP/WebSocket (domyślnie port 8191); dane w jednym pliku `data/deck.json` (Core).
- `shared/render.js` i `render.css` są też kopiowane do modułu Deck w `Pitayas-Mobile` — zmieniając je, odśwież i wydaj moduł.
- Deck przekazuje polecenia telefonu do innych aplikacji (np. Gear) przez `{t:"app"}` — tylko z listy `APP_COMMANDS` w `deck/server.js`.
- Wszystko po polsku; wygląd matowy i spokojny, nie „AI slop”.
- Po każdej zmianie dopisz wpis w liście zmian: `node ~/Pitayas-Projects/ADMIN/changelog.js add <id> <feature|fix|change> "opis"`.
- Commity jako właściciel, **bez** „Co-Authored-By” i wzmianek o AI. Nie buduj ani nie publikuj wersji bez prośby.
- Nigdy nie kopiuj sekretów (hasła, tokeny, `.env`) do kodu, logów ani czatu. Napisz, czego nie mogłeś sprawdzić.
