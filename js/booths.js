/* Moderator → Booths: add/edit booths, their items & prices, color, icon, PIN. */
CS.views = CS.views || {};
CS.views.booths = (function () {
  const U = CS.util, { esc } = U, S = CS.store, { icon, badge, toast, openSheet, closeSheet, head, BOOTH_ICONS, COLORS } = CS.ui;
  let draft = null;
  const clone = o => JSON.parse(JSON.stringify(o));

  function render(el) {
    if (!S.events().length) {
      el.innerHTML = `<div class="view-head"><div><h2 class="h1">Booths</h2><p class="sub">Each booth has its own items, prices, team and stock.</p></div></div>
        <div class="empty big">${icon('calendar')}<p class="h3">Set up an event first</p>
          <p>Booths sell at an event, so create the event (name, dates, venue) before setting up booths.</p>
          <button class="btn primary" data-view="events">${icon('plus')} Create an event</button></div>`;
      return;
    }
    const c = S.catalog();
    el.innerHTML = `
      <div class="view-head"><div><h2 class="h1">Booths</h2>
        <p class="sub">Each booth has its own items, prices, color and PIN.</p></div>
        <button class="btn primary" data-b-new>${icon('plus')} New booth</button></div>
      <ul class="cards">${c.booths.map(b => {
        const n = c.products.filter(p => p.booth === b.code && p.active).length;
        return `<li class="card" style="--booth:${b.color}">
          <div class="card-main row-start">${badge(b, 'lg')}<div>
            <p class="h3">${esc(b.name)} ${b.active === false ? '<span class="pill">Hidden</span>' : ''}</p>
            <p class="sub">${esc(b.hint || '')}</p>
            ${stockLine(b.code)}
            <p class="sub">${n} item${n === 1 ? '' : 's'} · tickets look like <b class="mono">${esc(S.ticketFormat(b, 1))}</b> · ${(t => `${t.filter(x => x.role === 'manager').length} manager(s) · ${t.filter(x => x.role === 'cashier').length} cashier(s)`)(S.staffList(b.code))}${S.isDefaultPin(b.code) ? ' · <span class="bad-text">still using PIN 1234</span>' : ''}</p></div></div>
          <button class="icon-btn edit-btn" data-b-edit="${b.code}" aria-label="Edit ${esc(b.name)}" title="Edit booth & items">${icon('edit')}</button></li>`;
      }).join('')}</ul>
      <section class="panel">
        <p class="h3">${icon('key')} Moderator account</p>
        <p class="sub">${S.isDefaultPin('ADMIN') ? '<span class="bad-text">You are still using the starting PIN 1234. Change it now.</span>' : 'The username and PIN you use to open this page.'}</p>
        <div class="inline-form"><input class="input" id="adminUser" value="${esc((S.staffList('ADMIN')[0] || {}).username || 'moderator')}" placeholder="Username" autocapitalize="none" spellcheck="false" autocomplete="off">
          <input class="input" id="adminPin" type="password" inputmode="numeric" maxlength="4" placeholder="New 4-digit PIN" autocomplete="new-password">
          <button class="btn primary" data-admin-pin>Save</button></div>
      </section>`;
  }

  function stockLine(code) {
    const list = CS.stock.items(code), hand = CS.stock.onHand(code);
    return list.length ? `<div class="badges">${list.map(s => { const n = hand[s.stock_id] || 0; return `<span class="pill ${n <= 0 || CS.stock.isLow(s, n) ? 'bad' : 'ok'}">${esc(s.name)}: ${n} ${esc(s.unit)}</span>`; }).join('')}</div>` : '';
  }

  function ticketPreview() {
    const f = document.getElementById('boothForm'), el = document.getElementById('tkPreview'); if (!f || !el) return;
    const b = { code: draft.code || 'T', prefix: f.prefix.value || (draft.name || 'T')[0].toUpperCase(), ticket_start: f.ticket_start.value };
    const reset = { day: 'every morning', event: 'when a new event starts', never: 'never (keeps counting)' }[f.ticket_reset.value];
    el.innerHTML = `Tickets will look like <b class="mono">${esc(S.ticketFormat(b, 1))}</b>, <b class="mono">${esc(S.ticketFormat(b, 2))}</b>, <b class="mono">${esc(S.ticketFormat(b, 3))}</b>… · back to the start ${reset}.`;
  }

  function form() {
    const b = draft, hand = b.code ? CS.stock.onHand(b.code) : {};
    openSheet(`${head(b.isNew ? 'New booth' : 'Edit ' + esc(b.name))}
      <form id="boothForm" class="form" novalidate>
        <label class="field"><span>Booth name</span><input name="name" value="${esc(b.name)}" placeholder="Photobooth" required ${b.isNew ? 'autofocus' : ''}></label>
        <label class="field"><span>Short description <small>(shown on the sign-in screen)</small></span><input name="hint" value="${esc(b.hint)}" placeholder="Strips & prints"></label>
        <fieldset class="field"><span>Color</span><div class="swatches">${COLORS.map(c => `
          <label><input type="radio" name="color" value="${c}" ${b.color === c ? 'checked' : ''}><i style="background:${c}"></i><span class="sr">${c}</span></label>`).join('')}</div></fieldset>
        <fieldset class="field"><span>Icon</span><div class="icon-pick">${BOOTH_ICONS.map(n => `
          <label><input type="radio" name="icon" value="${n}" ${b.icon === n ? 'checked' : ''}><i>${icon(n)}</i><span class="sr">${n}</span></label>`).join('')}</div></fieldset>
        <fieldset class="field tickets-set"><span>${icon('ticket')} Ticket numbers</span>
          <small>For items that get a ticket (photos, poems, drawings). The customer is called by this number. The number can be up to 12 digits.</small>
          <div class="ticket-grid">
            <label class="mini-field"><span>Prefix</span><input class="input" name="prefix" value="${esc(b.prefix)}" maxlength="4" placeholder="P" autocomplete="off"></label>
            <label class="mini-field"><span>Start at</span><input class="input num" name="ticket_start" value="${esc(b.ticket_start || 1)}" inputmode="numeric" maxlength="12" autocomplete="off"></label>
            <label class="mini-field"><span>Counting restarts</span><select class="input" name="ticket_reset">${[['day', 'Every day'], ['event', 'Every event'], ['never', 'Never']].map(([v, l]) => `<option value="${v}" ${(b.ticket_reset || 'day') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          </div>
        </fieldset>
        <div><p class="h3">Stock to track <small class="sub">(optional)</small></p>
          <p class="sub">Supplies this booth uses up, like photo paper or pins. Each sale takes them out by itself.</p></div>
        <div class="stocks">${b.stock.map((s, i) => { const n = hand[s.stock_id]; return `
          <div class="stock-row" data-si="${i}">
            <input class="input" data-sf="name" value="${esc(s.name)}" placeholder="e.g. Photo paper" aria-label="Stock item name">
            <select class="input" data-sf="unit" aria-label="Unit">${CS.stock.UNITS.map(u => `<option ${s.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select>
            <label class="mini-field"><span>Warn at</span><input class="input num" data-sf="low" value="${esc(s.low_at)}" inputmode="numeric" placeholder="10"></label>
            <label class="mini-field"><span>Add now${n != null ? ` <b>(has ${n})</b>` : ''}</span><input class="input num" data-sf="add" value="${esc(s.add || '')}" inputmode="numeric" placeholder="0"></label>
            <button type="button" class="icon-btn" data-s-del="${i}" aria-label="Remove stock item">${icon('trash')}</button>
          </div>`; }).join('')}</div>
        <button type="button" class="btn ghost" data-s-add>${icon('plus')} Add a stock item</button>
        <div><p class="h3">Things to sell</p>
          <p class="sub"><b>Ticket</b> = customer waits for it (photo, poem, drawing). <b>Hand over</b> = ready-made (sticker, pin).</p></div>
        <div class="prods">${b.products.map((p, i) => `
          <div class="prod-row" data-i="${i}">
            <input class="input" data-f="name" value="${esc(p.name)}" placeholder="Item name" aria-label="Item name">
            <span class="peso"><input class="input num" data-f="price" value="${p.price === '' ? '' : esc(p.price)}" inputmode="decimal" placeholder="0" aria-label="Price in pesos"></span>
            <select class="input" data-f="type" aria-label="Kind"><option value="service" ${p.type === 'service' ? 'selected' : ''}>Ticket</option><option value="good" ${p.type === 'good' ? 'selected' : ''}>Hand over</option></select>
            <button type="button" class="icon-btn" data-p-del="${i}" aria-label="Remove item">${icon('trash')}</button>
            ${b.stock.length ? `<div class="uses"><span class="sub">Uses from stock:</span>${[0, 1].map(k => { const u = p.uses[k] || {}; return `<span class="use-pair">
              <select class="input" data-f="u${k}" aria-label="Stock used"><option value="">${k ? 'and…' : 'Nothing'}</option>${b.stock.map(s => `<option value="${s.stock_id}" ${u.stock_id === s.stock_id ? 'selected' : ''}>${esc(s.name || 'Unnamed')}</option>`).join('')}</select>
              <span class="sub">×</span><input class="input num qty" data-f="q${k}" value="${esc(u.qty || 1)}" inputmode="numeric" aria-label="How many used"></span>`; }).join('')}</div>` : ''}
          </div>`).join('') || '<p class="sub">No items yet.</p>'}</div>
        <button type="button" class="btn ghost" data-p-add>${icon('plus')} Add an item</button>
        <label class="check"><input type="checkbox" name="active" ${b.active !== false ? 'checked' : ''}> Show this booth on booth phones</label>
        <p class="err" id="bErr" role="alert"></p>
        <button class="btn primary wide" type="submit">${icon('check')} Save booth</button>
      </form>`);
    ticketPreview();
  }

  // Copy what the user typed back into the draft, so re-rendering keeps it.
  function read() {
    const f = document.getElementById('boothForm'); if (!f) return;
    const fd = new FormData(f);
    Object.assign(draft, { name: fd.get('name').trim(), hint: fd.get('hint').trim(), color: fd.get('color') || draft.color, icon: fd.get('icon') || draft.icon,
      prefix: fd.get('prefix').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''), ticket_start: fd.get('ticket_start').trim(), ticket_reset: fd.get('ticket_reset'), active: fd.get('active') === 'on' });

    f.querySelectorAll('.prod-row').forEach(r => {
      const p = draft.products[+r.dataset.i], v = k => r.querySelector(`[data-f="${k}"]`).value;
      Object.assign(p, { name: v('name').trim(), price: v('price').trim(), type: v('type') });
      if (r.querySelector('[data-f="u0"]')) p.uses = [0, 1].map(k => ({ stock_id: v('u' + k), qty: Math.max(1, parseInt(v('q' + k), 10) || 1) })).filter(u => u.stock_id);
    });
    f.querySelectorAll('.stock-row').forEach(r => {
      const s = draft.stock[+r.dataset.si], v = k => r.querySelector(`[data-sf="${k}"]`).value.trim();
      Object.assign(s, { name: v('name'), unit: v('unit'), low_at: v('low'), add: v('add') });
    });
  }

  function makeCode(name, taken) {
    const base = (name.toUpperCase().replace(/[^A-Z]/g, '') || 'BOOTH').slice(0, 6);
    let code = base, n = 2;
    while (taken.includes(code) || ['ADMIN', 'ALL'].includes(code)) code = base + n++;
    return code;
  }

  function save() {
    read();
    const err = m => { document.getElementById('bErr').textContent = m; };
    const b = draft, prods = b.products.filter(p => p.name || p.price);
    if (!b.name) return err('Give the booth a name.');
    const bad = prods.find(p => !p.name || isNaN(U.centavos(p.price)) || U.centavos(p.price) < 0);
    if (bad) return err(`Check "${bad.name || 'an item'}": every item needs a name and a price.`);
    const stocks = b.stock.filter(s => s.name);
    if (b.stock.some(s => !s.name && (s.add || s.low_at))) return err('Every stock item needs a name.');

    const c = clone(S.catalog());
    const code = b.code || makeCode(b.name, c.booths.map(x => x.code));
    const rec = { code, name: b.name, hint: b.hint, color: b.color, icon: b.icon, prefix: b.prefix || code[0], active: b.active,
      ticket_start: Math.max(0, parseInt(b.ticket_start, 10) || 1), ticket_reset: b.ticket_reset || 'day' };
    const i = c.booths.findIndex(x => x.code === code);
    if (i >= 0) c.booths[i] = { ...c.booths[i], ...rec }; else c.booths.push(rec);

    const keep = new Set();
    prods.forEach(p => {
      const price_c = U.centavos(p.price), old = p.sku && c.products.find(x => x.sku === p.sku);
      const uses = (p.uses || []).filter(u => stocks.some(s => s.stock_id === u.stock_id));
      if (old) { Object.assign(old, { name: p.name, price_c, type: p.type, uses, active: true }); keep.add(old.sku); }
      else { const sku = `${code}-${U.rand(4)}`; keep.add(sku); c.products.push({ sku, booth: code, name: p.name, type: p.type, price_c, cost_c: 0, low_at: 10, est_min: 0, uses, active: true }); }
    });
    c.products.forEach(p => { if (p.booth === code && !keep.has(p.sku)) p.active = false; }); // hidden, never deleted: old sales keep their names

    c.stock = c.stock || [];
    const keepS = new Set(stocks.map(s => s.stock_id));
    stocks.forEach(s => {
      const rec2 = { stock_id: s.stock_id, booth: code, name: s.name, unit: s.unit || 'pcs', low_at: Math.max(0, parseInt(s.low_at, 10) || 0), active: true };
      const j = c.stock.findIndex(x => x.stock_id === s.stock_id);
      if (j >= 0) c.stock[j] = rec2; else c.stock.push(rec2);
    });
    c.stock.forEach(x => { if (x.booth === code && !keepS.has(x.stock_id)) x.active = false; });


    S.saveCatalog(c);
    CS.stock.add(stocks.filter(s => parseInt(s.add, 10) > 0).map(s => ({ booth: code, stock_id: s.stock_id, qty: parseInt(s.add, 10), reason: 'restock', note: 'Added by moderator' })));
    closeSheet(); toast('Booth saved.'); CS.admin.refresh(); if (CS.sync) CS.sync.run();
  }

  function click(e, t) {
    const d = t.dataset;
    if ('bNew' in d) {
      const used = S.catalog().booths.map(b => b.color);
      draft = { isNew: true, code: '', name: '', hint: '', color: COLORS.find(c => !used.includes(c)) || COLORS[0], icon: 'store', prefix: '', pin: '', active: true,
        products: [{ sku: '', name: '', price: '', type: 'service', uses: [] }], stock: [] };
      form();
    } else if (d.bEdit) {
      const c = S.catalog(), b = c.booths.find(x => x.code === d.bEdit);
      draft = { ...clone(b), isNew: false,
        products: c.products.filter(p => p.booth === b.code && p.active).map(p => ({ sku: p.sku, name: p.name, price: String(p.price_c / 100), type: p.type, uses: clone(p.uses || []) })),
        stock: CS.stock.items(b.code).map(s => ({ ...clone(s), add: '' })) };
      form();
    } else if ('pAdd' in d) {
      read(); draft.products.push({ sku: '', name: '', price: '', type: draft.products.length ? draft.products[draft.products.length - 1].type : 'service', uses: [] }); form();
      const rows = document.querySelectorAll('.prod-row [data-f="name"]'); if (rows.length) rows[rows.length - 1].focus();
    } else if (d.pDel) { read(); draft.products.splice(+d.pDel, 1); form(); }
    else if ('sAdd' in d) {
      read(); draft.stock.push({ stock_id: 'STK-' + U.rand(6), name: '', unit: 'pcs', low_at: '10', add: '' }); form();
      const rows = document.querySelectorAll('.stock-row [data-sf="name"]'); if (rows.length) rows[rows.length - 1].focus();
    } else if (d.sDel) {
      read(); const gone = draft.stock.splice(+d.sDel, 1)[0];
      draft.products.forEach(p => { p.uses = (p.uses || []).filter(u => u.stock_id !== gone.stock_id); }); form();
    }
    else if ('adminPin' in d) {
      const u = S.uname(document.getElementById('adminUser').value), v = document.getElementById('adminPin').value.trim(), c = clone(S.catalog());
      const me = c.staff.find(x => x.booth === 'ADMIN' && x.active !== false);
      if (!/^[a-z0-9._-]{3,20}$/.test(u)) return toast('The username needs 3 to 20 letters or numbers.', 'bad');
      if (c.staff.some(x => x.active !== false && x !== me && x.username === u)) return toast('That username is already used.', 'bad');
      if (v && CS.pin.weak(v)) return toast(CS.pin.weak(v), 'bad');
      if (!v && S.isDefault(me)) return toast('Set a new PIN too. 1234 is not safe.', 'bad');
      me.username = u; if (v) S.setStaffPin(me, v);
      S.saveCatalog(c); toast('Moderator account saved.'); CS.admin.refresh(); if (CS.sync) CS.sync.run();
    }
  }
  function submit(e) { if (e.target.id === 'boothForm') { e.preventDefault(); save(); } }
  function input(e) {
    const t = e.target;
    if (t.name === 'prefix') { const v = t.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); if (v !== t.value) t.value = v; }
    if (t.name === 'ticket_start') t.value = t.value.replace(/\D/g, '').slice(0, 12);
    if (t.closest && t.closest('.tickets-set')) ticketPreview();
    if (t.id === 'adminUser' || t.dataset.tf === 'username') { const v = S.uname(t.value); if (v !== t.value) t.value = v; }
    if (t.id === 'adminPin' || t.dataset.tf === 'pin' || ['low', 'add'].includes(t.dataset.sf) || /^q\d$/.test(t.dataset.f || '')) t.value = t.value.replace(/\D/g, '');
    if (t.dataset.sf === 'name') { // keep the "Uses from stock" choices in step with the name being typed
      const s = draft.stock[+t.closest('.stock-row').dataset.si];
      document.querySelectorAll(`#boothForm option[value="${s.stock_id}"]`).forEach(o => { o.textContent = t.value || 'Unnamed'; });
    }
  }

  function change(e) {
    const t = e.target;
    if (t.closest && t.closest('.tickets-set')) ticketPreview();
  }

  return { render, click, submit, input, change };
})();
