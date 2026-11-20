/* Moderator → People: everyone who sells, in one list. Add a name, pick the booth and role, give a PIN.
   On the booth phone they tap their name and type the PIN. Same data as each booth's Team (js/team.js rules apply). */
CS.views = CS.views || {};
CS.views.people = (function () {
  const U = CS.util, { esc } = U, S = CS.store, { icon, badge, toast, openSheet, closeSheet, head } = CS.ui;
  let d = null;
  const clone = o => JSON.parse(JSON.stringify(o));

  function render(el) {
    const c = S.catalog(), booths = c.booths.filter(b => b.active !== false);
    el.innerHTML = `
      <div class="view-head"><div><h2 class="h1">People</h2></div>
        <button class="btn primary" data-pp-new>${icon('plus')} Add a person</button></div>
      ${booths.map(b => { const team = S.staffList(b.code).sort((x, y) => (x.role === 'manager' ? 0 : 1) - (y.role === 'manager' ? 0 : 1) || x.name.localeCompare(y.name)); return `
        <section class="panel" style="border-left:6px solid ${b.color}">
          <div class="row"><p class="h3">${badge(b, 'sm')} ${esc(b.name)} <span class="sub">${team.length} ${team.length === 1 ? 'person' : 'people'}</span></p>
            <button class="btn ghost sm" data-pp-new="${b.code}">${icon('plus')} Add</button></div>
          ${team.length ? `<ul class="people-list">${team.map(s => `<li>
            <span><b>${esc(s.name)}</b> <span class="pill ${s.role === 'manager' ? 'ok' : ''}">${s.role === 'manager' ? 'Manager' : 'Cashier'}</span>
              ${S.isDefault(s) ? '<span class="pill bad">PIN still 1234</span>' : ''}
              ${s.anyBooth ? '<br><span class="sub">Can sign in at any booth</span>' : (s.also || []).length ? `<br><span class="sub">Also at ${s.also.map(c => esc((S.booth(c) || { name: c }).name)).join(', ')}</span>` : ''}</span>
            <button class="btn ghost sm" data-pp-edit="${s.staff_id}">${icon('edit')} Edit</button></li>`).join('')}</ul>`
            : '<p class="sub">No one yet. Every booth needs at least one manager.</p>'}
        </section>`; }).join('')}
      <section class="panel">
        <p class="h3">${icon('key')} Moderator account</p>
        ${S.isDefaultPin('ADMIN') ? '<p class="sub"><span class="bad-text">You are still using the starting PIN 1234. Change it now.</span></p>' : ''}
        <div class="inline-form"><input class="input" id="adminPin" type="password" inputmode="numeric" maxlength="4" placeholder="New 4-digit PIN" autocomplete="new-password">
          <button class="btn primary" data-admin-pin>Change PIN</button></div>
      </section>`;
  }

  function form() {
    const booths = S.catalog().booths.filter(b => b.active !== false);
    openSheet(`${head(d.staff_id ? 'Edit ' + esc(d.name) : 'Add a person')}
      <div class="form" id="ppForm">
        <label class="field"><span>Name</span><input class="input" id="ppName" value="${esc(d.name)}" placeholder="Maria Santos" autocomplete="off" ${d.staff_id ? '' : 'autofocus'}>
          <small>This is what they tap on the booth phone.</small></label>
        <div class="field-row">
          <label class="field"><span>Booth</span><select class="input" id="ppBooth">${booths.map(b => `<option value="${b.code}" ${b.code === d.booth ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Role</span><select class="input" id="ppRole"><option value="cashier" ${d.role === 'cashier' ? 'selected' : ''}>Cashier (sells)</option><option value="manager" ${d.role === 'manager' ? 'selected' : ''}>Manager (can undo, close day, stock)</option></select></label>
        </div>
        <div class="field-row">
          <label class="field"><span>${d.staff_id ? 'New PIN' : 'PIN'} <small>(4 digits)</small></span><input class="input num" id="ppPin" type="password" inputmode="numeric" maxlength="4" placeholder="${d.staff_id ? 'Leave blank to keep' : '••••'}" autocomplete="new-password"></label>
          <label class="field"><span>Type the PIN again</span><input class="input num" id="ppPin2" type="password" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="new-password"></label>
        </div>
        <fieldset class="field"><span>Can also sign in at</span><small>Their role is the same at every booth they can sign in to.</small>
          <label class="check"><input type="checkbox" id="ppAny" ${d.anyBooth ? 'checked' : ''}> Any booth</label>
          <div class="checks" id="ppAlso" ${d.anyBooth ? 'hidden' : ''}>${booths.filter(b => b.code !== d.booth).map(b => `<label class="check"><input type="checkbox" value="${b.code}" ${(d.also || []).includes(b.code) ? 'checked' : ''}>${badge(b, 'sm')}${esc(b.name)}</label>`).join('') || '<p class="sub">No other booths.</p>'}</div>
        </fieldset>
        <p class="err" id="ppErr" role="alert"></p>
        <div class="btn-grid"><button type="button" class="btn go" data-pp-save>${icon('check')} Save</button>
          ${d.staff_id ? `<button type="button" class="btn ghost" data-pp-del>${icon('trash')} Remove</button>` : ''}</div>
      </div>`);
  }

  function read() {
    const v = id => document.getElementById(id).value.trim();
    Object.assign(d, { name: v('ppName'), booth: v('ppBooth'), role: v('ppRole'), pin: v('ppPin'), pin2: v('ppPin2'),
      anyBooth: document.getElementById('ppAny').checked, also: [...document.querySelectorAll('#ppAlso input:checked')].map(i => i.value).filter(c => c !== v('ppBooth')) });
  }
  const taken = except => new Set(S.catalog().staff.filter(s => s.active !== false && s.staff_id !== except).map(s => s.username));

  // Save through the booth's Team rules (safe PINs, at least one manager per booth). The username is a hidden id made from the name.
  // No two people with the same name on one booth's sign-in list, since the name is what they tap.
  function save() {
    read();
    const err = m => { document.getElementById('ppErr').textContent = m; };
    if (CS.customer.name(d.name).length < 2) return err('Type their name.');
    const nm = CS.customer.name(d.name).toLowerCase(), all = S.catalog().booths.filter(b => b.active !== false).map(b => b.code);
    const clash = (d.anyBooth ? all : [d.booth, ...d.also]).find(b => S.staffFor(b).some(s => s.staff_id !== d.staff_id && s.role !== 'admin' && s.name.toLowerCase() === nm));
    if (clash) return err(`Someone named ${CS.customer.name(d.name)} can already sign in at ${(S.booth(clash) || { name: clash }).name}. Add a last name or initial so they can tell who is who.`);
    if (!d.username) d.username = CS.team.suggest(d.name, (S.booth(d.booth) || {}).name || 'booth', taken(d.staff_id));
    if ((d.pin || d.pin2) && d.pin !== d.pin2) return err('The two PINs are not the same. Type them again.');
    const c = clone(S.catalog()), old = d.staff_id ? (c.staff.find(s => s.staff_id === d.staff_id) || {}).booth : '';
    const team = CS.team.fromCatalog(d.booth).filter(p => p.staff_id !== d.staff_id);
    team.push({ staff_id: d.staff_id, name: d.name, username: d.username, role: d.role, pin: d.pin });
    const e = CS.team.apply(team, c, d.booth);
    if (e) return err(e);
    if (old && old !== d.booth && !c.staff.some(s => s.booth === old && s.active !== false && s.role === 'manager'))
      return err(`${(S.booth(old) || { name: old }).name} would have no manager left. Add another manager there first.`);
    const rec = c.staff.find(s => s.active !== false && s.username === d.username);
    if (rec) { rec.anyBooth = !!d.anyBooth; rec.also = d.anyBooth ? [] : d.also; }
    S.saveCatalog(c);
    closeSheet(); toast(`${CS.customer.name(d.name)} saved. They can pick their name on the booth phone.`); CS.admin.refresh(); if (CS.sync) CS.sync.run();
  }

  function remove() {
    const c = clone(S.catalog()), team = CS.team.fromCatalog(d.booth).filter(p => p.staff_id !== d.staff_id);
    const e = CS.team.apply(team, c, d.booth);
    if (e) { document.getElementById('ppErr').textContent = e === 'Every booth needs at least one manager.' ? 'This is the last manager of the booth. Add another manager first.' : e; return; }
    S.saveCatalog(c);
    closeSheet(); toast(`${d.name} removed. Their past sales keep their name.`); CS.admin.refresh(); if (CS.sync) CS.sync.run();
  }

  function click(e, t) {
    const k = t.dataset;
    if ('ppNew' in k) { d = { staff_id: '', name: '', username: '', role: 'cashier', booth: k.ppNew || (S.catalog().booths[0] || {}).code, pin: '', also: [], anyBooth: false }; form(); }
    else if (k.ppEdit) { const s = S.catalog().staff.find(x => x.staff_id === k.ppEdit); d = { staff_id: s.staff_id, name: s.name, username: s.username, role: s.role, booth: s.booth, pin: '', also: (s.also || []).slice(), anyBooth: !!s.anyBooth }; form(); }
    else if ('ppSave' in k) save();
    else if ('ppDel' in k) remove();
    else if ('adminPin' in k) {
      const v = document.getElementById('adminPin').value.trim(), c = clone(S.catalog());
      const me = c.staff.find(x => x.booth === 'ADMIN' && x.active !== false);
      if (!v) return toast('Type a new 4-digit PIN.', 'bad');
      if (v && CS.pin.weak(v)) return toast(CS.pin.weak(v), 'bad');
      S.setStaffPin(me, v);
      S.saveCatalog(c); toast('Moderator PIN changed.'); CS.admin.refresh(); if (CS.sync) CS.sync.run();
    }
  }
  function input(e) {
    const t = e.target;
    if (t.id === 'ppPin' || t.id === 'ppPin2' || t.id === 'adminPin') t.value = t.value.replace(/\D/g, '');
  }
  function change(e) {
    const t = e.target;
    if (t.id === 'ppName') t.value = CS.customer.name(t.value);
    if (t.id === 'ppAny') document.getElementById('ppAlso').hidden = t.checked;
    if (t.id === 'ppBooth') { read(); form(); } // the "also at" list leaves out the home booth
  }

  return { render, click, input, change };
})();
