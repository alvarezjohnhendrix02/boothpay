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
            <p class="sub">${n} item${n === 1 ? '' : 's'} · tickets start with <b class="mono">${esc(b.prefix)}-</b>${S.isDefaultPin(b.code) ? ' · <span class="bad-text">still using PIN 1234</span>' : ''}</p></div></div>
          <div class="card-actions"><button class="btn ghost sm" data-b-edit="${b.code}">${icon('edit')} Edit booth & items</button></div></li>`;
      }).join('')}</ul>
      <section class="panel">
        <p class="h3">${icon('key')} Moderator PIN</p>
        <p class="sub">${S.isDefaultPin('ADMIN') ? '<span class="bad-text">You are still using the starting PIN 1234. Change it now.</span>' : 'Change the PIN you use to open this page.'}</p>
        <div class="inline-form"><input class="input" id="adminPin" inputmode="numeric" maxlength="4" placeholder="New 4-digit PIN" autocomplete="off">
          <button class="btn primary" data-admin-pin>Save PIN</button></div>
      </section>`;
  }

  function form() {
    const b = draft;
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
          <label class="field"><span>Booth PIN</span><input name="pin" value="${esc(b.pin || '')}" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="${b.isNew ? '1234' : 'Keep current'}"><small>${b.isNew ? 'Blank = 1234' : 'Blank = keep current PIN'}</small></label>
        </div>
        <div><p class="h3">Things to sell</p>
          <p class="sub"><b>Ticket</b> = customer waits for it (photo, poem, drawing). <b>Hand over</b> = ready-made (sticker, pin).</p></div>
        <div class="prods">${b.products.map((p, i) => `
          <div class="prod-row" data-i="${i}">
            <input class="input" data-f="name" value="${esc(p.name)}" placeholder="Item name" aria-label="Item name">
            <span class="peso"><input class="input num" data-f="price" value="${p.price === '' ? '' : esc(p.price)}" inputmode="decimal" placeholder="0" aria-label="Price in pesos"></span>
            <select class="input" data-f="type" aria-label="Kind"><option value="service" ${p.type === 'service' ? 'selected' : ''}>Ticket</option><option value="good" ${p.type === 'good' ? 'selected' : ''}>Hand over</option></select>
            <button type="button" class="icon-btn" data-p-del="${i}" aria-label="Remove item">${icon('trash')}</button>
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
      prefix: fd.get('prefix').trim().toUpperCase(), pin: fd.get('pin').trim(), active: fd.get('active') === 'on' });
    f.querySelectorAll('.prod-row').forEach(r => {
      const p = draft.products[+r.dataset.i], v = k => r.querySelector(`[data-f="${k}"]`).value;
      Object.assign(p, { name: v('name').trim(), price: v('price').trim(), type: v('type') });
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
    if (b.pin && !/^\d{4}$/.test(b.pin)) return err('The PIN must be exactly 4 numbers.');
    const bad = prods.find(p => !p.name || isNaN(U.centavos(p.price)) || U.centavos(p.price) < 0);
    if (bad) return err(`Check "${bad.name || 'an item'}": every item needs a name and a price.`);

    const c = clone(S.catalog());
    const code = b.code || makeCode(b.name, c.booths.map(x => x.code));
    const rec = { code, name: b.name, hint: b.hint, color: b.color, icon: b.icon, prefix: b.prefix || code[0], active: b.active };
    const i = c.booths.findIndex(x => x.code === code);
    if (i >= 0) c.booths[i] = { ...c.booths[i], ...rec }; else c.booths.push(rec);

    const keep = new Set();
    prods.forEach(p => {
      const price_c = U.centavos(p.price), old = p.sku && c.products.find(x => x.sku === p.sku);
      if (old) { Object.assign(old, { name: p.name, price_c, type: p.type, active: true }); keep.add(old.sku); }
      else { const sku = `${code}-${U.rand(4)}`; keep.add(sku); c.products.push({ sku, booth: code, name: p.name, type: p.type, price_c, cost_c: 0, low_at: 10, est_min: 0, active: true }); }
    });
    c.products.forEach(p => { if (p.booth === code && !keep.has(p.sku)) p.active = false; }); // hidden, never deleted: old sales keep their names

    if (b.pin) S.setPin(code, b.pin, c);
    else if (!c.staff.some(s => s.booth === code)) S.setPin(code, '1234', c);
    S.saveCatalog(c);
    closeSheet(); toast('Booth saved. Send the setup file to booth phones.'); CS.admin.refresh();
  }

  function click(e, t) {
    const d = t.dataset;
    if ('bNew' in d) {
      const used = S.catalog().booths.map(b => b.color);
      draft = { isNew: true, code: '', name: '', hint: '', color: COLORS.find(c => !used.includes(c)) || COLORS[0], icon: 'store', prefix: '', pin: '', active: true,
        products: [{ sku: '', name: '', price: '', type: 'service' }] };
      form();
    } else if (d.bEdit) {
      const c = S.catalog(), b = c.booths.find(x => x.code === d.bEdit);
      draft = { ...clone(b), isNew: false, pin: '',
        products: c.products.filter(p => p.booth === b.code && p.active).map(p => ({ sku: p.sku, name: p.name, price: String(p.price_c / 100), type: p.type })) };
      form();
    } else if ('pAdd' in d) {
      read(); draft.products.push({ sku: '', name: '', price: '', type: draft.products.length ? draft.products[draft.products.length - 1].type : 'service' }); form();
      const rows = document.querySelectorAll('.prod-row [data-f="name"]'); if (rows.length) rows[rows.length - 1].focus();
    } else if (d.pDel) { read(); draft.products.splice(+d.pDel, 1); form(); }
    else if ('adminPin' in d) {
      const v = document.getElementById('adminPin').value.trim();
      if (!/^\d{4}$/.test(v)) return toast('The PIN must be exactly 4 numbers.', 'bad');
      if (v === '1234') return toast('Pick a PIN other than 1234.', 'bad');
      S.saveCatalog(S.setPin('ADMIN', v, clone(S.catalog())));
      toast('Moderator PIN changed.'); CS.admin.refresh();
    }
  }
  function submit(e) { if (e.target.id === 'boothForm') { e.preventDefault(); save(); } }
  function input(e) { if (e.target.id === 'adminPin' || e.target.name === 'pin') e.target.value = e.target.value.replace(/\D/g, ''); }

  return { render, click, submit, input };
})();
