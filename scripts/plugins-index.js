#!/usr/bin/env node
// Tworzy plugins/index.json — spis dodatków dla sklepu Pitaya Deck (pobierany z GitHuba).
// Uruchom po każdej zmianie w plugins/:  node scripts/plugins-index.js
// Pamiętaj, żeby przy zmianie dodatku podbić "version" w jego plugin.json — inaczej aplikacje nie pokażą aktualizacji.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..', 'plugins');
const files = (dir, base = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.name.startsWith('.')) return [];
    return e.isDirectory() ? files(path.join(dir, e.name), rel) : [rel];
});
const plugins = [];
for (const id of fs.readdirSync(root).sort()) {
    const dir = path.join(root, id);
    if (!fs.statSync(dir).isDirectory()) continue;
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
    if (manifest.id !== id) throw new Error(`plugins/${id}: id w plugin.json (${manifest.id}) musi być takie jak nazwa folderu`);
    if (!fs.existsSync(path.join(dir, 'index.js'))) throw new Error(`plugins/${id}: brak index.js`);
    plugins.push({
        ...manifest,
        files: files(dir).map((f) => {
            const buf = fs.readFileSync(path.join(dir, f));
            return { path: f, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
        }),
    });
}
fs.writeFileSync(path.join(root, 'index.json'), `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), plugins }, null, 2)}\n`);
console.log(`plugins/index.json: ${plugins.map((p) => `${p.id} ${p.version}`).join(', ')}`);
