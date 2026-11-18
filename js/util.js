/* BoothPay utilities. Classic script: exposes CS.util. */
window.CS = window.CS || {};
CS.util = (function () {
  const TZ = 'Asia/Manila';
  const B32 = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/1/I/O: easy to read aloud

  // cyrb53: small fast hash (not crypto). Used for PINs (P1 only) and ticket codes.
  function hash(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  function b32(n, len) { let s = ''; for (let i = 0; i < len; i++) { s = B32[n % 32] + s; n = Math.floor(n / 32); } return s; }
  function rand(len) { const a = new Uint32Array(1); crypto.getRandomValues(a); return b32(a[0], len); }

  const today = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); // YYYY-MM-DD
  const now = () => new Date().toISOString();
  const time = iso => new Intl.DateTimeFormat('en-PH', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  const id = booth => `${booth}-${today().slice(2).replace(/-/g, '')}-${rand(4)}`;

  // Ticket code: verifiable offline by any device that knows the ticket no. + date (see PHOTOBOOTH.md §2)
  const SALT = 'spcis-media-arts';
  const code = (ticketNo, day = today()) => b32(parseInt(hash(`${ticketNo}|${day}|${SALT}`), 36) % 1048576, 4);

  function money(c) {
    const v = c / 100;
    return '₱' + v.toLocaleString('en-PH', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
  }

  const dayOf = iso => today(new Date(iso));
  const hour = iso => +new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  const dayLabel = d => d ? new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(d + 'T00:00:00Z')) : '';
  const hourLabel = h => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
  // pesos text → centavos. "₱1,234.50" → 123450. Returns NaN when there is no number.
  function centavos(v) {
    const s = String(v == null ? '' : v).replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.');
    return s && !isNaN(parseFloat(s)) ? Math.round(parseFloat(s) * 100) : NaN;
  }

  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  return { hash, rand, today, now, time, id, code, money, esc, $, $$, dayOf, hour, dayLabel, hourLabel, centavos };
})();
