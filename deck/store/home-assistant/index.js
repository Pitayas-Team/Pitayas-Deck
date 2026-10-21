// Dodatek „Home Assistant” — REST API Home Assistanta z długoterminowym tokenem.
// Home Assistant → Twój profil → Bezpieczeństwo → Tokeny długoterminowe → Utwórz token.
let ctxRef = null;
let timer = null;
let stopped = true;

const base = () => String(ctxRef.settings.url || '').trim().replace(/\/+$/, '');
const watched = () => String(ctxRef.settings.entities || '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
const varName = (entity) => entity.replace(/[^\w.-]/g, '_');

async function api(method, pathname, body) {
    if (!base() || !ctxRef.settings.token) throw new Error('Wpisz adres i token Home Assistanta w ustawieniach dodatku');
    const res = await fetch(`${base()}/api${pathname}`, {
        method,
        headers: { Authorization: `Bearer ${ctxRef.settings.token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401) throw new Error('Home Assistant odrzucił token');
    if (!res.ok) throw new Error(`Home Assistant: błąd ${res.status}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}

async function poll() {
    clearTimeout(timer);
    if (stopped) return;
    try {
        if (!base() || !ctxRef.settings.token) { ctxRef.setVariable('connected', false); ctxRef.setStatus('Wpisz adres i token', false); }
        else {
            const list = watched();
            if (list.length) {
                const all = await api('GET', '/states');
                for (const e of list) {
                    const st = all.find((x) => x.entity_id === e);
                    ctxRef.setVariable(varName(e), st ? st.state : '');
                    if (st && st.attributes && st.attributes.brightness !== undefined) ctxRef.setVariable(`${varName(e)}.brightness`, Math.round((st.attributes.brightness / 255) * 100));
                }
            } else await api('GET', '/');
            ctxRef.setVariable('connected', true);
            ctxRef.setStatus(`Połączono z ${base().replace(/^https?:\/\//, '')}`, true);
        }
    } catch (err) {
        ctxRef.setVariable('connected', false);
        ctxRef.setStatus(err.message, false);
    }
    timer = setTimeout(poll, Math.max(2, Number(ctxRef.settings.interval) || 5) * 1000);
}

const entityOptions = (domains) => async (ctx) => {
    ctxRef = ctx;
    const all = await api('GET', '/states');
    return all.filter((x) => !domains || domains.includes(x.entity_id.split('.')[0]))
        .map((x) => ({ value: x.entity_id, label: `${(x.attributes && x.attributes.friendly_name) || x.entity_id} (${x.entity_id})` }))
        .sort((a, b) => a.label.localeCompare(b.label, 'pl'));
};
const after = () => setTimeout(poll, 400);

module.exports = {
    id: 'home-assistant',
    name: 'Home Assistant',
    description: 'Światła, gniazdka, sceny i skrypty z Home Assistanta.',
    settings: [
        { key: 'url', label: 'Adres Home Assistanta', type: 'text', default: 'http://homeassistant.local:8123' },
        { key: 'token', label: 'Token długoterminowy (Profil → Bezpieczeństwo)', type: 'password', default: '' },
        { key: 'entities', label: 'Encje do obserwowania (zmienne), po przecinku', type: 'text', default: '', placeholder: 'light.salon, switch.biurko, sensor.temperatura' },
        { key: 'interval', label: 'Odświeżanie stanu (sekundy)', type: 'number', default: 5 },
    ],
    variables: [{ id: 'connected', label: 'Połączono z Home Assistantem' }],
    start: async (ctx) => { ctxRef = ctx; stopped = false; poll(); },
    settingsChanged: async (ctx) => { ctxRef = ctx; poll(); },
    stop: async () => { stopped = true; clearTimeout(timer); },
    actions: [
        {
            id: 'toggle',
            name: 'Włącz / wyłącz urządzenie',
            fields: [
                { key: 'entity', label: 'Urządzenie', type: 'select', options: entityOptions(['light', 'switch', 'fan', 'input_boolean', 'cover', 'media_player', 'climate', 'lock', 'siren', 'humidifier']) },
                { key: 'mode', label: 'Co zrobić', type: 'select', default: 'toggle', options: [{ value: 'toggle', label: 'Przełącz' }, { value: 'turn_on', label: 'Włącz' }, { value: 'turn_off', label: 'Wyłącz' }] },
            ],
            run: async (c, ctx) => {
                ctxRef = ctx;
                if (!c.entity) throw new Error('Wybierz urządzenie');
                await api('POST', `/services/homeassistant/${c.mode}`, { entity_id: c.entity });
                after();
            },
        },
        {
            id: 'brightness',
            name: 'Jasność światła',
            fields: [
                { key: 'entity', label: 'Światło', type: 'select', options: entityOptions(['light']) },
                { key: 'value', label: 'Jasność (%)', type: 'number', default: 50, help: 'Na suwaku wpisz {value}' },
            ],
            run: async (c, ctx) => { ctxRef = ctx; await api('POST', '/services/light/turn_on', { entity_id: c.entity, brightness_pct: Math.max(0, Math.min(100, Number(c.value) || 0)) }); after(); },
        },
        {
            id: 'scene',
            name: 'Uruchom scenę lub skrypt',
            fields: [{ key: 'entity', label: 'Scena / skrypt / automatyzacja', type: 'select', options: entityOptions(['scene', 'script', 'automation']) }],
            run: async (c, ctx) => {
                ctxRef = ctx;
                const domain = String(c.entity || '').split('.')[0];
                await api('POST', `/services/${domain}/${domain === 'automation' ? 'trigger' : 'turn_on'}`, { entity_id: c.entity });
                after();
            },
        },
        {
            id: 'service',
            name: 'Wywołaj usługę',
            description: 'Dowolna usługa, np. light.turn_on z danymi JSON',
            fields: [
                { key: 'service', label: 'Usługa (domena.usługa)', type: 'text', placeholder: 'light.turn_on' },
                { key: 'data', label: 'Dane (JSON)', type: 'textarea', placeholder: '{"entity_id": "light.salon", "color_name": "red"}' },
            ],
            run: async (c, ctx) => {
                ctxRef = ctx;
                const [domain, service] = String(c.service || '').split('.');
                if (!domain || !service) throw new Error('Wpisz usługę w postaci domena.usługa');
                let data = {};
                if (String(c.data || '').trim()) { try { data = JSON.parse(c.data); } catch { throw new Error('Dane nie są poprawnym JSON-em'); } }
                await api('POST', `/services/${domain}/${service}`, data);
                after();
            },
        },
    ],
};
