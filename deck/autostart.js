// Uruchamianie przy starcie systemu: z oknem albo w tle (tylko ikona w zasobniku, deck działa dla telefonów).
// Linux: plik .desktop w ~/.config/autostart; Windows i macOS: elementy logowania systemu.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron');

const HIDDEN_ARG = '--hidden';
const MODES = ['off', 'window', 'background'];

// Co uruchomić: AppImage (stała ścieżka zamiast tymczasowego /tmp/.mount_*), wersja przenośna Windowsa albo zwykły plik
function command() {
    if (process.env.APPIMAGE) return [process.env.APPIMAGE];
    if (process.env.PORTABLE_EXECUTABLE_FILE) return [process.env.PORTABLE_EXECUTABLE_FILE];
    if (!app.isPackaged) return [process.execPath, app.getAppPath()];
    return [process.execPath];
}

const linuxFile = () => path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart', 'pitaya-deck.desktop');
const quote = (s) => (/[\s"'\\]/.test(s) ? `"${s.replace(/(["\\$`])/g, '\\$1')}"` : s);

function apply(mode) {
    if (!MODES.includes(mode)) mode = 'off';
    const args = mode === 'background' ? [HIDDEN_ARG] : [];
    if (process.platform === 'linux') {
        const file = linuxFile();
        if (mode === 'off') { fs.rmSync(file, { force: true }); return; }
        const cmd = command();
        args.unshift('--no-sandbox');   // jak w pliku .desktop z paczki RPM
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, [
            '[Desktop Entry]',
            'Type=Application',
            'Name=Pitaya Deck',
            'Comment=Telefon jako Stream Deck',
            `Exec=${[...cmd, ...args].map(quote).join(' ')}`,
            'Icon=pitaya-deck',
            'Terminal=false',
            'X-GNOME-Autostart-enabled=true',
            '',
        ].join('\n'));
        return;
    }
    const [exe, ...rest] = command();
    app.setLoginItemSettings({ openAtLogin: mode !== 'off', path: exe, args: [...rest, ...args], openAsHidden: mode === 'background' });
}

// Czy aplikacja wystartowała „w tle” (z autostartu)
const startedHidden = () => process.argv.includes(HIDDEN_ARG) || (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAsHidden);

module.exports = { apply, startedHidden, MODES };
