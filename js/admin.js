/* Moderator shell (tabs, phone setup) + Events view. Views live in CS.views. */
CS.views = CS.views || {};

CS.views.events = (function () {
  const { esc, money, dayLabel, today } = CS.util, S = CS.store, { icon, badge, toast, openSheet, closeSheet, head } = CS.ui;
  let delId = null;

  const dates = e => !e.end || e.end === e.start ? dayLabel(e.start) : `${dayLabel(e.start)} – ${dayLabel(e.end)}`;

  function render(el) {
    const evs = S.events().slice().sort((a, b) => (b.start || '').localeCompare(a.start || '')), act = S.activeEvent();
    const totals = CS.report.totalsByEvent();
    el.innerHTML = `
      <div class="view-head"><div><h2 class="h1">Events</h2>
        <p class="sub">An event is a school fair, intramurals, or any day booths sell. New sales are linked to the running event.</p></div>
        <button class="btn primary" data-ev-new>${icon('plus')} New event</button></div>
      ${act ? '' : `<div class="event-now none">${icon('calendar')}<span><b>No event is running, so booths cannot sign in or sell.</b> ${S.events().length ? 'Make one the running event below.' : 'Create the first event to get started.'}</span></div>`}
      ${evs.length ? `<ul class="cards">${evs.map(e => {
        const live = act && act.event_id === e.event_id;
        return `<li class="card ev-card${live ? ' live' : ''}">
          <div class="card-main">
            <p class="h3 ev-title">${(st => `<i class="ev-dot ${st[0]}" role="img" aria-label="${st[1]}" title="${st[1]}"></i>`)(live ? ['on', 'Running'] : (e.end || e.start) >= today() ? ['wait', 'Paused / not started'] : ['off', 'Ended'])}<span>${esc(e.name)}</span></p>
            <p class="sub meta-line">${icon('calendar')}${dates(e)}</p>
            ${e.venue ? `<p class="sub meta-line">${icon('place')}${esc(e.venue)}</p>` : ''}
            <div class="badges">${(e.booths || []).map(c => S.booth(c)).filter(Boolean).map(b => `<span class="mini">${badge(b, 'sm')}${esc(b.name)}</span>`).join('') || '<span class="sub">All booths</span>'}</div>
          </div>
          <div class="card-num"><p class="label">Sales</p><p class="h2 num">${money(totals[e.event_id] || 0)}</p></div>
          <div class="card-actions ev-acts">
            ${live ? `<button class="icon-btn" data-ev-stop aria-label="Stop running (pauses all booths)" title="Stop running (pauses all booths)">${icon('pause')}</button>`
              : `<button class="icon-btn run" data-ev-run="${e.event_id}" aria-label="Make it the running event" title="Make it the running event">${icon('play')}</button>`}
            <button class="icon-btn" data-ev-edit="${e.event_id}" aria-label="Edit ${esc(e.name)}" title="Edit">${icon('edit')}</button>
            <button class="icon-btn" data-ev-del="${e.event_id}" aria-label="Delete ${esc(e.name)}" title="Delete">${icon('trash')}</button>
          </div></li>`;
      }).join('')}</ul>`
        : `<div class="empty big">${icon('calendar')}<p class="h3">No events yet</p><p>Create your first event, like "Foundation Day Fair".</p>
           <button class="btn primary" data-ev-new>${icon('plus')} New event</button></div>`}`;
  }

  function form(e) {
    const booths = S.catalog().booths.filter(b => b.active !== false), sel = e.booths || [];
    openSheet(`${head(e.event_id ? 'Edit event' : 'New event')}
      <form id="evForm" class="form" novalidate>
        <input type="hidden" name="event_id" value="${esc(e.event_id || '')}">
        <label class="field"><span>Event name</span><input name="name" value="${esc(e.name || '')}" placeholder="Foundation Day Fair" required autofocus></label>
        <div class="field-row">
          <label class="field"><span>First day</span><input type="date" name="start" value="${esc(e.start || today())}" required></label>
          <label class="field"><span>Last day</span><input type="date" name="end" value="${esc(e.end || e.start || today())}"></label>
        </div>
        <label class="field"><span>Where <small>(optional)</small></span><input name="venue" value="${esc(e.venue || '')}" placeholder="School gym"></label>
        <fieldset class="field"><span>Booths at this event</span><small>Leave all unticked to use every booth.</small>
          <div class="checks">${booths.map(b => `<label class="check"><input type="checkbox" name="booths" value="${b.code}" ${sel.includes(b.code) ? 'checked' : ''}>${badge(b, 'sm')}${esc(b.name)}</label>`).join('')}</div>
        </fieldset>
        <p class="err" id="evErr" role="alert"></p>
        <button class="btn primary wide" type="submit">${icon('check')} Save event</button>
      </form>`);
  }

  function save(f) {
    const fd = new FormData(f), name = fd.get('name').trim(), start = fd.get('start'), end = fd.get('end') || start;
    const err = m => { f.querySelector('#evErr').textContent = m; };
    if (!name) return err('Give the event a name.');
    if (!start) return err('Pick the first day.');
    if (end < start) return err('The last day cannot be before the first day.');
    const list = S.events(), id = fd.get('event_id');
    const ev = { event_id: id || 'EV-' + CS.util.rand(6), name, start, end, venue: fd.get('venue').trim(), booths: fd.getAll('booths') };
    const i = list.findIndex(x => x.event_id === id);
    if (i >= 0) list[i] = { ...list[i], ...ev }; else list.push({ ...ev, created: CS.util.now() });
    S.saveEvents(list);
    if (!S.activeEvent() && !id) S.setActiveEvent(ev.event_id);
    closeSheet(); toast('Event saved.'); CS.admin.refresh();
  }

  function click(e, t) {
    const d = t.dataset, list = S.events();
    if ('evNew' in d) form({});
    else if (d.evEdit) form(list.find(x => x.event_id === d.evEdit));
    else if (d.evRun) { S.setActiveEvent(d.evRun); toast('Running event changed. Send the setup file to booth phones.'); CS.admin.refresh(); }
    else if ('evStop' in d) { S.setActiveEvent(''); CS.admin.refresh(); }
    else if (d.evDel) {
      delId = d.evDel; const ev = list.find(x => x.event_id === delId);
      openSheet(`${head('Delete this event?')}<p><b>${esc(ev.name)}</b> will be removed. Its sales stay saved but will show as "No event" in reports.</p>
        <button class="btn danger wide" data-ev-del-yes>${icon('trash')} Delete event</button><button class="btn ghost wide" data-close>Keep it</button>`);
    } else if ('evDelYes' in d) {
      S.saveEvents(list.filter(x => x.event_id !== delId));
      if (S.activeEvent() == null) S.setActiveEvent('');
      closeSheet(); toast('Event deleted.'); CS.admin.refresh();
    }
  }
  function submit(e) { if (e.target.id === 'evForm') { e.preventDefault(); save(e.target); } }

  return { render, click, submit };
})();

/* ---------- shell ---------- */
CS.admin = (function () {
  const { $, $$, esc } = CS.util, S = CS.store, { icon, toast, openSheet, head } = CS.ui;
  const sess = S.session();
  if (!sess || sess.role !== 'admin') { location.replace('index.html'); return {}; }
  const TABS = [['reports', 'chart', 'Reports'], ['events', 'calendar', 'Events'], ['booths', 'store', 'Booths'], ['people', 'user', 'People'], ['expenses', 'cash', 'Expenses'], ['upload', 'upload', 'Upload PMS']];
  let current = TABS.some(t => t[0] === location.hash.slice(1)) ? location.hash.slice(1) : S.events().length ? 'reports' : 'events';

  function go(v) {
    if (v !== current) window.scrollTo(0, 0);
    current = v;
    if (location.hash.slice(1) !== v) history.replaceState(null, '', '#' + v);
    $$('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.view === v));
    header();
    CS.views[v].render($('#view'));
  }

  function header() {
    const ev = S.activeEvent(), L = CS.sync.label();
    $('#adminEvent').innerHTML = (ev ? `<b class="ok-text">${esc(ev.name)}</b>` : 'No event running') + (CS.sync.configured() ? ` · <span class="${L.ok ? 'ok-text' : 'bad-text'}">${esc(L.text)}</span>` : '');
  }

  function syncSheet() {
    const c = CS.sync.cfg() || { url: '', key: '' }, s = CS.sync.status(), L = CS.sync.label();
    openSheet(`${head('Sync & phones', 'Connect a Google Sheet so every booth&rsquo;s sales arrive here by themselves.')}
      <section class="panel"><p class="h3">${icon('sync')} Google Sheet</p>
        ${s.configured ? `<p><span id="syncChip" class="chip${L.ok ? ' ok' : ''}">${esc(L.text)}</span> <span class="sub">${s.last ? 'Last sync ' + CS.util.time(s.last) : ''}</span></p>${s.err ? `<p class="note warn">${esc(s.err)}</p>` : ''}${S.get('sync.v', 0) < 5 && s.last ? '<p class="note warn">Your Sheet script is an older version, so cash counts, customers, stock, expenses and ticket updates wait on the devices. Update it: see <b>docs/SYNC_SETUP.md → Updating the script</b>.</p>' : ''}`
          : '<p class="sub">Not connected yet. Follow <b>docs/SYNC_SETUP.md</b> (about 10 minutes), then paste the two things below.</p>'}
        <form id="syncForm" class="form" novalidate>
          <label class="field"><span>Web app URL</span><input name="url" value="${esc(c.url)}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" inputmode="url" spellcheck="false"></label>
          <label class="field"><span>Sync key</span><input name="key" value="${esc(c.key)}" autocomplete="off" spellcheck="false"><small>The same secret words you typed in Code.gs.</small></label>
          <p class="err" id="syncErr" role="alert"></p>
          <div class="btn-grid"><button class="btn primary" type="submit">${icon('check')} Save & test</button>
            ${s.configured ? `<button type="button" class="btn ghost" data-sync-now>${icon('sync')} Sync now</button><button type="button" class="btn ghost" data-sync-off>Disconnect</button>` : ''}</div>
        </form></section>
      <p class="h3">Booth phones</p>
      <ol class="steps">
        <li><b>1</b><span>Download the setup file below${s.configured ? ' (it also carries the Sheet connection)' : ''}.</span></li>
        <li><b>2</b><span>Send it to each booth phone (Messenger, Drive, or USB).</span></li>
        <li><b>3</b><span>On the phone, open BoothPay and tap <b>"Got a setup file? Load it"</b>.</span></li>
      </ol>
      <p class="note">${s.configured ? 'After that, phones get booth, price, PIN and event changes from the Sheet by themselves whenever they have internet, and send their sales back.'
        : 'Without a Sheet, do this again after every change. At the end of the day, booth phones tap <b>Send to moderator (CSV)</b> and you upload those files in <b>Upload PMS</b>.'}</p>
      <button class="btn primary wide" data-setup-dl>${icon('download')} Download setup file</button>`);
  }

  async function saveSync(f) {
    const url = f.url.value.trim(), key = f.key.value.trim(), err = m => { $('#syncErr').textContent = m; };
    if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) return err('Paste the web app URL from Apps Script. It starts with https://script.google.com/');
    if (key.length < 8) return err('The sync key must be at least 8 characters.');
    err('Checking…');
    const r = await CS.sync.test({ url, key });
    if (!r.ok) return err(r.why);
    CS.sync.setCfg({ url, key });
    toast(`Connected to "${r.sheet}".`);
    CS.sync.run(); syncSheet();
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.view) go(t.dataset.view);
    else if (t.id === 'signout') { S.logout(); location.replace('index.html'); }
    else if (t.id === 'phoneSetup') syncSheet();
    else if ('syncNow' in t.dataset) { CS.sync.run(); toast('Syncing…'); }
    else if ('syncOff' in t.dataset) { CS.sync.setCfg(null); toast('Disconnected from the Sheet.'); syncSheet(); header(); }
    else if ('setupDl' in t.dataset) { CS.csv.download(`boothpay-setup-${CS.util.today()}.json`, JSON.stringify(S.exportSetup()), 'application/json'); toast('Setup file saved.'); }
    else if (CS.views[current].click) CS.views[current].click(e, t);
  });
  document.addEventListener('submit', e => { if (e.target.id === 'syncForm') { e.preventDefault(); saveSync(e.target); } });
  document.addEventListener('cs-sync', e => {
    header();
    const sc = $('#syncChip'); if (sc) { const L = CS.sync.label(); sc.textContent = L.text; sc.classList.toggle('ok', L.ok); }
    if ($('#sheet').open) return;
    if (e.detail.setupChanged || (e.detail.pulled && current === 'reports')) go(current);
  });
  ['change', 'input', 'submit'].forEach(type => document.addEventListener(type, e => { const v = CS.views[current]; if (v[type]) v[type](e); }));
  window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (CS.views[v] && v !== current) go(v); });

  $('#adminBadge').innerHTML = icon('shield');
  $('#signout').innerHTML = icon('logout');
  $('#phoneSetup').innerHTML = icon('sync') + '<span class="hide-sm">Sync & phones</span>';
  $('#tabs').innerHTML = TABS.map(([v, ic, label]) => `<button role="tab" data-view="${v}">${icon(ic)}${label}</button>`).join('');
  go(current);
  CS.sync.start();

  /* ---------- the moderator must replace the starting PIN ---------- */
  function forcePin() {
    const sh = $('#sheet');
    openSheet(`<div class="sheet-head"><div><p class="h2">${icon('key')} Set up your moderator account</p>
        <p class="sub">Everyone can guess 1234. Pick a new PIN before you continue.</p></div></div>
      <form id="fpForm" class="form" novalidate>
        <label class="field"><span>New PIN</span><input class="input big-input num" name="a" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password" autofocus></label>
        <label class="field"><span>Type it again</span><input class="input big-input num" name="b" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password"></label>
        <p class="err" id="fpErr" role="alert"></p>
        <button class="btn go wide" type="submit">${icon('check')} Save PIN</button>
      </form>`);
    sh.dataset.lock = '1';
  }
  document.addEventListener('submit', e => {
    if (e.target.id !== 'fpForm') return;
    e.preventDefault();
    const a = e.target.a.value.trim(), b = e.target.b.value.trim(), err = m => { $('#fpErr').textContent = m; };
    const c = JSON.parse(JSON.stringify(S.catalog())), me = c.staff.find(x => x.booth === 'ADMIN' && x.active !== false);
    if (CS.pin.weak(a)) return err(CS.pin.weak(a));
    if (a !== b) return err('The two PINs are not the same.');
    S.setStaffPin(me, a); S.saveCatalog(c);
    delete $('#sheet').dataset.lock; CS.ui.closeSheet();
    toast('Saved. Use this PIN next time you tap “I’m the moderator”.'); CS.sync.run(); go(current);
  });
  document.addEventListener('input', e => { if (e.target.closest && e.target.closest('#fpForm')) e.target.value = e.target.value.replace(/\D/g, ''); });
  if (S.isDefaultPin('ADMIN')) forcePin();

  /* ---------- sign out after 15 minutes without use ---------- */
  let lastUse = Date.now();
  ['click', 'keydown', 'touchstart', 'input'].forEach(t => document.addEventListener(t, () => { lastUse = Date.now(); }, true));
  const idleCheck = () => { if (Date.now() - lastUse > 15 * 60000) { S.logout(); location.replace('index.html#idle'); } };
  setInterval(idleCheck, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') idleCheck(); });
  return { refresh: () => go(current), go };
})();
