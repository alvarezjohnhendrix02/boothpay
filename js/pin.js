/* PIN safety: wrong-try lockout, easy-PIN check, and "booth lead approves" keypad for cashier phones.
   The lock lives on the device: after 5 wrong tries it waits 1 min, then 2, 5, 10. */
CS.pin = (function () {
  const U = CS.util, S = CS.store;
  const STEPS = [1, 2, 5, 10], TRIES = 5;
  const key = b => 'lock.' + b;

  function lockLeft(b) { const l = S.get(key(b), null); return l && l.until > Date.now() ? Math.ceil((l.until - Date.now()) / 1000) : 0; }
  const triesLeft = b => TRIES - (S.get(key(b), { fails: 0 }).fails % TRIES);
  // → the matching staff record, or null. Wrong tries count toward the lock.
  function check(b, pin) {
    if (lockLeft(b)) return null;
    const s = S.catalog().staff.find(x => x.booth === b && x.active !== false && x.pin_hash === U.hash(pin + b));
    const l = S.get(key(b), { fails: 0, until: 0 });
    if (s) { S.set(key(b), { fails: 0, until: 0 }); return s; }
    l.fails++;
    if (l.fails % TRIES === 0) l.until = Date.now() + STEPS[Math.min(l.fails / TRIES - 1, STEPS.length - 1)] * 60000;
    S.set(key(b), l);
    return null;
  }
  const clock = sec => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

  // '' when the PIN is fine, otherwise a short reason.
  function weak(p) {
    if (!/^\d{4}$/.test(p)) return 'The PIN must be exactly 4 numbers.';
    if (/^(\d)\1{3}$/.test(p)) return 'Do not use the same number 4 times (like 1111).';
    const d = [...p].map(Number);
    if (d.every((x, i) => !i || x === d[i - 1] + 1) || d.every((x, i) => !i || x === d[i - 1] - 1)) return 'Do not use numbers in a row (like 1234 or 9876).';
    if (/^(\d\d)\1$/.test(p)) return 'Too easy to guess (like 1212). Pick another.';
    return '';
  }

  /* ---------- booth lead approval (used on cashier phones) ---------- */
  let ap = null; // { booth, done, pin, timer }
  function approve(booth, why, done) {
    const sess = S.session();
    if (!sess || sess.role !== 'cashier') return done(sess);
    ap = { booth, done, pin: '' };
    const { head, icon, openSheet } = CS.ui;
    openSheet(`${head('Booth lead needed', why)}
      <p class="sub center">Ask your booth lead to type their PIN.</p>
      <div class="dots" id="apDots" aria-label="PIN digits entered"></div>
      <p class="err center" id="apErr" role="alert"></p>
      <div class="keypad" id="apPad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map(k => k ? `<button data-ap-key="${k}" aria-label="${k === 'del' ? 'Delete' : k}">${k === 'del' ? icon('del') : k}</button>` : '<span></span>').join('')}</div>`);
    dots(); lockView();
  }
  function dots() { const el = document.getElementById('apDots'); if (el && ap) el.innerHTML = [0, 1, 2, 3].map(i => `<i class="${i < ap.pin.length ? 'on' : ''}"></i>`).join(''); }
  function lockView() {
    clearTimeout(ap && ap.timer);
    const left = ap && lockLeft(ap.booth), err = document.getElementById('apErr'), pad = document.getElementById('apPad');
    if (!err) return;
    pad.querySelectorAll('button').forEach(b => { b.disabled = !!left; });
    if (left) { err.textContent = `Too many wrong tries. Wait ${clock(left)}.`; ap.timer = setTimeout(lockView, 1000); }
  }
  function key2(k) {
    document.getElementById('apErr').textContent = '';
    ap.pin = k === 'del' ? ap.pin.slice(0, -1) : (ap.pin + k).slice(0, 4);
    dots();
    if (ap.pin.length < 4) return;
    const s = check(ap.booth, ap.pin);
    ap.pin = ''; setTimeout(dots, 200);
    if (s && s.role === 'lead') { const f = ap; ap = null; CS.ui.closeSheet(); f.done(s); return; }
    document.getElementById('apErr').textContent = s ? 'That is a cashier PIN. The booth lead must type theirs.'
      : lockLeft(ap.booth) ? '' : `Not the lead PIN. ${triesLeft(ap.booth)} tries left.`;
    lockView();
  }
  document.addEventListener('click', e => { const t = e.target.closest('[data-ap-key]'); if (t && ap) key2(t.dataset.apKey); });
  document.addEventListener('close', e => { if (e.target.id === 'sheet' && ap) { clearTimeout(ap.timer); ap = null; } }, true);

  return { check, lockLeft, triesLeft, clock, weak, approve };
})();
