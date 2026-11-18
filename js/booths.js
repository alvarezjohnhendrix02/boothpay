/* Moderator → Booths: add/edit booths, their items & prices, color, icon, PIN. */
CS.views = CS.views || {};
CS.views.booths = (function () {
  const U = CS.util, { esc } = U, S = CS.store, { icon, badge, toast, openSheet, closeSheet, head, BOOTH_ICONS, COLORS } = CS.ui;
  let draft = null;
  const clone = o => JSON.parse(JSON.stringify(o));

  function render(el) {
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
            <p class="sub">${n} item${n === 1 ? '' : 's'} · tickets start with <b class="mono">${esc(b.prefix)}-</b> · ${S.hasPin(b.code, 'cashier') ? 'lead + cashier PINs' : 'lead PIN only'}${S.isDefaultPin(b.code) ? ' · <span class="bad-text">still using PIN 1234</span>' : ''}</p></div></div>
          <div class="card-actions"><button class="btn ghost sm" data-b-edit="${b.code}">${icon('edit')} Edit booth & items</button></div></li>`;
      }).join('')}</ul>
      <section class="panel">
        <p class="h3">${icon('key')} Moderator PIN</p>
        <p class="sub">${S.isDefaultPin('ADMIN') ? '<span class="bad-text">You are still using the starting PIN 1234. Change it now.</span>' : 'Change the PIN you use to open this page.'}</p>
        <div class="inline-form"><input class="input" id="adminPin" inputmode="numeric" maxlength="4" placeholder="New 4-digit PIN" autocomplete="off">
          <button class="btn primary" data-admin-pin>Save PIN</button></div>
      </section>`;
  }

  function stockLine(code) {
    const list = CS.stock.items(code), hand = CS.stock.onHand(code);
    return list.length ? `<div class="badges">${list.map(s => { const n = hand[s.stock_id] || 0; return `<span class="pill ${n <= 0 || CS.stock.isLow(s, n) ? 'bad' : 'ok'}">${esc(s.name)}: ${n} ${esc(s.unit)}</span>`; }).join('')}</div>` : '';
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
        <div class="field-row">
          <label class="field"><span>Ticket letter</span><input name="prefix" value="${esc(b.prefix)}" maxlength="2" placeholder="P"><small>Tickets look like ${esc(b.prefix || 'P')}-001</small></label>
          <span></span>
        </div>
        <div><p class="h3">${icon('key')} PINs</p><p class="sub">The <b>lead</b> can do everything at the booth. A <b>cashier</b> can only sell; undoing a sale, closing the day and changing stock need the lead's PIN.</p></div>
        <div class="field-row">
          <label class="field"><span>Lead PIN</span><input name="pin" value="${esc(b.pin || '')}" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="${b.isNew ? '1234' : 'Keep current'}"><small>${b.isNew ? 'Blank = 1234 (change it later)' : 'Blank = keep current PIN'}</small></label>
          <label class="field"><span>Cashier PIN <small>(optional)</small></span><input name="cpin" value="${esc(b.cpin || '')}" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="${b.hasCashier ? 'Keep current' : 'None'}"><small>${b.hasCashier ? 'Blank = keep current PIN' : 'Blank = no cashier PIN'}</small></label>
        </div>
        ${b.hasCashier ? `<label class="check"><input type="checkbox" name="nocashier" ${b.nocashier ? 'checked' : ''}> Turn off the cashier PIN</label>` : ''}
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
  }

  // Copy what the user typed back into the draft, so re-rendering keeps it.
  function read() {
    const f = document.getElementById('boothForm'); if (!f) return;
    const fd = new FormData(f);
    Object.assign(draft, { name: fd.get('name').trim(), hint: fd.get('hint').trim(), color: fd.get('color') || draft.color, icon: fd.get('icon') || draft.icon,
      prefix: fd.get('prefix').trim().toUpperCase(), pin: fd.get('pin').trim(), cpin: fd.get('cpin').trim(), nocashier: fd.get('nocashier') === 'on', active: fd.get('active') === 'on' });
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
    if (b.pin && CS.pin.weak(b.pin)) return err('Lead PIN: ' + CS.pin.weak(b.pin));
    if (b.cpin && CS.pin.weak(b.cpin)) return err('Cashier PIN: ' + CS.pin.weak(b.cpin));
    if (b.pin && b.pin === b.cpin) return err('The lead and cashier PINs must be different.');
    const bad = prods.find(p => !p.name || isNaN(U.centavos(p.price)) || U.centavos(p.price) < 0);
    if (bad) return err(`Check "${bad.name || 'an item'}": every item needs a name and a price.`);
    const stocks = b.stock.filter(s => s.name);
    if (b.stock.some(s => !s.name && (s.add || s.low_at))) return err('Every stock item needs a name.');

    const c = clone(S.catalog());
    const code = b.code || makeCode(b.name, c.booths.map(x => x.code));
    const rec = { code, name: b.name, hint: b.hint, color: b.color, icon: b.icon, prefix: b.prefix || code[0], active: b.active };
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

    if (b.pin) S.setPin(code, b.pin, c, 'lead');
    else if (!c.staff.some(s => s.booth === code && (s.role || 'lead') === 'lead')) S.setPin(code, '1234', c, 'lead');
    if (b.cpin) S.setPin(code, b.cpin, c, 'cashier');
    else if (b.nocashier) S.setPin(code, null, c, 'cashier');
    const lead = c.staff.find(s => s.booth === code && (s.role || 'lead') === 'lead' && s.active !== false), cash = c.staff.find(s => s.booth === code && s.role === 'cashier' && s.active !== false);
    if (lead && cash && lead.pin_hash === cash.pin_hash) return err('The lead and cashier PINs must be different.');
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
      draft = { ...clone(b), isNew: false, pin: '', cpin: '', hasCashier: S.hasPin(b.code, 'cashier'),
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
      const v = document.getElementById('adminPin').value.trim();
      if (CS.pin.weak(v)) return toast(CS.pin.weak(v), 'bad');
      S.saveCatalog(S.setPin('ADMIN', v, clone(S.catalog())));
      toast('Moderator PIN changed.'); CS.admin.refresh();
    }
  }
  function submit(e) { if (e.target.id === 'boothForm') { e.preventDefault(); save(); } }
  function input(e) {
    const t = e.target;
    if (t.id === 'adminPin' || t.name === 'pin' || t.name === 'cpin' || ['low', 'add'].includes(t.dataset.sf) || /^q\d$/.test(t.dataset.f || '')) t.value = t.value.replace(/\D/g, '');
    if (t.dataset.sf === 'name') { // keep the "Uses from stock" choices in step with the name being typed
      const s = draft.stock[+t.closest('.stock-row').dataset.si];
      document.querySelectorAll(`#boothForm option[value="${s.stock_id}"]`).forEach(o => { o.textContent = t.value || 'Unnamed'; });
    }
  }

  return { render, click, submit, input };
})();
