// Wtyczka „Pogoda”: aktualna pogoda z Open-Meteo (darmowe, bez klucza i konta).
let timer = null;
let place = null;   // { name, lat, lon }

// Kody pogody WMO → opis i emoji
const WMO = {
    0: ['Bezchmurnie', '☀️'], 1: ['Prawie bezchmurnie', '🌤️'], 2: ['Częściowe zachmurzenie', '⛅'], 3: ['Pochmurno', '☁️'],
    45: ['Mgła', '🌫️'], 48: ['Szadź', '🌫️'], 51: ['Lekka mżawka', '🌦️'], 53: ['Mżawka', '🌦️'], 55: ['Gęsta mżawka', '🌧️'],
    61: ['Lekki deszcz', '🌦️'], 63: ['Deszcz', '🌧️'], 65: ['Ulewa', '🌧️'], 66: ['Marznący deszcz', '🌧️'], 67: ['Marznący deszcz', '🌧️'],
    71: ['Lekki śnieg', '🌨️'], 73: ['Śnieg', '🌨️'], 75: ['Śnieżyca', '❄️'], 77: ['Ziarna śniegu', '🌨️'],
    80: ['Przelotny deszcz', '🌦️'], 81: ['Przelotne opady', '🌧️'], 82: ['Gwałtowne opady', '⛈️'], 85: ['Przelotny śnieg', '🌨️'], 86: ['Przelotny śnieg', '❄️'],
    95: ['Burza', '⛈️'], 96: ['Burza z gradem', '⛈️'], 99: ['Burza z gradem', '⛈️'],
};

async function getJson(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
        const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'PitayaDeck' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally { clearTimeout(t); }
}

async function locate(ctx) {
    const city = String(ctx.settings.city || '').trim();
    if (!city) throw new Error('Wpisz miasto w ustawieniach wtyczki Pogoda');
    if (place && place.query === city) return place;
    const g = await getJson(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=pl&name=${encodeURIComponent(city)}`);
    const r = g.results && g.results[0];
    if (!r) throw new Error(`Nie znaleziono miejscowości „${city}”`);
    place = { query: city, name: r.name, lat: r.latitude, lon: r.longitude };
    return place;
}

async function refresh(ctx) {
    try {
        const p = await locate(ctx);
        const w = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`);
        const c = w.current || {};
        const [desc, emoji] = WMO[c.weather_code] || ['—', '🌡️'];
        ctx.setVariable('place', p.name);
        ctx.setVariable('temp', Math.round(c.temperature_2m));
        ctx.setVariable('feels', Math.round(c.apparent_temperature));
        ctx.setVariable('humidity', Math.round(c.relative_humidity_2m));
        ctx.setVariable('wind', Math.round(c.wind_speed_10m));
        ctx.setVariable('desc', desc);
        ctx.setVariable('icon', c.is_day === 0 && c.weather_code <= 1 ? '🌙' : emoji);
        ctx.setVariable('max', Math.round((w.daily || {}).temperature_2m_max?.[0]));
        ctx.setVariable('min', Math.round((w.daily || {}).temperature_2m_min?.[0]));
    } catch (err) {
        ctx.setVariable('desc', err.message);
    }
}

module.exports = {
    id: 'weather',
    name: 'Pogoda',
    description: 'Temperatura i pogoda dla Twojego miasta (Open-Meteo).',
    settings: [{ key: 'city', label: 'Miasto', type: 'text', placeholder: 'np. Katowice' }],
    variables: [
        { id: 'temp', label: 'Temperatura (°C)' }, { id: 'feels', label: 'Odczuwalna (°C)' }, { id: 'desc', label: 'Opis' },
        { id: 'icon', label: 'Ikona (emoji)' }, { id: 'humidity', label: 'Wilgotność %' }, { id: 'wind', label: 'Wiatr (km/h)' },
        { id: 'max', label: 'Maks. dziś (°C)' }, { id: 'min', label: 'Min. dziś (°C)' }, { id: 'place', label: 'Miejscowość' },
    ],
    start: async (ctx) => {
        if (ctx.settings.city) refresh(ctx);
        timer = setInterval(() => { if (ctx.settings.city) refresh(ctx); }, 15 * 60 * 1000);
    },
    settingsChanged: async (ctx) => { place = null; await refresh(ctx); },
    stop: async () => clearInterval(timer),
    actions: [{ id: 'refresh', name: 'Odśwież pogodę', run: async (c, ctx) => refresh(ctx) }],
};
