// Wtyczka „Internet i dom”: zapytania HTTP / webhooki oraz Home Assistant.
async function request(method, url, { headers = {}, body, timeout = 10000 } = {}) {
    if (!/^https?:\/\//i.test(url || '')) throw new Error('Adres musi zaczynać się od http:// albo https://');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
        const res = await fetch(url, { method, headers, body: ['GET', 'HEAD'].includes(method) ? undefined : body, signal: ctrl.signal });
        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 160)}` : ''}`);
        return text;
    } catch (err) {
        if (err.name === 'AbortError') throw new Error('Serwer nie odpowiedział w czasie');
        throw err;
    } finally {
        clearTimeout(t);
    }
}

function parseHeaders(text) {
    const out = {};
    for (const line of String(text || '').split('\n')) {
        const i = line.indexOf(':');
        if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return out;
}

function haBase(ctx) {
    const url = String(ctx.settings.haUrl || '').replace(/\/+$/, '');
    if (!url || !ctx.settings.haToken) throw new Error('Ustaw adres i token Home Assistant w ustawieniach wtyczki');
    return { url, headers: { Authorization: `Bearer ${ctx.settings.haToken}`, 'Content-Type': 'application/json' } };
}

module.exports = {
    id: 'http',
    name: 'Internet i dom',
    description: 'Zapytania HTTP, webhooki (Discord, IFTTT…) i Home Assistant.',
    settings: [
        { key: 'haUrl', label: 'Home Assistant — adres', type: 'text', placeholder: 'http://homeassistant.local:8123' },
        { key: 'haToken', label: 'Home Assistant — token (Profil → Tokeny długoterminowe)', type: 'password' },
    ],
    actions: [
        {
            id: 'request',
            name: 'Zapytanie HTTP / webhook',
            fields: [
                { key: 'method', label: 'Metoda', type: 'select', default: 'POST', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ value: m, label: m })) },
                { key: 'url', label: 'Adres', type: 'text', placeholder: 'https://…' },
                { key: 'headers', label: 'Nagłówki (jeden w linii: Nazwa: wartość)', type: 'textarea', default: 'Content-Type: application/json' },
                { key: 'body', label: 'Treść', type: 'textarea', placeholder: '{"content": "Nagrywam!"}' },
                { key: 'saveTo', label: 'Zapisz odpowiedź do zmiennej (opcjonalnie)', type: 'text' },
            ],
            run: async (c, ctx) => {
                const text = await request(c.method, c.url, { headers: parseHeaders(c.headers), body: c.body });
                if (c.saveTo) ctx.setUserVariable(c.saveTo.trim(), text.slice(0, 2000), 'text');
            },
        },
        {
            id: 'ha-service',
            name: 'Home Assistant — usługa',
            description: 'Np. light.toggle dla light.salon',
            fields: [
                { key: 'service', label: 'Usługa', type: 'text', placeholder: 'light.toggle' },
                { key: 'entity', label: 'Encja', type: 'text', placeholder: 'light.salon' },
                { key: 'data', label: 'Dodatkowe dane JSON (opcjonalnie)', type: 'textarea', placeholder: '{"brightness_pct": 50}' },
            ],
            run: async (c, ctx) => {
                const { url, headers } = haBase(ctx);
                const [domain, service] = String(c.service || '').split('.');
                if (!domain || !service) throw new Error('Usługa w formacie domena.usługa, np. light.toggle');
                let data = {};
                if (c.data && c.data.trim()) { try { data = JSON.parse(c.data); } catch { throw new Error('Dodatkowe dane to nie jest poprawny JSON'); } }
                if (c.entity) data.entity_id = c.entity.trim();
                await request('POST', `${url}/api/services/${domain}/${service}`, { headers, body: JSON.stringify(data) });
            },
        },
    ],
};
