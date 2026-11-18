/* Shared UI bits: line icons (inline SVG, no emoji), toast, bottom sheet. */
CS.ui = (function () {
  const P = {
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
    pen: '<path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/>',
    brush: '<path d="M14 4l6 6-7 7-6-6z"/><path d="M7 11c-2 1-4 3-4 7 3 0 6-1 7-4"/>',
    sticker: '<path d="M5 4h14v9l-6 7H5z"/><path d="M13 20v-5a2 2 0 0 1 2-2h4"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    cup: '<path d="M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M9 3v2M13 3v2"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    gift: '<rect x="3" y="8" width="18" height="4"/><path d="M5 12v8h14v-8M12 8v12"/><path d="M12 8C10 4 7 4 7 6s3 2 5 2zm0 0c2-4 5-4 5-2s-3 2-5 2z"/>',
    store: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5 11v9h14v-9"/><path d="M10 20v-5h4v5"/>',
    chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v4h16v-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    logout: '<path d="M10 4H5v16h5"/><path d="M14 8l4 4-4 4M18 12H9"/>',
    ticket: '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M15 7v10" stroke-dasharray="2 2.5"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="1"/><path d="M7 14h10v7H7z"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
    cart: '<path d="M3 4h2l2.5 11h11L21 7H6.5"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>',
    place: '<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>',
    sync: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 20v-4h-4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    del: '<path d="M9 5h11v14H9l-6-7z"/><path d="M12 9l5 6M17 9l-5 6"/>',
  };
  const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[n] || P.store}</svg>`;
  // Brand mark: an inventory box sealed with film-strip tape (drawn on a 48-unit grid; sits on a coral badge).
  const logo = () => `<svg class="logo" viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="13" width="34" height="8.5" rx="2.6" fill="#2B2342"/><rect x="9" y="22.5" width="30" height="17.5" rx="2.6" fill="#2B2342"/><rect x="19.5" y="10.5" width="9" height="29.5" rx="1.2" fill="#FFF7EA"/><rect x="20.6" y="12" width="1.6" height="1.9" rx="0.5" fill="#2B2342"/><rect x="25.8" y="12" width="1.6" height="1.9" rx="0.5" fill="#2B2342"/><rect x="20.6" y="15.6" width="1.6" height="1.9" rx="0.5" fill="#2B2342"/><rect x="25.8" y="15.6" width="1.6" height="1.9" rx="0.5" fill="#2B2342"/><rect x="20.6" y="19.2" width="1.6" height="1.9" rx="0.5" fill="#2B2342"/><rect x="25.8" y="19.2" width="1.6" height="1.9" rx="0.5" fill="#2B2342"/><rect x="20.6" y="22.8" width="1.6" height="1.9" rx="0.5" fill="#2B2342"/><rect x="25.8" y="22.8" width="1.6" height="1.9" rx="0.5" fill="#2B2342"/><rect x="20.6" y="26.4" width="1.6" height="1.9" rx="0.5" fill="#2B2342"/><rect x="25.8" y="26.4" width="1.6" height="1.9" rx="0.5" fill="#2B2342"/><rect x="20.6" y="30" width="1.6" height="1.9" rx="0.5" fill="#2B2342"/><rect x="25.8" y="30" width="1.6" height="1.9" rx="0.5" fill="#2B2342"/><rect x="20.6" y="33.6" width="1.6" height="1.9" rx="0.5" fill="#2B2342"/><rect x="25.8" y="33.6" width="1.6" height="1.9" rx="0.5" fill="#2B2342"/><rect x="20.6" y="37.2" width="1.6" height="1.9" rx="0.5" fill="#2B2342"/><rect x="25.8" y="37.2" width="1.6" height="1.9" rx="0.5" fill="#2B2342"/><rect x="22.9" y="12.6" width="2.2" height="6.6" rx="0.6" fill="#FF8A7A"/><rect x="22.9" y="21.4" width="2.2" height="6.6" rx="0.6" fill="#FF8A7A"/><rect x="22.9" y="30.2" width="2.2" height="6.6" rx="0.6" fill="#FF8A7A"/><rect x="11.3" y="30.2" width="0.6" height="6.6" rx="0.1" fill="#FFF7EA"/><rect x="12.200000000000001" y="30.2" width="0.3" height="6.6" rx="0.1" fill="#FFF7EA"/><rect x="12.8" y="30.2" width="0.9" height="6.6" rx="0.1" fill="#FFF7EA"/><rect x="14.0" y="30.2" width="0.3" height="6.6" rx="0.1" fill="#FFF7EA"/><rect x="14.6" y="30.2" width="0.5" height="6.6" rx="0.1" fill="#FFF7EA"/><rect x="15.4" y="30.2" width="1.0" height="6.6" rx="0.1" fill="#FFF7EA"/><rect x="16.7" y="30.2" width="0.3" height="6.6" rx="0.1" fill="#FFF7EA"/><rect x="17.3" y="30.2" width="0.7" height="6.6" rx="0.1" fill="#FFF7EA"/><rect x="30.6" y="30.4" width="6.2" height="1.5" rx="0.7" fill="#FFF7EA"/><rect x="30.6" y="33.6" width="4.2" height="1.5" rx="0.7" fill="#FF8A7A"/><path d="M38.50 3.90 L39.79 7.21 L43.10 8.50 L39.79 9.79 L38.50 13.10 L37.21 9.79 L33.90 8.50 L37.21 7.21Z" fill="#FFF7EA"/><path d="M9.50 5.10 L10.17 6.83 L11.90 7.50 L10.17 8.17 L9.50 9.90 L8.83 8.17 L7.10 7.50 L8.83 6.83Z" fill="#FFE27A"/></svg>`;
  const BOOTH_ICONS = ['camera', 'pen', 'brush', 'sticker', 'star', 'cup', 'music', 'gift', 'store'];
  const COLORS = ['#FF8A7A', '#8CC8FF', '#FFE27A', '#C7A8FF', '#7FE3B4', '#FFA3CF', '#7ADCD8', '#FFB98A'];
  // old muted colors → summer pastels (for booths saved before the palette change)
  const OLD = { '#C2553A': '#FF8A7A', '#3B6EA5': '#8CC8FF', '#B08A1E': '#FFE27A', '#8A4F9E': '#C7A8FF', '#2F7A55': '#7FE3B4', '#C23B6E': '#FFA3CF', '#2C8C99': '#7ADCD8', '#6B6B66': '#FFB98A' };

  // Booth badge: colored square with the booth's icon.
  const badge = (b, size = '') => `<span class="badge ${size}${b && b.color === 'var(--ink)' ? ' inv' : ''}" style="--booth:${(b && b.color) || '#FFB98A'}">${icon((b && b.icon) || 'store')}</span>`;

  let tt;
  function toast(msg, kind = 'ok') {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.innerHTML = icon(kind === 'ok' ? 'check' : 'x') + '<span></span>';
    el.lastChild.textContent = msg;
    el.dataset.kind = kind;
    el.classList.add('show');
    clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), 2800);
  }

  const sheetEl = () => document.getElementById('sheet');
  function openSheet(html) {
    const s = sheetEl(); s.querySelector('.sheet-in').innerHTML = html;
    if (!s.open) s.showModal();
    const f = s.querySelector('[autofocus]'); if (f) f.focus();
  }
  const closeSheet = () => { const s = sheetEl(); if (s && s.open && !s.dataset.lock) s.close(); };
  document.addEventListener('cancel', e => { if (e.target.dataset && e.target.dataset.lock) e.preventDefault(); }, true);
  const head = (title, sub = '') => `<div class="sheet-head"><div><p class="h2">${title}</p>${sub ? `<p class="sub">${sub}</p>` : ''}</div><button class="x" data-close aria-label="Close">${icon('x')}</button></div>`;

  document.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) closeSheet();
    else if (e.target === sheetEl()) closeSheet();
  });

  return { icon, logo, badge, BOOTH_ICONS, COLORS, OLD, toast, openSheet, closeSheet, head };
})();
