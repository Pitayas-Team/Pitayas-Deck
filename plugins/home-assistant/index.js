// Dodatek „Home Assistant” — REST API Home Assistanta z tokenem długoterminowym.
// Po wpisaniu adresu i tokenu sam wykrywa urządzenia; w ustawieniach wybierasz, które mają być dostępne w decku.
let ctxRef = null;
let timer = null;
let stopped = true;
let lastKey = '';          // adres + token, z którym ostatnio wykrywaliśmy urządzenia
let known = [];            // ostatnio wczytana lista encji

const DOMAINS = {
    light: 'Światła', switch: 'Gniazdka i przełączniki', scene: 'Sceny', script: 'Skrypty', automation: 'Automatyzacje',
    cover: 'Rolety i bramy', fan: 'Wentylatory', climate: 'Klimatyzacja i ogrzewanie', media_player: 'Odtwarzacze',
    lock: 'Zamki', input_boolean: 'Przełączniki pomocnicze', input_button: 'Przyciski pomocnicze', button: 'Przyciski',
    vacuum: 'Odkurzacze', humidifier: 'Nawilżacze', siren: 'Syreny', sensor: 'Czujniki', binary_sensor: 'Czujniki wł./wył.',
    camera: 'Kamery', person: 'Osoby', weather: 'Pogoda', number: 'Liczby', select: 'Listy wyboru',
};
// Te wybieramy same przy pierwszym połączeniu (czujników bywa setki, więc ich nie zaznaczamy)
const DEFAULT_DOMAINS = ['light', 'switch', 'scene', 'script', 'cover', 'fan', 'climate', 'media_player', 'lock', 'input_boolean'];
const TOGGLE_DOMAINS = ['light', 'switch', 'fan', 'input_boolean', 'cover', 'media_player', 'climate', 'lock', 'siren', 'humidifier', 'vacuum'];

const base = () => String(ctxRef.settings.url || '').trim().replace(/\/+$/, '');
const token = () => String(ctxRef.settings.token || '').trim();
const chosen = () => {
    const v = ctxRef.settings.entities;
    if (Array.isArray(v)) return v;
    return String(v || '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);   // stara wersja: tekst po przecinku
};
const varName = (entity) => entity.replace(/[^\w.-]/g, '_');
const nameOf = (st) => (st.attributes && st.attributes.friendly_name) || st.entity_id;

async function api(method, pathname, body) {
    if (!base() || !token()) throw new Error('Wpisz adres i token Home Assistanta w ustawieniach integracji');
    const res = await fetch(`${base()}/api${pathname}`, {
        method,
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401) throw new Error('Home Assistant odrzucił token — wygeneruj nowy w Profil → Bezpieczeństwo');
    if (!res.ok) throw new Error(`Home Assistant: błąd ${res.status}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}

// Pierwsze połączenie z nowym adresem / tokenem: wykryj urządzenia i zaznacz typowe
async function discover() {
    const all = await api('GET', '/states');
    known = all;
    const key = base();
    if (key !== lastKey) {
        lastKey = key;
        // Tylko przy pierwszym połączeniu z tym Home Assistantem (później szanujemy wybór użytkownika, także pusty)
        if (!chosen().length && ctxRef.settings.discoveredFor !== key) {
            const pick = all.filter((s) => DEFAULT_DOMAINS.includes(s.entity_id.split('.')[0])).map((s) => s.entity_id);
            ctxRef.saveSettings({ entities: pick, discoveredFor: key });
            ctxRef.notify(`Home Assistant: znaleziono ${all.length} encji, wybrano ${pick.length} urządzeń. Zmień wybór w ustawieniach integracji.`, 'success');
        }
    }
    return all;
}

async function poll() {
    clearTimeout(timer);
    if (stopped) return;
    try {
        if (!base() || !token()) {
            ctxRef.setVariable('connected', false);
            ctxRef.setStatus('Wpisz adres Home Assistanta i token — urządzenia wykryją się same', false);
        } else {
            const all = await discover();
            const sel = new Set(chosen());
            let n = 0;
            for (const st of all) {
                if (!sel.has(st.entity_id)) continue;
                n++;
                ctxRef.setVariable(varName(st.entity_id), st.state);
                const a = st.attributes || {};
                if (a.brightness !== undefined && a.brightness !== null) ctxRef.setVariable(`${varName(st.entity_id)}.brightness`, Math.round((a.brightness / 255) * 100));
                if (a.current_temperature !== undefined) ctxRef.setVariable(`${varName(st.entity_id)}.temperature`, a.current_temperature);
                if (a.media_title !== undefined) ctxRef.setVariable(`${varName(st.entity_id)}.title`, a.media_title || '');
            }
            ctxRef.setVariable('connected', true);
            ctxRef.setVariable('devices', n);
            ctxRef.setStatus(`Połączono z ${base().replace(/^https?:\/\//, '')} · wybrane urządzenia: ${n} z ${all.length}`, true);
        }
    } catch (err) {
        ctxRef.setVariable('connected', false);
        ctxRef.setStatus(err.message === 'fetch failed' ? `Nie można połączyć się z ${base()} — sprawdź adres` : err.message, false);
    }
    timer = setTimeout(poll, Math.max(2, Number(ctxRef.settings.interval) || 5) * 1000);
}

// Lista do wyboru w akcjach: tylko wybrane urządzenia (gdy nic nie wybrano — wszystkie)
const entityOptions = (domains) => async (ctx) => {
    ctxRef = ctx;
    const all = known.length ? known : await api('GET', '/states');
    const sel = new Set(chosen());
    return all.filter((x) => (!sel.size || sel.has(x.entity_id)) && (!domains || domains.includes(x.entity_id.split('.')[0])))
        .map((x) => ({ value: x.entity_id, label: `${nameOf(x)} (${x.entity_id})` }))
        .sort((a, b) => a.label.localeCompare(b.label, 'pl'));
};
const after = () => setTimeout(poll, 400);

module.exports = {
    id: 'home-assistant',
    name: 'Home Assistant',
    description: 'Światła, gniazdka, rolety, sceny i skrypty z Home Assistanta.',
    settings: [
        { key: 'guide', type: 'info', label: 'Wpisz adres Home Assistanta i token. Urządzenia wykryją się same, a niżej wybierzesz, które mają być dostępne w przyciskach.', help: 'Token: Home Assistant → Twój profil (na dole menu) → Bezpieczeństwo → Tokeny długoterminowe → Utwórz token.' },
        { key: 'url', label: 'Adres Home Assistanta', type: 'text', default: 'http://homeassistant.local:8123' },
        { key: 'token', label: 'Token długoterminowy', type: 'password', default: '' },
        {
            key: 'entities', label: 'Dostępne urządzenia', type: 'checklist', default: [],
            help: 'Zaznaczone urządzenia pojawią się w akcjach i jako zmienne (np. {home-assistant.light.salon}).',
            options: async (ctx) => {
                ctxRef = ctx;
                if (!base() || !token()) return [{ value: '', label: 'Najpierw wpisz adres i token — wtedy pojawi się lista urządzeń.' }];
                const all = await api('GET', '/states');
                known = all;
                const order = Object.keys(DOMAINS);
                return all.map((st) => {
                    const d = st.entity_id.split('.')[0];
                    return { value: st.entity_id, label: nameOf(st), group: DOMAINS[d] || d, hint: `${st.entity_id} · ${st.state}`, order: order.indexOf(d) < 0 ? 99 : order.indexOf(d) };
                }).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'pl'));
            },
        },
        { key: 'interval', label: 'Odświeżanie stanu (sekundy)', type: 'number', default: 5 },
    ],
    variables: [{ id: 'connected', label: 'Połączono z Home Assistantem' }, { id: 'devices', label: 'Liczba wybranych urządzeń' }],
    start: async (ctx) => { ctxRef = ctx; stopped = false; poll(); },
    settingsChanged: async (ctx) => { ctxRef = ctx; poll(); },
    stop: async () => { stopped = true; clearTimeout(timer); },
    actions: [
        {
            id: 'toggle',
            name: 'Włącz / wyłącz urządzenie',
            fields: [
                { key: 'entity', label: 'Urządzenie', type: 'select', options: entityOptions(TOGGLE_DOMAINS) },
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
            id: 'cover',
            name: 'Roleta / brama',
            fields: [
                { key: 'entity', label: 'Roleta', type: 'select', options: entityOptions(['cover']) },
                { key: 'mode', label: 'Co zrobić', type: 'select', default: 'toggle', options: [{ value: 'toggle', label: 'Przełącz' }, { value: 'open_cover', label: 'Otwórz' }, { value: 'close_cover', label: 'Zamknij' }, { value: 'stop_cover', label: 'Zatrzymaj' }] },
            ],
            run: async (c, ctx) => { ctxRef = ctx; await api('POST', `/services/cover/${c.mode}`, { entity_id: c.entity }); after(); },
        },
        {
            id: 'scene',
            name: 'Uruchom scenę lub skrypt',
            fields: [{ key: 'entity', label: 'Scena / skrypt / automatyzacja', type: 'select', options: entityOptions(['scene', 'script', 'automation', 'button', 'input_button']) }],
            run: async (c, ctx) => {
                ctxRef = ctx;
                const domain = String(c.entity || '').split('.')[0];
                const service = { automation: 'trigger', button: 'press', input_button: 'press' }[domain] || 'turn_on';
                await api('POST', `/services/${domain}/${service}`, { entity_id: c.entity });
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
