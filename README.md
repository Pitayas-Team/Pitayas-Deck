<h2 align="center"><u>Pitaya Deck</u></h2>


<p align="center">
  <img src="build/icons/512x512.png" width="300">
</p>
<h4 align="center"> Telefon, tablet albo dowolna przeglądarka jako panel przycisków do komputera </h4>

<p align="center">
    <img src="https://img.shields.io/github/stars/Pitayas-Team/Pitayas-Deck?style=for-the-badge&color=orange">
    <img src="https://img.shields.io/github/forks/Pitayas-Team/Pitayas-Deck?style=for-the-badge&color=purple">
    <img src="https://img.shields.io/github/issues/Pitayas-Team/Pitayas-Deck?style=for-the-badge&color=red">
<br>
    <img src="https://img.shields.io/badge/Open%20Source-Yes-orange?style=flat-square">
    <img src="https://img.shields.io/badge/Maintained-Yes-cyan?style=flat-square">
    <img src="https://img.shields.io/badge/Made%20In-Poland (Silesia)-green?style=flat-square">
</p>

### [+] Opis
Pitaya Deck zamienia telefon, tablet albo dowolną przeglądarkę w panel przycisków do komputera — jak Stream Deck, ale bez dodatkowego sprzętu. Część rodziny aplikacji **Pitayas**, działa na Linuxie i Windowsie.

### [+] Instalacja
Pobierz najnowszą wersję z [Releases](https://github.com/Pitayas-Team/Pitayas-Deck/releases):
- `.rpm` — Fedora / Nobara: otwórz plik albo `sudo dnf install ./plik.rpm`
- `.AppImage` — każdy Linux: `chmod +x` i uruchom

Na telefonie nic nie instalujesz: zeskanuj kod QR z aplikacji na komputerze.

### [+] Co potrafi
- **Bez dodatkowej aplikacji na telefonie** — zeskanuj kod QR, zatwierdź urządzenie na komputerze i gotowe. „Dodaj do ekranu głównego” otwiera deck jak aplikację na pełnym ekranie.
- **Profile i foldery** — dowolny rozmiar siatki (do 12×10), zagnieżdżone foldery, każde urządzenie może mieć inny profil.
- **Przyciski** — ikony (wbudowane, emoji albo własne obrazy), kolory, napisy ze zmiennymi (`CPU {system.cpu}%`), stan włączony/wyłączony z innym wyglądem.
- **Akcje** na naciśnięcie, przytrzymanie i puszczenie — dowolnie długie sekwencje z opóźnieniami.
- **Zmienne** — godzina, data, procesor, pamięć, głośność, aktualny utwór, scena i stan OBS oraz własne zmienne (liczniki, przełączniki).
- **Wtyczki** — wbudowane i własne (`~/.config/Pitayas/Deck/data/plugins`), instrukcja w [docs/WTYCZKI.md](docs/WTYCZKI.md).

### [+] Wbudowane wtyczki
| Wtyczka | Akcje |
| --- | --- |
| **Deck** | otwórz folder, wstecz, ekran startowy, przełącz profil, ustaw / przełącz / zwiększ zmienną, czekaj, komunikat na urządzeniu |
| **System** | skrót klawiszowy, wpisz tekst (z polskimi znakami), otwórz program / plik / link, uruchom polecenie, zablokuj ekran, powiadomienie |
| **Media i dźwięk** | graj / pauza / następny / poprzedni (Spotify, przeglądarka, VLC…), głośność, mikrofon |
| **OBS Studio** | przełącz scenę, transmisja, nagrywanie, powtórka, wycisz źródło, pokaż / ukryj źródło, wirtualna kamera |
| **Soundboard** | odtwórz dźwięk, zatrzymaj dźwięki |
| **Internet i dom** | zapytanie HTTP / webhook, Home Assistant |

### [+] Wymagania
- Linux (Wayland albo X11) lub Windows. Telefon w tej samej sieci co komputer (albo w tej samej sieci Tailscale).
- **Skróty klawiszowe na Linuxie:** Pitaya Deck tworzy wirtualną klawiaturę przez `/dev/uinput` (działa wszędzie, także na Waylandzie). Gdy nie ma do niego dostępu, używa `ydotool`, `xdotool` albo `wtype`. Stan widać w *Ustawienia → Ogólne → Klawiatura*.
- **Odtwarzacze:** sterowanie przez MPRIS (D-Bus), głośność przez PipeWire (`wpctl`) albo PulseAudio (`pactl`).
- **OBS:** OBS 28+ → *Narzędzia → Ustawienia serwera WebSocket* → włącz serwer i wpisz hasło w ustawieniach wtyczki.

### [+] Dane
Profile, przyciski, obrazy i ustawienia są w `~/.config/Pitayas/Deck/` (Windows: `%APPDATA%\Pitayas\Deck`) — wspólny folder aplikacji Pitayas (Pitaya Core). Kopię zapasową zrobisz w *Ustawienia → Ogólne → Eksportuj deck*.

### [+] Uruchomienie ze źródeł
```bash
npm install
npm start
```

### [+] Licencja
MIT. Pitaya Deck jest napisany od zera — nie zawiera kodu, ikon ani materiałów innych programów tego typu.
