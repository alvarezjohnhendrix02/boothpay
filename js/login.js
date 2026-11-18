/* Sign in: username + 4-digit PIN. The username decides the booth and the role (manager, cashier, moderator). */
(function () {
  const { $, esc, dayLabel } = CS.util, S = CS.store, { icon, badge, toast } = CS.ui;
  const sess = S.session();
  if (sess) { location.replace(sess.role === 'admin' ? 'admin.html' : 'pos.html'); return; }
  let pin = '', lockTimer = 0;

  $('#brandMark').innerHTML = CS.ui.logo();

  function showEvent() {
    const ev = S.activeEvent(), el = $('#eventNow');
    el.className = 'event-now' + (ev ? '' : ' none');
    el.innerHTML = icon('calendar') + (ev
      ? `<span>Today: <b>${esc(ev.name)}</b>${ev.start ? ' · ' + dayLabel(ev.start) : ''}</span>`
      : '<span>No event is running yet. You can still sell.</span>');
  }

  function show() {
    const last = S.get('last.user', ''), firstTime = S.isDefaultPin('ADMIN');
    $('#step').innerHTML = `
      <p class="h2" style="margin-bottom:var(--s-4)">Sign in</p>
      <label class="field"><span>Username</span>
        <input class="input big-user" id="user" value="${esc(last)}" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="e.g. juan.photo"></label>
      <p class="sub" id="who" aria-live="polite"></p>
      <p class="field-label">PIN</p>
      <div class="dots" id="dots" aria-label="PIN digits entered"></div>
      <p class="err center" id="err" role="alert"></p>
      <div class="keypad" id="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']
        .map(k => k ? `<button data-key="${k}" aria-label="${k === 'del' ? 'Delete' : k}">${k === 'del' ? icon('del') : k}</button>` : '<span></span>').join('')}</div>
      <p class="sub center" style="margin-top:var(--s-4)">${firstTime ? 'First time? The moderator signs in as <b>moderator</b> with PIN <b>1234</b>.' : 'Forgot your username or PIN? Ask your moderator.'}</p>
      <p class="center" style="margin-top:var(--s-4)"><button class="link" data-load-setup>${icon('file')} Got a setup file from the moderator? Load it</button></p>`;
    drawDots(); whoIs(); lockView();
    if (!last) $('#user').focus();
  }

  // Show whose account this is once the username matches, so people notice a typo before typing the PIN.
  function whoIs() {
    const u = S.findUser($('#user').value), el = $('#who');
    if (!u) { el.innerHTML = ''; return; }
    const b = u.booth === 'ADMIN' ? { name: 'Moderator', color: 'var(--lilac)', icon: 'shield' } : S.booth(u.booth);
    el.innerHTML = `<span class="who-line">${badge(b, 'sm')}<b>${esc(u.name)}</b>${u.role === 'admin' ? (u.name === 'Moderator' ? '' : ' · Moderator') : ' · ' + esc((b || {}).name || u.booth) + ' · ' + (u.role === 'cashier' ? 'Cashier' : 'Manager')}</span>`;
  }

  function drawDots() { $('#dots').innerHTML = [0, 1, 2, 3].map(i => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join(''); }

  function lockView() {
    clearTimeout(lockTimer);
    const left = CS.pin.lockLeft('signin'), pad = $('#keypad');
    if (!pad) return;
    pad.querySelectorAll('button').forEach(b => { b.disabled = !!left; });
    pad.classList.toggle('locked', !!left);
    if (left) { $('#err').textContent = `Too many wrong tries. Try again in ${CS.pin.clock(left)}.`; lockTimer = setTimeout(lockView, 1000); }
    else if (/Too many/.test($('#err').textContent)) $('#err').textContent = '';
  }

  function key(k) {
    if (CS.pin.lockLeft('signin')) return lockView();
    $('#err').textContent = '';
    if (!S.uname($('#user').value)) { $('#err').textContent = 'Type your username first.'; $('#user').focus(); return; }
    pin = k === 'del' ? pin.slice(0, -1) : (pin + k).slice(0, 4);
    drawDots();
    if (pin.length < 4) return;
    const s = S.login($('#user').value, pin);
    if (s) return location.replace(s.role === 'admin' ? 'admin.html' : 'pos.html');
    const tries = CS.pin.triesLeft('signin');
    $('#err').textContent = CS.pin.lockLeft('signin') ? '' : tries <= 3 ? `Username or PIN is not right. ${tries} ${tries === 1 ? 'try' : 'tries'} left before a short lock.` : 'Username or PIN is not right. Try again.';
    $('#dots').classList.add('shake');
    pin = '';
    setTimeout(() => { const d = $('#dots'); if (d) { d.classList.remove('shake'); drawDots(); } }, 320);
    lockView();
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.key) key(t.dataset.key);
    else if ('loadSetup' in t.dataset) $('#setupFile').click();
  });
  document.addEventListener('input', e => {
    if (e.target.id !== 'user') return;
    const v = S.uname(e.target.value);
    if (v !== e.target.value) e.target.value = v;
    pin = ''; drawDots(); whoIs();
  });
  document.addEventListener('keydown', e => {
    if (e.target.id === 'user') { if (e.key === 'Enter') e.target.blur(); return; }
    if (/^\d$/.test(e.key)) key(e.key);
    else if (e.key === 'Backspace') key('del');
  });
  $('#setupFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      if (!S.importSetup(JSON.parse(await f.text()))) throw new Error('bad');
      toast('Setup loaded. Booths and people are up to date.'); showEvent(); show();
    } catch (err) { toast('That file is not a ContactSheet setup file.', 'bad'); }
  });

  document.addEventListener('cs-sync', e => { if (e.detail.setupChanged && !pin) { showEvent(); whoIs(); } });
  showEvent();
  show();
  CS.sync.start();
  if (location.hash === '#idle') { history.replaceState(null, '', location.pathname); toast('Signed out after 15 minutes without use.'); }
})();
