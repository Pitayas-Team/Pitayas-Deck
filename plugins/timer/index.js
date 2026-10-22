// Dodatek „Minutnik” — odliczanie, stoper i pomodoro. Czas liczy komputer, przyciski pokazują go przez zmienne.
let ctxRef = null;
let tick = null;
const cd = { total: 0, endsAt: 0, left: 0, running: false };
const sw = { startedAt: 0, acc: 0, running: false };
const pomo = { phase: 'idle', round: 0 };

const fmt = (s) => {
    s = Math.max(0, Math.ceil(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};
const set = (patch) => { for (const [k, v] of Object.entries(patch)) ctxRef.setVariable(k, v); };

function update() {
    const now = Date.now();
    if (cd.running) {
        cd.left = Math.max(0, (cd.endsAt - now) / 1000);
        if (cd.left <= 0) finish();
    }
    const elapsed = sw.acc + (sw.running ? (now - sw.startedAt) / 1000 : 0);
    set({
        remaining: fmt(cd.left), remainingSeconds: Math.ceil(cd.left), running: cd.running,
        progress: cd.total ? Math.round(((cd.total - cd.left) / cd.total) * 100) : 0,
        stopwatch: fmt(elapsed), stopwatchSeconds: Math.floor(elapsed), stopwatchRunning: sw.running,
        pomodoro: { idle: '', work: 'Praca', break: 'Przerwa' }[pomo.phase], pomodoroRound: pomo.round,
    });
}
function finish() {
    cd.running = false;
    cd.left = 0;
    const msg = pomo.phase === 'work' ? 'Koniec pracy — czas na przerwę!' : pomo.phase === 'break' ? 'Koniec przerwy — wracamy do pracy!' : 'Czas minął!';
    ctxRef.notify(`⏰ ${msg}`, 'info');
    try { ctxRef.desktopNotify(msg); } catch {}
    if (ctxRef.settings.sound) { try { ctxRef.platform.playSound(ctxRef.settings.sound, 100); } catch {} }
    if (pomo.phase !== 'idle' && ctxRef.settings.pomodoroAuto) {
        const work = pomo.phase === 'break';
        if (work) pomo.round++;
        pomo.phase = work ? 'work' : 'break';
        startCountdown((work ? ctxRef.settings.work : ((pomo.round % 4 === 0) ? ctxRef.settings.longBreak : ctxRef.settings.shortBreak)) * 60);
    }
}
function startCountdown(seconds) {
    cd.total = seconds;
    cd.left = seconds;
    cd.endsAt = Date.now() + seconds * 1000;
    cd.running = true;
    update();
}

module.exports = {
    id: 'timer',
    name: 'Minutnik',
    description: 'Odliczanie, stoper i pomodoro ze zmiennymi do wyświetlania na przyciskach.',
    settings: [
        { key: 'sound', label: 'Dźwięk po zakończeniu (plik, opcjonalnie)', type: 'text', default: '' },
        { key: 'work', label: 'Pomodoro: praca (minuty)', type: 'number', default: 25 },
        { key: 'shortBreak', label: 'Pomodoro: krótka przerwa (minuty)', type: 'number', default: 5 },
        { key: 'longBreak', label: 'Pomodoro: długa przerwa co 4 rundy (minuty)', type: 'number', default: 15 },
        { key: 'pomodoroAuto', label: 'Pomodoro: sam przechodź do następnej fazy', type: 'bool', default: true },
    ],
    variables: [
        { id: 'remaining', label: 'Odliczanie: zostało (mm:ss)' },
        { id: 'remainingSeconds', label: 'Odliczanie: zostało (s)' },
        { id: 'running', label: 'Odliczanie trwa' },
        { id: 'progress', label: 'Odliczanie: postęp (%)' },
        { id: 'stopwatch', label: 'Stoper (mm:ss)' },
        { id: 'stopwatchSeconds', label: 'Stoper (s)' },
        { id: 'stopwatchRunning', label: 'Stoper chodzi' },
        { id: 'pomodoro', label: 'Pomodoro: faza (Praca / Przerwa)' },
        { id: 'pomodoroRound', label: 'Pomodoro: runda' },
    ],
    start: async (ctx) => { ctxRef = ctx; update(); tick = setInterval(update, 500); },
    settingsChanged: async (ctx) => { ctxRef = ctx; },
    stop: async () => { clearInterval(tick); },
    actions: [
        {
            id: 'countdown',
            name: 'Odliczanie',
            fields: [
                { key: 'mode', label: 'Co zrobić', type: 'select', default: 'start', options: [{ value: 'start', label: 'Start od nowa' }, { value: 'toggle', label: 'Pauza / wznów' }, { value: 'add', label: 'Dodaj czas' }, { value: 'reset', label: 'Wyzeruj' }] },
                { key: 'minutes', label: 'Minuty', type: 'number', default: 5 },
                { key: 'seconds', label: 'Sekundy', type: 'number', default: 0 },
            ],
            run: async (c, ctx) => {
                ctxRef = ctx;
                const secs = (Number(c.minutes) || 0) * 60 + (Number(c.seconds) || 0);
                if (c.mode === 'start') { pomo.phase = 'idle'; startCountdown(secs); }
                if (c.mode === 'toggle') {
                    if (cd.running) { cd.left = Math.max(0, (cd.endsAt - Date.now()) / 1000); cd.running = false; }
                    else if (cd.left > 0) { cd.endsAt = Date.now() + cd.left * 1000; cd.running = true; }
                }
                if (c.mode === 'add') { if (cd.running) cd.endsAt += secs * 1000; else cd.left += secs; cd.total += secs; }
                if (c.mode === 'reset') { cd.running = false; cd.left = 0; cd.total = 0; pomo.phase = 'idle'; }
                update();
            },
        },
        {
            id: 'stopwatch',
            name: 'Stoper',
            fields: [{ key: 'mode', label: 'Co zrobić', type: 'select', default: 'toggle', options: [{ value: 'toggle', label: 'Start / pauza' }, { value: 'reset', label: 'Wyzeruj' }, { value: 'lap', label: 'Pokaż międzyczas' }] }],
            run: async (c, ctx) => {
                ctxRef = ctx;
                if (c.mode === 'toggle') {
                    if (sw.running) { sw.acc += (Date.now() - sw.startedAt) / 1000; sw.running = false; }
                    else { sw.startedAt = Date.now(); sw.running = true; }
                }
                if (c.mode === 'reset') { sw.acc = 0; sw.running = false; }
                if (c.mode === 'lap') ctx.notify(`Międzyczas: ${fmt(sw.acc + (sw.running ? (Date.now() - sw.startedAt) / 1000 : 0))}`, 'info');
                update();
            },
        },
        {
            id: 'pomodoro',
            name: 'Pomodoro',
            fields: [{ key: 'mode', label: 'Co zrobić', type: 'select', default: 'start', options: [{ value: 'start', label: 'Zacznij pracę' }, { value: 'break', label: 'Zacznij przerwę' }, { value: 'stop', label: 'Zakończ' }] }],
            run: async (c, ctx) => {
                ctxRef = ctx;
                if (c.mode === 'start') { pomo.phase = 'work'; pomo.round = Math.max(1, pomo.round || 1); startCountdown((Number(ctx.settings.work) || 25) * 60); }
                if (c.mode === 'break') { pomo.phase = 'break'; startCountdown((Number(ctx.settings.shortBreak) || 5) * 60); }
                if (c.mode === 'stop') { pomo.phase = 'idle'; pomo.round = 0; cd.running = false; cd.left = 0; cd.total = 0; }
                update();
            },
        },
    ],
};
