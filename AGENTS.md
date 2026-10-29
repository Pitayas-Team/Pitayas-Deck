# Pitaya Deck – telefon, tablet lub przeglądarka jako panel przycisków do komputera

> Plik przekazania projektu między narzędziami AI (Claude Code ⇄ Antigravity ⇄ inne).
> Przeczytaj go w całości, zanim cokolwiek zmienisz. **Nie ma tu żadnych sekretów** – hasła i klucze są poza repozytorium i nie wolno ich kopiować do kodu, logów ani rozmów.
> Stan na: 2026-10-29. Jeśli zmieniasz architekturę albo sposób wdrażania, zaktualizuj ten plik.

## 1. Czym to jest
**Pitaya Deck** zamienia telefon, tablet albo dowolną przeglądarkę w panel przycisków do komputera (skróty, makra, sterowanie multimediami, własne widżety, dodatki). Aplikacja na komputerze trzyma układ i wykonuje akcje; urządzenie pokazuje przyciski przez WebSocket (`ws://komputer:8191/ws`) — w przeglądarce (`client/`) albo w module Deck aplikacji Pitayas.

## 2. Zasady od właściciela
- Nowe urządzenia wymagają zatwierdzenia na komputerze (gdy włączone `requireApproval`).
- Polecenia do innych aplikacji tylko z białej listy `APP_COMMANDS`; nie dopuszczaj dowolnych poleceń z telefonu.
- Zmiany protokołu WebSocket muszą zostać zgodne z modułem Deck na telefonie (starsze wersje są w użyciu).

## 3. Gdzie co leży i jak uruchamiać
`npm install`, `npm start`. Paczki: `npm run dist` (AppImage + RPM; Windows przez Pitayas Admin). Indeks dodatków: `npm run plugins-index`. Wydania robi Pitayas Admin.

## 4. Struktura
```
main.js                 okno, tray, uruchomienie serwera i dodatków
deck/server.js          HTTP + WebSocket: stan dla urządzeń, obrazy (/img z CORS), okładki (/art), przekaźnik do innych aplikacji
deck/store.js           data/deck.json (profile, foldery, widżety, urządzenia, ustawienia)
deck/runtime.js         wykonywanie akcji i dodatków; deck/plugins/ – wbudowane (media, system, http, sound, deck)
plugins/                dodatki użytkownika: gear-*, discord, obs, spotify, home-assistant, timer, weather; plugins/index.json
client/                 strona dla przeglądarki;  editor/ – edytor układu
shared/                 render.js, render.css, lucide.json – rysowanie widżetów (wspólne z modułem w Pitayas-Mobile)
```

## 5. Testowanie
Serwer można uruchomić bez okna (`createServer` w testach) i łączyć się klientem `ws`. Okno i integracje (OBS, Spotify, Gear) wymagają prawdziwych usług/sprzętu.

## 6. Zasady wspólne
- **Język:** interfejs, komentarze, opisy zmian i odpowiedzi po polsku. Marka „Pitayas”; kolory: róż pitai `#ff4fa6`, ciemne tło `#121116`.
- **Wygląd:** matowy, spokojny, czytelny — **nie „AI slop”**: bez świecących gradientów w tytułach, poświat pod przyciskami i udawanego szkła w CSS. Prawdziwe szkło tylko natywne (iOS 26) na elementach, które się nie ruszają.
- **Pitaya Core:** folder `core/` w aplikacji to **kopia** z projektu `Pitayas-Core`. Nie edytuj jej w aplikacji — zmieniaj w `Pitayas-Core` i uruchom `~/Pitayas-Projects/ADMIN/sync-core.sh`. Każda aplikacja rejestruje się w `~/.config/Pitayas/apps/<id>.json` i wystawia kanał sterowania (kontrakt Core 0.2, dla przyszłego Pitaya Hub).
- **Lista zmian:** po **każdej** zmianie w aplikacji dopisz wpis: `node ~/Pitayas-Projects/ADMIN/changelog.js add <id> <feature|fix|change> "opis po polsku"`. `<id>` = nazwa folderu bez „Pitayas-”, małymi literami (np. `screen`, `mobile`, `accounts`, `admin`, `website`). Wpisy trafiają do opisu wydania na GitHubie.
- **Git:** commity jako właściciel (`Pitayas <inbox@rakunek.com>`), krótki opis po polsku, **bez** `Co-Authored-By` i wzmianek o narzędziach AI. Push tylko na bieżącą gałąź, bez force-push bez zgody.
- **Budowanie i wydania:** nie buduj, nie pakuj i nie publikuj wersji bez wyraźnej prośby właściciela. Wydania robi **Pitayas Admin** (`ADMIN/cli.js`, GitHub Releases organizacji Pitayas-Team). Po budowie nie uruchamiaj aplikacji właściciela.
- **Sekrety:** hasła, tokeny, klucze i pliki `.env` nigdy do kodu, logów, commitów ani rozmów.
- **Uczciwość:** nie masz telefonu, iPhone'a ani Windowsa — wyraźnie napisz, czego nie dało się sprawdzić, zamiast twierdzić, że działa.
- **Praca na serwerze:** projekty leżą w `~/Pitayas-Projects` na serwerze rakunek.com (kopia na komputerze właściciela to zapas). Nie startuj zbędnych procesów w tle ani dodatkowych sesji/agentów.
