// ═══════ PITAYA DECK — AUTOMATYZACJE ═══════
// Bloki uruchamiane zdarzeniem, bez dotykania przycisku. Zapis w deck.json → automations:
//   { id, name, enabled, trigger, cond, blocks }
// trigger:
//   { type: 'variable', var, op, value }   gdy warunek zacznie być spełniony (np. spotify.playing jest włączone)
//   { type: 'change', var }                przy każdej zmianie zmiennej (wartość w {value})
//   { type: 'time', at: '08:30', days: [1,2,3,4,5] }   o godzinie (dni: 0 = niedziela)
//   { type: 'interval', seconds: 60 }      co jakiś czas
//   { type: 'start' }                      po uruchomieniu Pitaya Deck
// cond: dodatkowy warunek „uruchom tylko, gdy…” w tym samym formacie co w bloku Jeśli.

function createAutomations({ store, runtime, log = () => {} }) {
    const lastMatch = new Map();      // id → czy warunek zmiennej był ostatnio spełniony
    const timers = new Map();         // id → setInterval
    const lastMinute = new Map();     // id → 'RRRR-MM-DD HH:MM' ostatniego uruchomienia o godzinie
    const running = new Set();
    let clock = null;

    const list = () => (store.deck.automations || []).filter((a) => a && a.enabled !== false);

    async function run(a, locals = {}) {
        if (running.has(a.id)) return;   // nie uruchamiaj drugi raz, gdy poprzednie jeszcze trwa
        if (a.cond && a.cond.rules && a.cond.rules.length && !runtime.condOk(a.cond, { locals })) return;
        running.add(a.id);
        try { await runtime.runActions(a.blocks || [], { device: 'deck', automation: a.id, locals: { automation: a.name, ...locals } }); }
        catch (err) { log('Automatyzacja', a.name, err.message); }
        finally { running.delete(a.id); }
    }

    function check(name, value) {
        for (const a of list()) {
            const t = a.trigger || {};
            if (t.type === 'change' && t.var === name) run(a, { value });
            if (t.type === 'variable' && t.var === name) {
                const ok = runtime.condOk({ rules: [{ left: t.var, op: t.op || 'isOn', right: t.value ?? '' }] }, {});
                const was = lastMatch.get(a.id);
                lastMatch.set(a.id, ok);
                if (ok && was === false) run(a, { value });
            }
        }
    }

    function tick() {
        const now = new Date();
        const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const stamp = `${now.toDateString()} ${hm}`;
        for (const a of list()) {
            const t = a.trigger || {};
            if (t.type !== 'time' || t.at !== hm) continue;
            if (Array.isArray(t.days) && t.days.length && !t.days.includes(now.getDay())) continue;
            if (lastMinute.get(a.id) === stamp) continue;
            lastMinute.set(a.id, stamp);
            run(a, { time: hm });
        }
    }

    // Po każdej zmianie listy ustawiamy liczniki od nowa i zapamiętujemy obecny stan warunków
    function rebuild() {
        for (const t of timers.values()) clearInterval(t);
        timers.clear();
        for (const a of list()) {
            const t = a.trigger || {};
            if (t.type === 'interval') {
                const sec = Math.max(1, Number(t.seconds) || 60);
                timers.set(a.id, setInterval(() => run(a), sec * 1000));
            }
            if (t.type === 'variable' && !lastMatch.has(a.id)) {
                lastMatch.set(a.id, runtime.condOk({ rules: [{ left: t.var, op: t.op || 'isOn', right: t.value ?? '' }] }, {}));
            }
        }
    }

    function start() {
        rebuild();
        runtime.onVariable(check);
        store.onChange((what) => { if (what === 'automations' || what === 'all') rebuild(); });
        clock = setInterval(tick, 15 * 1000);
        tick();
        for (const a of list()) if ((a.trigger || {}).type === 'start') run(a);
    }
    function stop() {
        clearInterval(clock);
        for (const t of timers.values()) clearInterval(t);
        timers.clear();
    }

    return { start, stop, run: (id) => { const a = (store.deck.automations || []).find((x) => x.id === id); if (!a) throw new Error('Nie ma takiej automatyzacji'); return run({ ...a, cond: null }); } };
}

module.exports = { createAutomations };
