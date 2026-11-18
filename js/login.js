/* Sign in: tap your name (set up by the moderator in People), then type your 4-digit PIN.
   The person decides the booth and the role (manager, cashier, moderator). */
(function () {
  const { $, esc, dayLabel } = CS.util, S = CS.store, { icon, badge, toast } = CS.ui;
  const sess = S.session();
  if (sess) { location.replace(sess.role === 'admin' ? 'admin.html' : 'pos.html'); return; }
  let pin = '', lockTimer = 0, who = null, query = '';
  const MOD = { name: 'Moderator', color: 'var(--lilac)', icon: 'shield' };

  $('#brandMark').innerHTML = CS.ui.logo();

  function showEvent() {
    const ev = S.activeEvent(), el = $('#eventNow');
    el.className = 'event-now' + (ev ? '' : ' none');
    el.innerHTML = icon('calendar') + (ev
      ? `<span>Today: <b>${esc(ev.name)}</b>${ev.start ? ' · ' + dayLabel(ev.start) : ''}</span>`
      : '<span>No event is running yet. Booths can sign in once the moderator starts one.</span>');
  }

  const roleLabel = s => s.role === 'admin' ? 'Moderator' : s.role === 'cashier' ? 'Cashier' : 'Manager';
  const boothOf = s => s.role === 'admin' ? MOD : (S.booth(s.booth) || { name: s.booth, color: '#FFB98A', icon: 'store' });
  const card = (s, big) => `<button class="person${big ? ' big' : ''}" data-person="${s.staff_id}" style="--booth:${boothOf(s).color}">${badge(boothOf(s), big ? 'lg' : '')}
    <span><b>${esc(s.name)}</b><span class="sub">${s.role === 'admin' ? 'Moderator' : big ? esc(boothOf(s).name) + ' · ' + roleLabel(s) : roleLabel(s)}</span></span>${icon('next', 'go')}</button>`;

  // Step 1: who are you? People of the booths in today's event, grouped by booth.
  function showPeople() {
    who = null; pin = '';
    const all = S.staffList().filter(s => s.role !== 'admin'), open = all.filter(s => !S.eventBlock(s.booth));
    const q = query.toLowerCase(), list = open.filter(s => !q || s.name.toLowerCase().includes(q) || s.username.includes(q));
    const last = open.find(s => s.username === S.get('last.user', ''));
    const booths = S.catalog().booths.filter(b => list.some(s => s.booth === b.code));
    const admin = S.staffList('ADMIN')[0];
    $('#step').innerHTML = `
      <p class="h2" style="margin-bottom:var(--s-3)">Who are you?</p>
      ${last && !q ? `<div style="margin-bottom:var(--s-4)"><p class="label" style="margin-bottom:var(--s-2)">Last on this phone</p>${card(last, true)}</div>` : ''}
      ${open.length > 8 ? `<input class="input" id="find" value="${esc(query)}" placeholder="Search your name" autocomplete="off" style="margin-bottom:var(--s-3)">` : ''}
      ${!open.length ? `<p class="note">${esc(S.activeEvent() ? 'No one is set up for today\'s booths yet. Ask your moderator to add people.' : S.eventBlock(''))}</p>`
        : !list.length ? '<p class="sub">No name matches. Check the spelling or ask your moderator.</p>'
        : booths.map(b => `<p class="label" style="margin:var(--s-3) 0 var(--s-2)">${esc(b.name)}</p>
          <div class="people">${list.filter(s => s.booth === b.code).sort((x, y) => x.name.localeCompare(y.name)).map(s => card(s)).join('')}</div>`).join('')}
      ${admin ? `<p class="center" style="margin-top:var(--s-5)"><button class="link" data-person="${admin.staff_id}">${icon('shield')} I'm the moderator</button></p>` : ''}
      <p class="center"><button class="link" data-load-setup>${icon('file')} Got a setup file from the moderator? Load it</button></p>`;
    const f = $('#find'); if (f && query) { f.focus(); f.setSelectionRange(query.length, query.length); }
  }

  // Step 2: the PIN.
  function showPin(s) {
    who = s; pin = '';
    $('#step').innerHTML = `
      <button class="link" data-back>${icon('back')} Not you? Choose again</button>
      <div class="center" style="display:grid;gap:var(--s-2);justify-items:center;margin:var(--s-3) 0 var(--s-4)">
        ${badge(boothOf(s), 'lg')}<p class="h2">${esc(s.name)}</p><p class="sub">${s.role === 'admin' ? 'Moderator' : esc(boothOf(s).name) + ' · ' + roleLabel(s)}</p>
        <p class="sub">Type your 4-digit PIN</p></div>
      <div class="dots" id="dots" aria-label="PIN digits entered"></div>
      <p class="err center" id="err" role="alert"></p>
      <div class="keypad" id="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']
        .map(k => k ? `<button data-key="${k}" aria-label="${k === 'del' ? 'Delete' : k}">${k === 'del' ? icon('del') : k}</button>` : '<span></span>').join('')}</div>
      <p class="sub center" style="margin-top:var(--s-4)">${S.isDefault(s) ? 'First time? The starting PIN is <b>1234</b>. Change it soon.' : 'Forgot your PIN? Ask your moderator.'}</p>`;
    drawDots(); lockView();
  }

  function drawDots() { const d = $('#dots'); if (d) d.innerHTML = [0, 1, 2, 3].map(i => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join(''); }

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
    if (!who) return;
    if (CS.pin.lockLeft('signin')) return lockView();
    $('#err').textContent = '';
    pin = k === 'del' ? pin.slice(0, -1) : (pin + k).slice(0, 4);
    drawDots();
    if (pin.length < 4) return;
    const s = S.login(who.username, pin);
    if (s && s.role !== 'admin' && S.eventBlock(s.booth)) { S.logout(); $('#err').textContent = S.eventBlock(s.booth); pin = ''; drawDots(); return; }
    if (s) return location.replace(s.role === 'admin' ? 'admin.html' : 'pos.html');
    const tries = CS.pin.triesLeft('signin');
    $('#err').textContent = CS.pin.lockLeft('signin') ? '' : tries <= 3 ? `That PIN is not right. ${tries} ${tries === 1 ? 'try' : 'tries'} left before a short lock.` : 'That PIN is not right. Try again.';
    $('#dots').classList.add('shake');
    pin = '';
    setTimeout(() => { const d = $('#dots'); if (d) { d.classList.remove('shake'); drawDots(); } }, 320);
    lockView();
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.person) { const s = S.staffList().find(x => x.staff_id === t.dataset.person); if (s) showPin(s); }
    else if (t.dataset.key) key(t.dataset.key);
    else if ('back' in t.dataset) showPeople();
    else if ('loadSetup' in t.dataset) $('#setupFile').click();
  });
  document.addEventListener('input', e => { if (e.target.id === 'find') { query = e.target.value; showPeople(); } });
  document.addEventListener('keydown', e => {
    if (!who || e.target.id === 'find') return;
    if (/^\d$/.test(e.key)) key(e.key);
    else if (e.key === 'Backspace') key('del');
    else if (e.key === 'Escape') showPeople();
  });
  $('#setupFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      if (!S.importSetup(JSON.parse(await f.text()))) throw new Error('bad');
      toast('Setup loaded. Booths and people are up to date.'); showEvent(); showPeople();
    } catch (err) { toast('That file is not a BoothPay setup file.', 'bad'); }
  });

  document.addEventListener('cs-sync', e => { if (e.detail.setupChanged && !who) { showEvent(); showPeople(); } });
  showEvent();
  showPeople();
  CS.sync.start();
  if (location.hash === '#idle') { history.replaceState(null, '', location.pathname); toast('Signed out after 15 minutes without use.'); }
})();
