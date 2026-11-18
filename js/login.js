/* Sign in: who are you → which booth → PIN. */
(function () {
  const { $, esc, dayLabel } = CS.util, S = CS.store, { icon, badge, toast } = CS.ui;
  const sess = S.session();
  if (sess) { location.replace(sess.role === 'admin' ? 'admin.html' : 'pos.html'); return; }
  let pin = '', target = null; // target = booth code or 'ADMIN'

  $('#brandMark').innerHTML = icon('camera');

  function showEvent() {
    const ev = S.activeEvent(), el = $('#eventNow');
    el.className = 'event-now' + (ev ? '' : ' none');
    el.innerHTML = icon('calendar') + (ev
      ? `<span>Today: <b>${esc(ev.name)}</b>${ev.start ? ' · ' + dayLabel(ev.start) : ''}</span>`
      : '<span>No event is running yet. You can still sell.</span>');
  }

  function showRole() {
    target = null;
    $('#step').innerHTML = `
      <p class="h2" style="margin-bottom:var(--s-4)">What are you doing today?</p>
      <div class="choices">
        <button class="choice" style="--booth:var(--mint)" data-role="booth">${badge({ color: 'var(--mint)', icon: 'store' }, 'lg')}
          <span><span class="t">I'm selling at a booth</span><span class="sub">Take orders and payments</span></span>${icon('next', 'go')}</button>
        <button class="choice" style="--booth:var(--lilac)" data-role="admin">${badge({ color: 'var(--lilac)', icon: 'shield' }, 'lg')}
          <span><span class="t">I'm the moderator</span><span class="sub">Events, booths, uploads and reports</span></span>${icon('next', 'go')}</button>
      </div>
      <p class="center" style="margin-top:var(--s-5)"><button class="link" data-load-setup>${icon('file')} Got a setup file from the moderator? Load it</button></p>`;
  }

  function showBooths() {
    target = null;
    const list = S.boothsForSale();
    $('#step').innerHTML = `
      <button class="link" data-back>${icon('back')} Back</button>
      <p class="h2" style="margin:var(--s-2) 0 var(--s-4)">Which booth are you at?</p>
      ${list.length ? `<div class="choices">${list.map(b => `
        <button class="choice" style="--booth:${b.color}" data-booth="${b.code}">${badge(b, 'lg')}
          <span><span class="t">${esc(b.name)}</span><span class="sub">${esc(b.hint || '')}</span></span>${icon('next', 'go')}</button>`).join('')}</div>`
        : '<p class="note">No booths are set up yet. Ask your moderator to add booths, then load their setup file.</p>'}`;
  }

  function showPin(code) {
    const admin = code === 'ADMIN', b = admin ? { name: 'Moderator', color: 'var(--lilac)', icon: 'shield' } : S.booth(code);
    if (!b) return showBooths();
    target = code; pin = '';
    $('#step').innerHTML = `
      <button class="link" data-back>${icon('back')} ${admin ? 'Back' : 'Not your booth? Change'}</button>
      <div class="center" style="display:grid;gap:var(--s-3);justify-items:center;margin:var(--s-3) 0 var(--s-5)">
        ${badge(b, 'lg')}
        <p class="h2">${esc(b.name)}</p>
        <p class="sub">Type the 4-digit ${admin ? 'moderator' : S.hasPin(code, 'cashier') ? 'lead or cashier' : 'booth'} PIN</p>
      </div>
      <div class="dots" id="dots" aria-label="PIN digits entered"></div>
      <p class="err center" id="err" role="alert"></p>
      <div class="keypad" id="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']
        .map(k => k ? `<button data-key="${k}" aria-label="${k === 'del' ? 'Delete' : k}">${k === 'del' ? icon('del') : k}</button>` : '<span></span>').join('')}</div>
      <p class="sub center" style="margin-top:var(--s-4)">${S.isDefaultPin(code) ? 'First time? The starting PIN is <b>1234</b>.' : 'Forgot the PIN? Ask your moderator.'}</p>`;
    drawDots(); lockView();
  }

  function drawDots() { $('#dots').innerHTML = [0, 1, 2, 3].map(i => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join(''); }

  let lockTimer = 0;
  function lockView() {
    clearTimeout(lockTimer);
    const left = target && CS.pin.lockLeft(target), pad = $('#keypad');
    if (!pad) return;
    pad.querySelectorAll('button').forEach(b => { b.disabled = !!left; });
    pad.classList.toggle('locked', !!left);
    if (left) { $('#err').textContent = `Too many wrong tries. Try again in ${CS.pin.clock(left)}.`; lockTimer = setTimeout(lockView, 1000); }
    else if (/Too many/.test($('#err').textContent)) $('#err').textContent = '';
  }

  function key(k) {
    if (CS.pin.lockLeft(target)) return lockView();
    $('#err').textContent = '';
    pin = k === 'del' ? pin.slice(0, -1) : (pin + k).slice(0, 4);
    drawDots();
    if (pin.length < 4) return;
    const s = S.login(target, pin);
    if (s) return location.replace(s.role === 'admin' ? 'admin.html' : 'pos.html');
    const tries = CS.pin.triesLeft(target);
    $('#err').textContent = CS.pin.lockLeft(target) ? '' : tries <= 3 ? `That PIN is not right. ${tries} ${tries === 1 ? 'try' : 'tries'} left before a short lock.` : 'That PIN is not right. Try again.';
    lockView();
    $('#dots').classList.add('shake');
    pin = '';
    setTimeout(() => { const d = $('#dots'); if (d) { d.classList.remove('shake'); drawDots(); } }, 320);
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    const d = t.dataset;
    if (d.role === 'booth') S.deviceBooth() && S.booth(S.deviceBooth()) ? showPin(S.deviceBooth()) : showBooths();
    else if (d.role === 'admin') showPin('ADMIN');
    else if (d.booth) showPin(d.booth);
    else if (d.key) key(d.key);
    else if ('back' in d) { if (target && target !== 'ADMIN') { S.setDeviceBooth(null); showBooths(); } else showRole(); }
    else if ('loadSetup' in d) $('#setupFile').click();
  });
  document.addEventListener('keydown', e => {
    if (!target) return;
    if (/^\d$/.test(e.key)) key(e.key);
    else if (e.key === 'Backspace') key('del');
  });
  $('#setupFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      if (!S.importSetup(JSON.parse(await f.text()))) throw new Error('bad');
      toast('Setup loaded. Booths and event are up to date.'); showEvent(); showRole();
    } catch (err) { toast('That file is not a ContactSheet setup file.', 'bad'); }
  });

  document.addEventListener('cs-sync', e => {
    if (!e.detail.setupChanged || pin) return;
    showEvent();
    if (!target) showRole(); else if (target !== 'ADMIN') showPin(target);
  });
  showEvent();
  showRole();
  CS.sync.start();
  if (location.hash === '#idle') { history.replaceState(null, '', location.pathname); toast('Signed out after 15 minutes without use.'); }
})();
