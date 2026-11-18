/* A booth's team: managers and cashiers, each with a username and their own PIN.
   Used inside the Booths editor. Removing someone turns their account off (old sales keep their name). */
CS.team = (function () {
  const U = CS.util, { esc } = U, S = CS.store;

  const fromCatalog = code => S.staffList(code).filter(s => s.role !== 'admin')
    .map(s => ({ staff_id: s.staff_id, name: s.name, username: s.username, role: s.role, pin: '', isDefault: S.isDefault(s) }));
  const blank = role => ({ staff_id: '', name: '', username: '', role, pin: '' });

  function html(team) {
    const { icon } = CS.ui;
    return `<div><p class="h3">${icon('user')} Team</p>
        <p class="sub"><b>Managers</b> can do everything at the booth. <b>Cashiers</b> can sell; undoing a sale, closing the day and changing stock need a manager's PIN.
        Everyone signs in with their own username and PIN, one person per phone at a time.</p></div>
      <div class="team">${team.map((p, i) => `
        <div class="team-row" data-ti="${i}">
          <label class="mini-field"><span>Name</span><input class="input" data-tf="name" value="${esc(p.name)}" placeholder="Juan Dela Cruz" autocomplete="off"></label>
          <label class="mini-field"><span>Username</span><input class="input" data-tf="username" value="${esc(p.username)}" placeholder="juan.photo" autocapitalize="none" spellcheck="false" autocomplete="off"></label>
          <label class="mini-field"><span>Role</span><select class="input" data-tf="role"><option value="manager" ${p.role === 'manager' ? 'selected' : ''}>Manager</option><option value="cashier" ${p.role === 'cashier' ? 'selected' : ''}>Cashier</option></select></label>
          <label class="mini-field"><span>${p.staff_id ? 'New PIN' : 'PIN'}${p.isDefault ? ' <b class="bad-text">(still 1234)</b>' : ''}</span><input class="input num" data-tf="pin" value="${esc(p.pin)}" inputmode="numeric" maxlength="4" placeholder="${p.staff_id ? 'Keep' : '4 digits'}" autocomplete="off"></label>
          <button type="button" class="icon-btn" data-t-del="${i}" aria-label="Remove ${esc(p.name || 'this person')}">${icon('trash')}</button>
        </div>`).join('') || '<p class="sub">No one yet.</p>'}</div>
      <div class="btn-row"><button type="button" class="btn ghost" data-t-add="cashier">${icon('plus')} Add a cashier</button>
        <button type="button" class="btn ghost" data-t-add="manager">${icon('plus')} Add a manager</button></div>`;
  }

  function read(team) {
    document.querySelectorAll('#boothForm .team-row').forEach(r => {
      const p = team[+r.dataset.ti], v = k => r.querySelector(`[data-tf="${k}"]`).value.trim();
      Object.assign(p, { name: v('name'), username: S.uname(v('username')), role: v('role'), pin: v('pin') });
    });
  }

  // Suggest a username from the first name + booth, e.g. "juan.photo", never one already taken.
  function suggest(name, boothName, taken) {
    const first = (name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z]+/) || ['user'])[0];
    const tail = (boothName.toLowerCase().match(/[a-z]+/) || ['booth'])[0];
    let u = `${first}.${tail}`.slice(0, 20), n = 2;
    while (taken.has(u)) u = `${first}.${tail}${n++}`.slice(0, 20);
    return u;
  }

  // '' when fine; otherwise what to fix. Writes the team into catalog c for booth `code`.
  function apply(team, c, code) {
    const people = team.filter(p => p.name || p.username || p.pin);
    const mine = new Set(people.map(p => p.staff_id).filter(Boolean));
    const others = new Set(c.staff.filter(s => s.active !== false && !mine.has(s.staff_id)).map(s => s.username));
    const seen = new Set();
    for (const p of people) {
      const who = p.name || p.username || 'someone';
      if (CS.customer.name(p.name).length < 2) return `Type the name of ${who}.`;
      if (!/^[a-z0-9._-]{3,20}$/.test(p.username)) return `${who}: the username needs 3 to 20 letters or numbers (dots and dashes are okay).`;
      if (others.has(p.username) || seen.has(p.username)) return `The username "${p.username}" is already used. Pick another for ${who}.`;
      seen.add(p.username);
      if (!p.staff_id && !p.pin) return `Give ${who} a PIN.`;
      if (p.pin && CS.pin.weak(p.pin)) return `${who}: ${CS.pin.weak(p.pin)}`;
    }
    if (!people.some(p => p.role === 'manager')) return 'Every booth needs at least one manager.';
    people.forEach(p => {
      let s = p.staff_id && c.staff.find(x => x.staff_id === p.staff_id);
      if (!s) { s = { staff_id: `${code}-${U.rand(5)}`, booth: code }; c.staff.push(s); }
      Object.assign(s, { name: CS.customer.name(p.name), username: p.username, role: p.role, booth: code, active: true });
      if (p.pin) S.setStaffPin(s, p.pin);
    });
    c.staff.forEach(s => { if (s.booth === code && s.role !== 'admin' && !people.some(p => p.staff_id === s.staff_id) && !people.some(p => p.username === s.username)) s.active = false; });
    return '';
  }

  return { fromCatalog, blank, html, read, suggest, apply };
})();
