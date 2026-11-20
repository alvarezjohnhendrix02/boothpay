/* Moderator → Expenses: what the club spent, by type and booth. Total = quantity × price each.
   Net = sales − expenses − LEEF share (10% of what is left). Deleting marks the expense void (kept in the Sheet as a new row). */
CS.expenses = (function () {
  const U = CS.util, S = CS.store;
  const TYPES = [
    ['materials', 'Materials & supplies', 'sticker', 'var(--lilac)'],
    ['printing', 'Printing & photo paper', 'printer', 'var(--sky)'],
    ['food', 'Food & drinks', 'cup', 'var(--peach)'],
    ['transport', 'Transportation', 'place', 'var(--aqua)'],
    ['decor', 'Booth setup & decorations', 'star', 'var(--pink)'],
    ['rental', 'Equipment rental', 'camera', 'var(--lemon)'],
    ['prizes', 'Prizes & giveaways', 'gift', 'var(--mint)'],
    ['load', 'Load & internet', 'phone', 'var(--coral)'],
    ['other', 'Other', 'file', '#DCD3C2'],
  ];
  const type = k => TYPES.find(t => t[0] === k) || TYPES[TYPES.length - 1];
  function all() { // this device + the Sheet; the newest record of each expense wins (so a delete sticks)
    const m = {};
    S.get('remote.expenses', []).concat(S.get('expenses', [])).forEach(x => { const o = m[x.exp_id]; if (!o || (x.ts_v || x.ts) >= (o.ts_v || o.ts)) m[x.exp_id] = x; });
    return Object.values(m);
  }
  const live = () => all().filter(x => x.status !== 'void');
  function record(x) {
    const list = S.get('expenses', []), i = list.findIndex(o => o.exp_id === x.exp_id);
    if (i >= 0) list[i] = x; else list.push(x);
    S.set('expenses', list);
    S.push([{ tab: 'Expenses', data: x }]);
  }
  return { TYPES, type, all, live, record };
})();

CS.views = CS.views || {};
CS.views.expenses = (function () {
  const U = CS.util, { esc, money, dayLabel, today } = U, S = CS.store, E = CS.expenses, { icon, badge, toast, openSheet, closeSheet, head } = CS.ui;
  let f = null, d = null, delId = null;
  const boothName = c => c ? (S.booth(c) || { name: c }).name : 'Whole club';
  const inScope = x => (f.event === '*' || (x.event_id || '') === f.event) && (f.booth === '*' || (x.booth || '') === f.booth);

  function render(el) {
    if (!f) f = { event: (S.activeEvent() || {}).event_id || '*', booth: '*' };
    const list = E.live().filter(inScope).sort((a, b) => (b.date + b.ts).localeCompare(a.date + a.ts));
    const spent = list.reduce((a, x) => a + x.amount_c, 0);
    const sales = CS.report.collect().filter(r => (f.event === '*' || r.event_id === f.event) && (f.booth === '*' || r.booth === f.booth)).reduce((a, r) => a + r.total_c, 0);
    const byType = {}; list.forEach(x => { byType[x.type] = (byType[x.type] || 0) + x.amount_c; });
    const max = Math.max(1, ...Object.values(byType)), opt = (v, cur, l) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
    el.innerHTML = `
      <div class="view-head"><div><h2 class="h1">Expenses</h2></div>
        <button class="btn primary" data-x-new>${icon('plus')} Add expense</button></div>
      <div class="filters">
        <label class="field"><span>Event</span><select class="input" data-xf="event">${opt('*', f.event, 'All events')}${S.events().map(e => opt(e.event_id, f.event, e.name)).join('')}${opt('', f.event, 'No event')}</select></label>
        <label class="field"><span>Booth</span><select class="input" data-xf="booth">${opt('*', f.booth, 'Everything')}${opt('', f.booth, 'Whole club (not one booth)')}${S.catalog().booths.map(b => opt(b.code, f.booth, b.name)).join('')}</select></label>
      </div>
      <div class="stats">
        <div class="stat"><p class="label">Sales</p><p class="big-num">${money(sales)}</p></div>
        <div class="stat"><p class="label">Expenses</p><p class="big-num">${money(spent)}</p></div>
        <div class="stat"><p class="label">After expenses</p><p class="big-num ${sales - spent < 0 ? 'bad-text' : ''}">${sales - spent < 0 ? '−' : ''}${money(Math.abs(sales - spent))}</p></div>
        <div class="stat"><p class="label">LEEF share (10%)</p><p class="big-num">${money(CS.report.net(sales, spent).leef)}</p></div>
        <div class="stat"><p class="label">Net sales</p><p class="big-num ${CS.report.net(sales, spent).net < 0 ? 'bad-text' : 'ok-text'}">${CS.report.net(sales, spent).net < 0 ? '−' : ''}${money(Math.abs(CS.report.net(sales, spent).net))}</p></div>
      </div>
      ${list.length ? `
      <section class="panel"><p class="h3">By type</p><ul class="hbars">${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => { const t = E.type(k); return `
        <li><span class="hb-name">${icon(t[2])}${esc(t[1])}</span><span class="hb-track"><i style="width:${(v / max * 100).toFixed(1)}%;background:${t[3]}"></i></span>
        <span class="num hb-val"><b>${money(v)}</b> <span class="sub">${Math.round(v / spent * 100)}%</span></span></li>`; }).join('')}</ul></section>
      <section class="panel"><p class="h3">All expenses <span class="sub">(${list.length})</span></p>
        <div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>What</th><th>Type</th><th>For</th><th class="r">Qty × price</th><th class="r">Total</th><th></th></tr></thead>
        <tbody>${list.map(x => { const t = E.type(x.type); return `<tr>
          <td class="num">${dayLabel(x.date)}</td><td><b>${esc(x.item)}</b>${x.note || x.paid_by ? `<br><span class="sub">${esc([x.paid_by && 'Paid by ' + x.paid_by, x.note].filter(Boolean).join(' · '))}</span>` : ''}</td>
          <td><span class="xtype" style="--t:${t[3]}">${icon(t[2])}${esc(t[1])}</span></td><td>${esc(boothName(x.booth))}</td>
          <td class="r num">${x.qty} × ${money(x.unit_c)}</td><td class="r num"><b>${money(x.amount_c)}</b></td>
          <td><button class="icon-btn" data-x-del="${x.exp_id}" aria-label="Delete ${esc(x.item)}">${icon('trash')}</button></td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td colspan="5"><b>Total</b></td><td class="r num"><b>${money(spent)}</b></td><td></td></tr></tfoot></table></div></section>`
        : `<div class="empty big">${icon('cash')}<p class="h3">No expenses yet</p><p>Add what the club bought, like photo paper, pins or load.</p>
           <button class="btn primary" data-x-new>${icon('plus')} Add expense</button></div>`}`;
  }

  /* ---------- add form ---------- */
  function formHTML() {
    const stocks = d.booth ? CS.stock.items(d.booth) : [];
    const total = Math.round((parseFloat(d.qty) || 0) * (U.centavos(d.unit) || 0));
    return `${head('Add expense')}
      <div class="form" id="xForm">
        <label class="field"><span>What did you buy?</span><input class="input" id="xItem" value="${esc(d.item)}" placeholder="e.g. 4R photo paper" autocomplete="off" autofocus></label>
        <fieldset class="field"><span>What kind of expense?</span>
          <div class="xtypes" role="radiogroup">${E.TYPES.map(t => `<button type="button" role="radio" aria-checked="${d.type === t[0]}" data-x-type="${t[0]}" style="--t:${t[3]}">${icon(t[2])}<span>${esc(t[1])}</span></button>`).join('')}</div></fieldset>
        <label class="field"><span>For which booth?</span><select class="input" id="xBooth">${[['', 'Whole club (not one booth)']].concat(S.catalog().booths.map(b => [b.code, b.name])).map(([v, l]) => `<option value="${v}" ${d.booth === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <div class="calc">
          <label class="field"><span>Quantity</span><input class="input num" id="xQty" value="${esc(d.qty)}" inputmode="decimal" autocomplete="off"></label>
          <span class="calc-op">×</span>
          <label class="field"><span>Price each</span><span class="peso"><input class="input num" id="xUnit" value="${esc(d.unit)}" inputmode="decimal" placeholder="0" autocomplete="off"></span></label>
          <span class="calc-op">=</span>
          <div class="field"><span>Total</span><p class="big-num" id="xTotal">${money(total)}</p></div>
        </div>
        ${stocks.length ? `<label class="field"><span>Also add to this booth's stock? <small>(optional)</small></span>
          <select class="input" id="xStock"><option value="">No</option>${stocks.map(s => `<option value="${s.stock_id}" ${d.stock === s.stock_id ? 'selected' : ''}>Yes, add ${esc(d.qty || '0')} to ${esc(s.name)}</option>`).join('')}</select></label>` : ''}
        <div class="field-row">
          <label class="field"><span>Date</span><input class="input" type="date" id="xDate" value="${esc(d.date)}"></label>
          <label class="field"><span>Paid by <small>(optional)</small></span><input class="input" id="xPaid" value="${esc(d.paid_by)}" placeholder="Name"></label>
        </div>
        <label class="field"><span>Note or receipt no. <small>(optional)</small></span><input class="input" id="xNote" value="${esc(d.note)}" placeholder="e.g. OR #10234"></label>
        <p class="err" id="xErr" role="alert"></p>
        <button type="button" class="btn go wide" data-x-save>${icon('check')} Save expense</button>
      </div>`;
  }
  function read() {
    const v = id => (document.getElementById(id) || { value: '' }).value;
    Object.assign(d, { item: v('xItem'), booth: v('xBooth'), qty: v('xQty'), unit: v('xUnit'), date: v('xDate') || today(), paid_by: v('xPaid'), note: v('xNote'), stock: v('xStock') });
  }
  function redraw() { read(); openSheet(formHTML()); }

  function save() {
    read();
    const err = m => { document.getElementById('xErr').textContent = m; };
    const item = d.item.trim().replace(/\s+/g, ' '), qty = parseFloat(d.qty), unit_c = U.centavos(d.unit);
    if (!item) return err('Type what you bought.');
    if (!d.type) return err('Pick what kind of expense it is.');
    if (!(qty > 0)) return err('Quantity must be more than 0.');
    if (isNaN(unit_c) || unit_c <= 0) return err('Type the price of one piece.');
    const ev = S.activeEvent(), now = U.now();
    const x = { exp_id: 'EXP-' + U.today().slice(2).replace(/-/g, '') + '-' + U.rand(5), ts: now, ts_v: now, date: d.date, event_id: f.event !== '*' && f.event !== undefined ? f.event : (ev ? ev.event_id : ''),
      booth: d.booth, type: d.type, item: item[0].toUpperCase() + item.slice(1), qty, unit_c, amount_c: Math.round(qty * unit_c), paid_by: CS.customer.name(d.paid_by), note: d.note.trim(), status: 'ok' };
    E.record(x);
    if (d.stock && Number.isInteger(qty)) CS.stock.add([{ booth: d.booth, stock_id: d.stock, qty, reason: 'restock', ref_id: x.exp_id, note: 'Bought: ' + x.item }]);
    closeSheet(); toast(`Saved ${money(x.amount_c)} for ${x.item}.`); CS.admin.refresh(); if (CS.sync) CS.sync.run();
  }

  function click(e, t) {
    const k = t.dataset;
    if ('xNew' in k) { d = { item: '', type: '', booth: f.booth !== '*' ? f.booth : '', qty: '1', unit: '', date: today(), paid_by: '', note: '', stock: '' }; openSheet(formHTML()); }
    else if (k.xType) { read(); d.type = k.xType; t.parentNode.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', b === t)); }
    else if ('xSave' in k) save();
    else if (k.xDel) {
      delId = k.xDel; const x = E.all().find(o => o.exp_id === delId);
      openSheet(`${head('Delete this expense?')}<p><b>${esc(x.item)}</b> · ${money(x.amount_c)}</p><p class="sub">It is removed from the totals. The Sheet keeps a record that it was deleted.</p>
        <button class="btn danger wide" data-x-del-yes>${icon('trash')} Delete expense</button><button class="btn ghost wide" data-close>Keep it</button>`);
    } else if ('xDelYes' in k) {
      const x = E.all().find(o => o.exp_id === delId);
      E.record({ ...x, status: 'void', ts_v: U.now() });
      closeSheet(); toast('Expense deleted.'); CS.admin.refresh(); if (CS.sync) CS.sync.run();
    }
  }
  function change(e) {
    const t = e.target;
    if (t.dataset.xf) { f[t.dataset.xf] = t.value; CS.admin.refresh(); }
    else if (t.id === 'xBooth') redraw();
  }
  function input(e) {
    const t = e.target;
    if (t.id === 'xQty' || t.id === 'xUnit') {
      t.value = t.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
      read();
      document.getElementById('xTotal').textContent = money(Math.round((parseFloat(d.qty) || 0) * (U.centavos(d.unit) || 0)));
      const so = document.getElementById('xStock');
      if (so) [...so.options].slice(1).forEach(o => { o.textContent = o.textContent.replace(/add [\d.]* to/, `add ${d.qty || 0} to`); });
    }
  }
  return { render, click, change, input };
})();
