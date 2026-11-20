/* Sign in: choose the booth, tap your name (set up by the moderator in People), then type your 4-digit PIN.
   The person decides the booth and the role (manager, cashier, moderator). */
(function () {
  const { $, esc, dayLabel } = CS.util, S = CS.store, { icon, badge, toast } = CS.ui;
  const sess = S.session();
  if (sess) { location.replace(sess.role === 'admin' ? 'admin.html' : 'pos.html'); return; }
  let pin = '', lockTimer = 0, who = null, query = '', pick = S.deviceBooth() || '';
  const MOD = { name: 'Moderator', color: 'var(--lilac)', icon: 'shield' };

  $('#brandMark').innerHTML = CS.ui.logo();

  function showEvent() {
    const ev = S.activeEvent(), el = $('#eventNow');
    // No event: the sign-in box below already says so, so this line hides.
    el.hidden = !ev; el.className = 'event-now';
    el.innerHTML = ev ? icon('calendar') + `<span>Today: <b>${esc(ev.name)}</b>${ev.start ? ' · ' + dayLabel(ev.start) : ''}</span>` : '';
  }

  const roleLabel = s => s.role === 'admin' ? 'Moderator' : s.role === 'cashier' ? 'Cashier' : 'Manager';
  const boothOf = s => s.role === 'admin' ? MOD : (S.booth(s.booth) || { name: s.booth, color: '#FFB98A', icon: 'store' });
  const here = () => S.booth(pick) || { name: pick, color: '#FFB98A', icon: 'store' };
  const card = s => `<button class="person" data-person="${s.staff_id}" style="--booth:${here().color}">${badge(here())}
    <span><b>${esc(s.name)}</b><span class="sub">${roleLabel(s)}${s.booth !== pick ? ' · from ' + esc(boothOf(s).name) : ''}</span></span>${icon('next', 'go')}</button>`;

  // Step 1: pick the booth (one dropdown), then tap your name. The moderator has their own big button.
  function showPeople() {
    who = null; pin = '';
    const booths = S.boothsForSale().filter(b => !S.eventBlock(b.code));
    if (!booths.some(b => b.code === pick)) pick = booths.length === 1 ? booths[0].code : '';
    const lastU = S.get('last.user', ''), q = query.toLowerCase();
    const team = pick ? S.staffFor(pick).sort((a, b) => (b.username === lastU) - (a.username === lastU) || a.name.localeCompare(b.name)) : [];
    const list = team.filter(s => !q || s.name.toLowerCase().includes(q) || s.username.includes(q));
    const admin = S.staffList('ADMIN')[0];
    $('#step').innerHTML = `
      <p class="h2" style="margin-bottom:var(--s-3)">Sign in</p>
      ${!S.activeEvent() ? `<p class="note">${esc(S.eventBlock(''))}</p>`
        : !booths.length ? '<p class="note">No booths are set up for today\'s event yet. Ask your moderator.</p>'
        : `<label class="field">
            <select class="input big-select" id="boothPick" aria-label="Your booth"><option value="">Choose your booth…</option>${booths.map(b => `<option value="${b.code}" ${b.code === pick ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
          ${pick ? `<p class="h3" style="margin:var(--s-4) 0 var(--s-2)">Who are you?</p>
            ${team.length > 8 ? `<input class="input" id="find" value="${esc(query)}" placeholder="Search your name" autocomplete="off" style="margin-bottom:var(--s-2)">` : ''}
            ${!team.length ? '<p class="note">No one is set up for this booth yet. Ask your moderator to add people.</p>'
              : !list.length ? '<p class="sub">No name matches. Check the spelling.</p>'
              : `<div class="people">${list.map(card).join('')}</div>`}` : ''}`}
      ${admin ? `<div class="or-line"><span>or</span></div>
        <button class="mod-btn" data-person="${admin.staff_id}">${badge(MOD, 'lg')}<span><b>I'm the moderator</b><span class="sub">Events, booths, people, uploads and reports</span></span>${icon('next', 'go')}</button>` : ''}
      ${S.demo ? '' : `<p class="center" style="margin-top:var(--s-4)"><button class="link" data-load-setup>${icon('file')} Got a setup file from the moderator? Load it</button></p>
        <a class="demo-cta" href="index.html?demo">${icon('help')}<span><b>Try the demo</b><span class="sub">A sample event with booths, people and sales.</span></span></a>`}`;
    const f = $('#find'); if (f && query) { f.focus(); f.setSelectionRange(query.length, query.length); }
  }

  // Step 2: the PIN.
  function showPin(s) {
    who = s; pin = '';
    $('#step').innerHTML = `
      <button class="link" data-back>${icon('back')} Not you? Choose again</button>
      <div class="center" style="display:grid;gap:var(--s-2);justify-items:center;margin:var(--s-3) 0 var(--s-4)">
        <p class="pin-booth">${badge(s.role === 'admin' ? MOD : here(), 'lg')}<b>${esc(s.role === 'admin' ? 'Moderator' : here().name)}</b></p>${s.role === 'admin' ? '' : `<p class="h2">${esc(s.name)}</p><p class="sub">${roleLabel(s)}</p>`}
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
    const s = S.login(who.username, pin, who.role === 'admin' ? '' : pick);
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
  document.addEventListener('change', e => { if (e.target.id === 'boothPick') { pick = e.target.value; query = ''; S.setDeviceBooth(pick || null); showPeople(); } });
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
