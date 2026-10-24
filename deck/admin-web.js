// ═══════ PITAYA DECK — PANEL W PRZEGLĄDARCE (/admin) ═══════
// Ten sam edytor co w aplikacji, otwierany z dowolnego komputera w sieci: http://<ip decka>:<port>/admin
// Okno edytora rozmawia z aplikacją przez IPC Electrona; w przeglądarce zastępuje je admin-bridge.js,
// który wysyła te same polecenia przez HTTP (POST /admin/api) i odbiera zdarzenia przez SSE (/admin/events).
//
// Bezpieczeństwo — panel daje pełną kontrolę nad deckiem (a deck uruchamia programy i naciska klawisze):
//   • domyślnie wyłączony; włącza się i ustawia hasło tylko w aplikacji na komputerze,
//   • hasło jako skrót scrypt w osobnym pliku admin.json (nie w ustawieniach decka, które trafiają do eksportu),
//   • sesja w ciasteczku HttpOnly + SameSite=Strict, a każde polecenie wymaga nagłówka X-Pitaya-Admin (CSRF),
//   • po 5 błędnych hasłach z jednego adresu — minuta przerwy.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const COOKIE = 'pitaya_admin';
const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_BODY = 8 * 1024 * 1024; // obrazy przycisków przychodzą jako data URL (do 4 MB)
const MAX_FAILS = 5;
const LOCK_MS = 60 * 1000;
// Polecenia okna, które w przeglądarce nie mają sensu albo otwierałyby okna dialogowe na komputerze
const WEB_BLOCKED = new Set(['deck:pick-file', 'deck:export', 'deck:import', 'deck:open-plugins-dir', 'deck:open-url', 'deck:admin-set']);

const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

function createAdmin({ appDir, dataDir, handlers, log = () => {} }) {
    const configFile = path.join(dataDir, 'admin.json');
    const sessions = new Map();   // token → { expires, ip }
    const streams = new Set();    // odpowiedzi SSE
    const fails = new Map();      // ip → { count, until }

    const readConfig = () => { try { return JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch { return { enabled: false }; } };
    let config = readConfig();
    function saveConfig(next) {
        config = next;
        fs.writeFileSync(`${configFile}.tmp`, JSON.stringify(config, null, 2), { mode: 0o600 });
        fs.renameSync(`${configFile}.tmp`, configFile);
    }

    const hash = (password, salt) => crypto.scryptSync(String(password), Buffer.from(salt, 'hex'), 64).toString('hex');
    function checkPassword(password) {
        if (!config.hash || !config.salt) return false;
        const a = Buffer.from(hash(password, config.salt), 'hex');
        const b = Buffer.from(config.hash, 'hex');
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    }

    function logoutAll() {
        sessions.clear();
        for (const res of streams) { try { res.end(); } catch {} }
        streams.clear();
    }

    // ── Ustawienia panelu (tylko z aplikacji na komputerze) ──
    const status = () => ({ enabled: Boolean(config.enabled), hasPassword: Boolean(config.hash), sessions: sessions.size });
    function set({ enabled, password, logout } = {}) {
        const next = { ...config };
        if (password != null && password !== '') {
            if (String(password).length < 6) throw new Error('Hasło musi mieć co najmniej 6 znaków');
            next.salt = crypto.randomBytes(16).toString('hex');
            next.hash = hash(password, next.salt);
            logoutAll(); // nowe hasło wylogowuje wszystkich
        }
        if (enabled != null) {
            if (enabled && !next.hash) throw new Error('Najpierw ustaw hasło do panelu');
            next.enabled = Boolean(enabled);
            if (!next.enabled) logoutAll();
        }
        if (logout) logoutAll();
        saveConfig(next);
        log(`Panel /admin: ${next.enabled ? 'włączony' : 'wyłączony'}`);
        return status();
    }

    // ── Sesje ──
    function cookieToken(req) {
        const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`).exec(req.headers.cookie || '');
        return m ? m[1] : null;
    }
    function session(req) {
        const token = cookieToken(req);
        const s = token && sessions.get(token);
        if (!s) return null;
        if (s.expires < Date.now()) { sessions.delete(token); return null; }
        return token;
    }

    function readBody(req) {
        return new Promise((resolve, reject) => {
            let size = 0;
            const chunks = [];
            req.on('data', (c) => {
                size += c.length;
                if (size > MAX_BODY) { reject(new Error('Za duże zapytanie')); req.destroy(); return; }
                chunks.push(c);
            });
            req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            req.on('error', reject);
        });
    }

    const json = (res, code, body, headers = {}) => {
        res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
        res.end(JSON.stringify(body));
    };
    const page = (res, code, html) => {
        res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' });
        res.end(html);
    };

    function serveFile(res, file, transform) {
        fs.readFile(file, (err, data) => {
            if (err) { res.writeHead(404); res.end('Nie znaleziono'); return; }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Frame-Options': 'DENY' });
            res.end(transform ? transform(data.toString('utf8')) : data);
        });
    }
    const safe = (base, rel) => {
        const full = path.resolve(base, '.' + rel);
        return full.startsWith(path.resolve(base) + path.sep) ? full : null;
    };

    // Lista metod window.deck z preload.js — most w przeglądarce zawsze zgadza się z aplikacją
    function bridgeMethods() {
        const src = fs.readFileSync(path.join(appDir, 'editor', 'preload.js'), 'utf8');
        const out = {};
        for (const m of src.matchAll(/(\w+):\s*invoke\('([^']+)'\)/g)) out[m[1]] = m[2];
        return out;
    }

    // Edytor z mostem dla przeglądarki zamiast preload.js
    function editorHtml(html) {
        const inject = `<script>window.__PITAYA_ADMIN__ = ${JSON.stringify({ methods: bridgeMethods() })};</script>\n  <script src="../admin-bridge.js"></script>\n  `;
        return html.replace('<script src="../shared/render.js"></script>', `${inject}<script src="../shared/render.js"></script>`);
    }

    function loginPage(message = '') {
        const disabled = !config.enabled;
        return `<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pitaya Deck — panel</title><link rel="icon" href="/icons/64x64.png"><link rel="stylesheet" href="/admin/core/ui/pitaya-theme.css">
<style>
body{display:grid;place-items:center;min-height:100vh;padding:20px;background:radial-gradient(600px 300px at 50% 0%,rgba(255,60,160,.18),transparent 70%),var(--m-bg)}
.box{width:100%;max-width:360px;background:var(--m-panel);border:1px solid var(--m-line);border-radius:24px;padding:28px;display:flex;flex-direction:column;gap:16px;text-align:center}
.box img{width:72px;height:72px;margin:0 auto}.box h1{font-size:20px;color:var(--m-text)}.box p{font-size:13px;color:var(--m-text-3);line-height:1.5}
.err{color:var(--m-danger);font-size:13px;min-height:18px}form{display:flex;flex-direction:column;gap:10px}
</style></head><body><div class="box"><img src="/icons/128x128.png" alt=""><h1>Pitaya Deck</h1>
${disabled ? '<p>Panel w przeglądarce jest wyłączony.<br>Włączysz go w aplikacji na komputerze: <b>Ustawienia → Panel w przeglądarce</b>.</p>'
        : `<p>Panel edytora — zaloguj się hasłem ustawionym w aplikacji na komputerze.</p>
<form method="post" action="/admin/login"><input class="m-input" type="password" name="password" placeholder="Hasło" autofocus autocomplete="current-password" required>
<button class="m-btn accent" type="submit">Zaloguj</button></form><div class="err">${message}</div>`}
</div></body></html>`;
    }

    // Zdarzenia z aplikacji (te same, które dostaje okno edytora) → wszystkie otwarte panele
    function broadcast(channel, ...args) {
        if (!streams.size) return;
        let data;
        try { data = JSON.stringify({ channel, args }); } catch { return; }
        for (const res of streams) { try { res.write(`data: ${data}\n\n`); } catch {} }
    }

    async function handle(req, res, url, p) {
        const ip = req.socket.remoteAddress;
        if (!config.enabled) {
            if (p === '/admin' || p === '/admin/') return page(res, 404, loginPage());
            res.writeHead(404); res.end(); return;
        }

        // Zasoby wspólne potrzebne stronie logowania
        if (p.startsWith('/admin/core/ui/')) return serveFile(res, safe(path.join(appDir, 'core', 'ui'), p.slice('/admin/core/ui'.length)) || '/');

        if (p === '/admin/login' && req.method === 'POST') {
            const f = fails.get(ip);
            if (f && f.until > Date.now()) return page(res, 429, loginPage('Za dużo prób — spróbuj za minutę.'));
            const body = new URLSearchParams(await readBody(req).catch(() => ''));
            if (!checkPassword(body.get('password') || '')) {
                const count = (f && f.until <= Date.now() ? 0 : (f ? f.count : 0)) + 1;
                fails.set(ip, { count, until: count >= MAX_FAILS ? Date.now() + LOCK_MS : 0 });
                log('Panel /admin: błędne hasło z', ip);
                return page(res, 401, loginPage('Błędne hasło.'));
            }
            fails.delete(ip);
            const token = crypto.randomBytes(32).toString('hex');
            sessions.set(token, { expires: Date.now() + SESSION_MS, ip });
            log('Panel /admin: zalogowano z', ip);
            res.writeHead(303, { Location: '/admin/editor/', 'Set-Cookie': `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=${SESSION_MS / 1000}` });
            res.end();
            return;
        }

        const token = session(req);
        if (!token) {
            if (p === '/admin/api' || p === '/admin/events') return json(res, 401, { ok: false, error: 'Sesja wygasła — zaloguj się ponownie' });
            return page(res, 200, loginPage());
        }

        if (p === '/admin/logout' && req.method === 'POST') {
            sessions.delete(token);
            res.writeHead(303, { Location: '/admin', 'Set-Cookie': `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0` });
            res.end();
            return;
        }

        if (p === '/admin/api') {
            if (req.method !== 'POST' || req.headers['x-pitaya-admin'] !== '1') return json(res, 403, { ok: false, error: 'Niedozwolone' });
            let msg;
            try { msg = JSON.parse(await readBody(req)); } catch (err) { return json(res, 400, { ok: false, error: err.message }); }
            const fn = handlers.get(msg.channel);
            if (!fn || WEB_BLOCKED.has(msg.channel)) return json(res, 404, { ok: false, error: `Niedostępne w przeglądarce: ${msg.channel}` });
            try {
                const result = await fn({ web: true, ip }, ...(Array.isArray(msg.args) ? msg.args : []));
                return json(res, 200, { ok: true, result: result === undefined ? null : result });
            } catch (err) {
                return json(res, 200, { ok: false, error: err.message || String(err) });
            }
        }

        if (p === '/admin/events') {
            res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
            res.write('retry: 3000\n\n');
            streams.add(res);
            const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);
            req.on('close', () => { clearInterval(ping); streams.delete(res); });
            return;
        }

        if (p === '/admin' || p === '/admin/') { res.writeHead(303, { Location: '/admin/editor/' }); res.end(); return; }
        if (p === '/admin/admin-bridge.js') return serveFile(res, path.join(appDir, 'editor', 'admin-bridge.js'));
        if (p === '/admin/editor/' || p === '/admin/editor/index.html') return serveFile(res, path.join(appDir, 'editor', 'index.html'), editorHtml);
        let file = null;
        if (p.startsWith('/admin/editor/')) file = safe(path.join(appDir, 'editor'), p.slice('/admin/editor'.length));
        else if (p.startsWith('/admin/core/')) file = safe(path.join(appDir, 'core'), p.slice('/admin/core'.length));
        else if (p.startsWith('/admin/shared/')) file = safe(path.join(appDir, 'shared'), p.slice('/admin/shared'.length));
        else if (p.startsWith('/admin/build/icons/')) file = safe(path.join(appDir, 'build', 'icons'), p.slice('/admin/build/icons'.length));
        // preload.js to kod dla Electrona — w przeglądarce niepotrzebny
        if (!file || /preload\.js$/.test(file) || !/\.(html|js|css|png|svg|jpe?g|webp|gif|ico|json|woff2)$/i.test(file)) { res.writeHead(404); res.end(); return; }
        serveFile(res, file);
    }

    return { handle, broadcast, status, set };
}

module.exports = { createAdmin };
