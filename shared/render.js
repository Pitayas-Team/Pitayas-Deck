// ═══════ PITAYA DECK — RYSOWANIE PRZYCISKÓW ═══════
// Wspólne dla telefonu (client/) i podglądu w edytorze, żeby przycisk wyglądał wszędzie tak samo.
// Ikony „glyph” to własne, proste kształty 24×24 (bez zewnętrznych zestawów ikon).
(function (global) {
    const G = {
        play: '<path d="M8 5v14l11-7z"/>',
        pause: '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>',
        'play-pause': '<path d="M4 6v12l8-6zM14 6h3v12h-3zM19 6h2v12h-2z"/>',
        next: '<path d="M5 6v12l9-6zM16 6h2.5v12H16z"/>',
        prev: '<path d="M19 6v12l-9-6zM8 6H5.5v12H8z"/>',
        stop: '<path d="M7 7h10v10H7z"/>',
        'volume-up': '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        'volume-down': '<path d="M5 9h4l5-4v14l-5-4H5z"/><path d="M17 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        'volume-off': '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        'mic-off': '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6M4 4l16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        record: '<circle cx="12" cy="12" r="7"/>',
        stream: '<circle cx="12" cy="12" r="3"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        camera: '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3z"/>',
        scene: '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="6" y="8" width="7" height="5" rx="1"/>',
        folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H10l2 2h7.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>',
        back: '<path d="M10 6l-6 6 6 6M4 12h16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
        home: '<path d="M3 11l9-7 9 7M6 9.5V20h4.5v-5h3v5H18V9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
        bulb: '<path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/><path d="M9.5 18.5h5M10.5 21h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        keyboard: '<rect x="2" y="6" width="20" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 10h1M9 10h1M12 10h1M15 10h1M18 10h0M7 14h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        terminal: '<rect x="2" y="4" width="20" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 9l3 3-3 3M11 15h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        globe: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" fill="none" stroke="currentColor" stroke-width="2"/>',
        power: '<path d="M12 3v8M7 6.5a7 7 0 1 0 10 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
        lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/>',
        chip: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
        music: '<path d="M9 17V5l11-2v12"/><circle cx="6.5" cy="17.5" r="3"/><circle cx="17.5" cy="15.5" r="3"/><path d="M9 5l11-2v3L9 8z"/>',
        chat: '<path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1z"/>',
        star: '<path d="M12 3l2.7 5.6 6.1.8-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.8z"/>',
        heart: '<path d="M12 20s-7.5-4.6-9-9.2C2 7.4 4.3 4.5 7.4 4.5c2 0 3.6 1.2 4.6 2.8 1-1.6 2.6-2.8 4.6-2.8 3.1 0 5.4 2.9 4.4 6.3C19.5 15.4 12 20 12 20z"/>',
        bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
        gear: '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        timer: '<circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9v4l3 2M9 2h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
        minus: '<path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
        check: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
        close: '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
        game: '<path d="M7 8h10a5 5 0 0 1 4.6 7l-.6 1.5a2.5 2.5 0 0 1-4.3.5L15 15H9l-1.7 2a2.5 2.5 0 0 1-4.3-.5L2.4 15A5 5 0 0 1 7 8z"/><path d="M7 11v3M5.5 12.5h3" stroke="#000" stroke-opacity=".45" stroke-width="1.6" stroke-linecap="round"/><circle cx="16" cy="11.5" r="1" fill="#000" fill-opacity=".45"/><circle cx="18" cy="13.5" r="1" fill="#000" fill-opacity=".45"/>',
        pitaya: '<path d="M12 6c4.4 0 7 3.4 7 7.7 0 4.6-3.1 7.3-7 7.3s-7-2.7-7-7.3C5 9.4 7.6 6 12 6z"/><path d="M12 6c-.4-1.6.2-3 1.6-4M9.3 7.2L7.6 5.3M14.7 7.2l1.7-1.9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    };

    const LABELS = {
        play: 'Graj', pause: 'Pauza', 'play-pause': 'Graj / pauza', next: 'Następny', prev: 'Poprzedni', stop: 'Stop',
        'volume-up': 'Głośniej', 'volume-down': 'Ciszej', 'volume-off': 'Wycisz', mic: 'Mikrofon', 'mic-off': 'Mikrofon wył.',
        record: 'Nagrywanie', stream: 'Transmisja', camera: 'Kamera', scene: 'Scena', folder: 'Folder', back: 'Wstecz', home: 'Start',
        bulb: 'Światło', keyboard: 'Klawiatura', terminal: 'Polecenie', globe: 'Internet', power: 'Zasilanie', lock: 'Blokada',
        chip: 'Procesor', music: 'Muzyka', chat: 'Czat', star: 'Gwiazdka', heart: 'Serce', bolt: 'Błyskawica', gear: 'Ustawienia',
        timer: 'Minutnik', plus: 'Plus', minus: 'Minus', check: 'OK', close: 'Zamknij', game: 'Gra', pitaya: 'Pitaya',
    };

    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function glyph(name) {
        return G[name] ? `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${G[name]}</svg>` : '';
    }

    // Kontrastowy kolor tekstu, gdy nie podano własnego
    function readable(bg) {
        const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(bg || '');
        if (!m) return '#ffffff';
        const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255);
        return 0.299 * r + 0.587 * g + 0.114 * b > 0.62 ? '#17161c' : '#ffffff';
    }

    // b = przycisk po renderButton() z serwera (albo z edytora): { label, labelPos, icon, bg, color, fontSize, on }
    function paint(el, b, size) {
        el.className = 'pd-btn' + (b ? '' : ' empty') + (b && b.on ? ' on' : '');
        if (!b) { el.innerHTML = ''; el.style.cssText = ''; return; }
        const scale = (size || 100) / 100;
        const pos = b.labelPos || 'bottom';
        const icon = b.icon || { type: 'none' };
        let iconHtml = '';
        if (icon.type === 'glyph') iconHtml = glyph(icon.value);
        else if (icon.type === 'emoji') iconHtml = `<span class="pd-emoji">${esc(icon.value)}</span>`;
        else if (icon.type === 'image' && icon.value) iconHtml = `<img src="${esc(icon.value)}" alt="" draggable="false">`;
        const hasIcon = Boolean(iconHtml);
        const label = pos === 'hidden' ? '' : String(b.label || '');
        el.style.background = b.bg || '#23222a';
        el.style.color = b.color || readable(b.bg);
        el.style.setProperty('--pd-font', `${Math.round((b.fontSize || 14) * scale)}px`);
        el.dataset.pos = pos;
        el.innerHTML =
            (label && pos === 'top' ? `<span class="pd-label">${esc(label)}</span>` : '') +
            (hasIcon ? `<span class="pd-icon${icon.type === 'image' && icon.fill ? ' fill' : ''}${label && pos === 'center' ? ' dim' : ''}">${iconHtml}</span>` : '') +
            (label && (pos === 'bottom' || pos === 'center') ? `<span class="pd-label${pos === 'center' ? ' center' : ''}">${esc(label)}</span>` : '') +
            (b.hasLong ? '<span class="pd-long" title="Ma akcję przytrzymania"></span>' : '');
        el.classList.toggle('no-icon', !hasIcon);
    }

    global.PitayaDeckRender = { paint, glyph, readable, GLYPHS: G, GLYPH_LABELS: LABELS };
})(typeof window !== 'undefined' ? window : globalThis);
