/* Booth register: item grid, cart, payment, receipt, today's sales, undo. */
(function () {
  const { $, $$, esc, money, time, today } = CS.util, S = CS.store, { icon, badge, toast, openSheet, closeSheet, head } = CS.ui;
  const sess = S.session();
  if (!sess || sess.role === 'admin') { location.replace(sess ? 'admin.html' : 'index.html'); return; }

  const cat = S.catalog();
  const booth = S.booth(sess.booth) || { code: sess.booth, name: sess.booth, color: '#FFB98A', icon: 'store' };
  const items = cat.products.filter(p => p.active && (p.booth === sess.booth || p.booth === 'ALL'));
  const bySku = Object.fromEntries(cat.products.map(p => [p.sku, p]));
  const cartKey = 'cart.' + sess.booth;
  let cart = S.get(cartKey, {});
  let pay = null, undo = null;
  const custKey = 'cart.cust.' + sess.booth;
  let cust = S.get(custKey, null); // optional customer for the current sale
  const GCASH_ON = false; // GCash is grayed out for now. Set to true to turn it back on.
  document.documentElement.style.setProperty('--booth', booth.color);

  /* ---------- cart ---------- */
  const lines = () => Object.entries(cart).filter(([sku, q]) => q > 0 && bySku[sku] && bySku[sku].active).map(([sku, q]) => ({ p: bySku[sku], q }));
  const total = () => lines().reduce((s, l) => s + l.p.price_c * l.q, 0);
  const count = () => lines().reduce((s, l) => s + l.q, 0);
  function setQty(sku, q) { if (q > 0) cart[sku] = q; else delete cart[sku]; S.set(cartKey, cart); render(); if ($('#sheet').open && !pay) showCart(); }

  function cartHTML() {
    const ls = lines(), t = total();
    if (!ls.length) return `<div class="empty">${icon('cart')}<p>Nothing yet. Tap an item to add it.</p></div>`;
    return `<ul class="lines">${ls.map(l => `
      <li><span class="nm">${esc(l.p.name)}</span><span class="amt num">${money(l.p.price_c * l.q)}</span>
        <span class="step"><button data-dec="${l.p.sku}" aria-label="One less ${esc(l.p.name)}">−</button><b class="num">${l.q}</b><button data-inc="${l.p.sku}" aria-label="One more ${esc(l.p.name)}">+</button></span>
        <span class="sub" style="text-align:right">${money(l.p.price_c)} each</span></li>`).join('')}</ul>
      <div class="cust-row">${cust ? `${icon('user')}<span><b>${esc(cust.name)}</b><span class="sub">${esc(CS.customer.label(cust).slice(cust.name.length + 3))}</span></span><button class="link" data-cust>Change</button>`
        : `<button class="btn ghost wide sm" data-cust>${icon('user')} Add customer name <span class="sub">(optional)</span></button>`}</div>
      <div class="cart-foot"><span class="h3">Total</span><span class="big-num">${money(t)}</span></div>
      <div class="cart-actions">
        <button class="btn go wide" data-charge>${icon('cash')} Charge ${money(t)}</button>
        <button class="btn ghost wide" data-clear>Start over</button>
      </div>`;
  }

  /* ---------- render ---------- */
  function render() {
    const hand = CS.stock.onHand(sess.booth);
    $('#grid').innerHTML = items.length ? items.map(p => {
      const q = cart[p.sku] || 0, left = CS.stock.canMake(p, hand), lowAt = left != null && (p.uses || []).some(u => { const it = CS.stock.byId(u.stock_id); return it && CS.stock.isLow(it, hand[u.stock_id] || 0); });
      return `<button class="tile${q ? ' in' : ''}" data-sku="${p.sku}" aria-label="Add ${esc(p.name)}, ${money(p.price_c)}">
        <span class="tile-name">${esc(p.name)}</span>
        <span><span class="tile-price">${money(p.price_c)}</span><br>
        <span class="tile-kind">${p.type === 'service' ? icon('ticket') + 'Gets a ticket number' : icon('check') + 'Hand it over'}</span>
        ${left == null ? '' : `<br><span class="pill ${left <= 0 || lowAt ? 'bad' : 'ok'}">${left <= 0 ? 'Out of stock' : left + ' left'}</span>`}</span>
        ${q ? `<span class="qty" aria-hidden="true">${q}</span>` : ''}</button>`;
    }).join('') : '<p class="note" style="grid-column:1/-1">This booth has nothing to sell yet. Ask the moderator to add items in Booths.</p>';
    $$('.cart-side .cart-body').forEach(el => { el.innerHTML = cartHTML(); });
    const n = count();
    $('#cartbar').hidden = !n;
    $('#cartCount').textContent = `${n} item${n === 1 ? '' : 's'} · Charge`;
    $('#cartTotal').textContent = money(total());
    chip();
    if (!$('#tab-today').hidden) renderToday();
  }

  function chip() {
    const L = CS.sync.label(), el = $('#saved');
    el.textContent = L.text; el.classList.toggle('ok', L.ok);
  }
  document.addEventListener('cs-sync', e => {
    chip();
    if (e.detail.stock && !$('#sheet').open) { render(); if (!$('#tab-stock').hidden) CS.stock.render($('#tab-stock'), sess); }
    // New prices/items from the moderator: reload only between customers.
    if (e.detail.setupChanged && !count() && !$('#sheet').open) location.reload();
  });

  function renderToday() {
    const all = S.salesToday(sess.booth).slice().reverse(), paid = all.filter(s => s.status === 'paid');
    const sum = m => paid.filter(s => !m || s.pay === m).reduce((a, s) => a + s.total_c, 0);
    $('#tab-today').innerHTML = `
      <div class="stats">
        <div class="stat"><p class="label">Sold today</p><p class="big-num">${money(sum())}</p></div>
        <div class="stat"><p class="label">Sales</p><p class="big-num">${paid.length}</p></div>
        <div class="stat"><p class="label">Cash</p><p class="big-num">${money(sum('cash'))}</p></div>
        <div class="stat"><p class="label">GCash</p><p class="big-num">${money(sum('gcash'))}</p></div>
      </div>
      <div class="row" style="flex-wrap:wrap"><p class="h3">Today's list</p>
        <button class="btn ghost sm" data-export ${all.length ? '' : 'disabled'}>${icon('download')} Send to moderator (CSV)</button></div>
      ${all.length ? `<ol class="feed">${all.map(s => `
        <li class="${s.status === 'void' ? 'voided' : ''}"><time class="num">${time(s.ts)}</time>
          <span>${s.items.map(i => `${esc(i.name || (bySku[i.sku] || { name: i.sku }).name)}${i.qty > 1 ? ' ×' + i.qty : ''}`).join(', ')}</span>
          <span class="num"><b>${money(s.total_c)}</b></span>
          <span class="meta">${s.customer_name ? esc(s.customer_name) + ' · ' : ''}${s.status === 'void' ? `<span class="pill bad">Undone: ${esc(s.void_reason)}</span>`
            : (s.pay === 'gcash' ? 'GCash ' + esc(s.gcash_ref) : 'Cash')}${s.tickets.length ? ' · <span class="mono">' + s.tickets.map(t => t.ticket_no).join(' ') + '</span>' : ''}</span>
          ${s.status === 'paid' ? `<button class="icon-btn" data-undo="${s.sale_id}" aria-label="Undo this sale" title="Undo this sale">${icon('undo')}</button>` : '<span></span>'}</li>`).join('')}</ol>`
        : `<div class="empty">${icon('chart')}<p>No sales yet today. Your first sale will show up here.</p></div>`}`;
  }

  /* ---------- sheets ---------- */
  function showCart() { pay = null; openSheet(head('This sale') + '<div class="cart-body">' + cartHTML() + '</div>'); }

  const canConfirm = () => pay.method === 'cash' ? pay.tendered >= pay.total : pay.ref.length >= 4;
  function showPay() {
    const t = pay.total, change = pay.tendered - t;
    openSheet(`${head('Get paid · <span class="num">' + money(t) + '</span>', 'How is the customer paying?')}
      <div class="methods" role="radiogroup" aria-label="Payment method">
        <button role="radio" aria-checked="${pay.method === 'cash'}" data-method="cash">${icon('cash')} Cash</button>
        <button role="radio" aria-checked="${pay.method === 'gcash'}" data-method="gcash" ${GCASH_ON ? '' : 'disabled aria-disabled="true" title="GCash is not available yet"'}>${icon('phone')}<span>GCash${GCASH_ON ? '' : '<small>Not available yet</small>'}</span></button>
      </div>
      ${pay.method === 'cash' ? `
        <div class="row"><span class="h3">They gave you</span><span class="big-num">${money(pay.tendered)}</span></div>
        <div class="bills">${[20, 50, 100, 200, 500, 1000].map(b => `<button data-add="${b * 100}">+${b}</button>`).join('')}
          <button class="soft" data-exact>Exact</button><button class="soft" data-reset>Clear</button></div>
        <div class="change${change >= 0 ? ' ok' : ''}" aria-live="polite">
          <p class="label">${change >= 0 ? 'Give back this change' : 'Still short by'}</p>
          <p class="huge-num">${money(Math.abs(change))}</p></div>`
      : `<label class="field"><span>GCash reference number</span>
          <input id="ref" class="ref-input" inputmode="numeric" autocomplete="off" maxlength="13" value="${esc(pay.ref)}" placeholder="0000">
          <small>Check the customer's GCash screen. Type at least the last 4 digits.</small></label>`}
      <button class="btn go wide" data-confirm ${canConfirm() ? '' : 'disabled'}>${icon('check')} Payment received</button>`);
    if (pay.method === 'gcash') $('#ref').focus();
  }

  function confirmPay() {
    const ls = lines(), t = total();
    if (!ls.length || !canConfirm()) return;
    const customer = cust ? CS.customer.commit(cust) : null;
    const r = S.recordSale({ booth: sess.booth, staff: sess, lines: ls, total: t, pay, customer });
    cust = null; S.set(custKey, null);
    const change = pay.method === 'cash' ? pay.tendered - t : 0;
    cart = {}; S.set(cartKey, cart); pay = null; render(); CS.sync.run();
    openSheet(`<div class="done">
      <div class="sheet-head"><span class="done-mark">${icon('check')}</span><button class="x" data-close aria-label="Close">${icon('x')}</button></div>
      <div><p class="h2">Paid!</p><p class="sub">${customer ? esc(customer.name) + ' · ' : ''}${money(t)} · ${r.sale.pay === 'gcash' ? 'GCash ref ' + esc(r.sale.gcash_ref) : 'Cash'} · ${time(r.sale.ts)}</p></div>
      ${change ? `<div class="change ok"><p class="label">Give back</p><p class="huge-num">${money(change)}</p></div>` : ''}
      ${r.tickets.length ? `<div><p class="h3" style="margin-bottom:var(--s-2)">Tell the customer their ticket number</p>
        <ol class="tickets">${r.tickets.map(k => `<li><span class="frame">${k.ticket_no}</span><span class="code mono">${k.code}</span>
          <span class="what">${esc(bySku[k.sku].name)}${k.qty > 1 ? ' ×' + k.qty : ''}</span></li>`).join('')}</ol></div>` : ''}
      ${r.saved ? '' : '<p class="note warn">This phone is out of storage. Tell the moderator now.</p>'}
      <button class="btn primary wide" data-close autofocus>Next customer ${icon('next')}</button></div>`);
  }

  const REASONS = ['Wrong item', 'Wrong amount', 'Customer changed mind', 'Test sale'];
  function showUndo() {
    const s = S.salesToday(sess.booth).find(x => x.sale_id === undo.id);
    if (!s) return;
    openSheet(`${head('Undo this sale?', time(s.ts) + ' · ' + money(s.total_c))}
      <p>${s.items.map(i => esc(i.name || bySku[i.sku].name) + (i.qty > 1 ? ' ×' + i.qty : '')).join(', ')}</p>
      <p class="h3">Why are you undoing it?</p>
      <div class="reasons" role="radiogroup">${REASONS.map(r => `<button role="radio" aria-checked="${undo.reason === r}" data-reason="${r}">${r}</button>`).join('')}</div>
      <p class="note">The sale stays in the records, marked as undone. Give back any money you received.</p>
      <button class="btn danger wide" data-undo-yes ${undo.reason ? '' : 'disabled'}>${icon('undo')} Yes, undo sale</button>`);
  }

  function exportToday() {
    const rows = [['sale_id', 'date', 'time', 'event_id', 'booth', 'item', 'qty', 'line_total', 'sale_total', 'payment', 'ref', 'status', 'customer']];
    S.salesToday(sess.booth).forEach(s => s.items.forEach(i => rows.push([s.sale_id, today(new Date(s.ts)), time(s.ts), s.event_id || '', s.booth,
      i.name || (bySku[i.sku] || { name: i.sku }).name, i.qty, (i.price_c * i.qty / 100).toFixed(2), (s.total_c / 100).toFixed(2), s.pay, s.gcash_ref, s.status, s.customer_name || ''])));
    CS.csv.download(`contactsheet-${sess.booth}-${today()}.csv`, CS.csv.write(rows));
    toast('Saved. Send this file to your moderator.');
  }

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    const d = t.dataset;
    if (d.sku) setQty(d.sku, (cart[d.sku] || 0) + 1);
    else if (d.inc) setQty(d.inc, (cart[d.inc] || 0) + 1);
    else if (d.dec) setQty(d.dec, (cart[d.dec] || 0) - 1);
    else if ('clear' in d) { cart = {}; cust = null; S.set(custKey, null); S.set(cartKey, cart); render(); closeSheet(); }
    else if ('cust' in d) CS.customer.open(cust, c => {
      cust = c; S.set(custKey, c); render();
      if (innerWidth < 900) showCart(); else closeSheet();
      if (c) toast(`Customer: ${c.name}`);
    });
    else if ('openCart' in d) showCart();
    else if ('charge' in d) { pay = { method: 'cash', tendered: 0, ref: '', total: total() }; showPay(); }
    else if (d.method) { pay.method = d.method; showPay(); }
    else if (d.add) { pay.tendered += +d.add; showPay(); }
    else if ('exact' in d) { pay.tendered = pay.total; showPay(); }
    else if ('reset' in d) { pay.tendered = 0; showPay(); }
    else if ('confirm' in d) confirmPay();
    else if (d.undo) { undo = { id: d.undo, reason: '' }; showUndo(); }
    else if (d.reason) { undo.reason = d.reason; showUndo(); }
    else if ('undoYes' in d) {
      const s = S.salesToday(sess.booth).find(x => x.sale_id === undo.id);
      if (s && S.voidSale(s.sale_id, s.booth, s.ts, undo.reason, sess)) toast('Sale undone.');
      closeSheet(); render();
    }
    else if ('export' in d) exportToday();
    else if (d.tab) {
      $$('[data-tab]').forEach(b => b.setAttribute('aria-selected', b === t));
      $('#tab-sell').hidden = d.tab !== 'sell'; $('#tab-today').hidden = d.tab !== 'today'; $('#tab-close').hidden = d.tab !== 'close'; $('#tab-stock').hidden = d.tab !== 'stock';
      if (d.tab === 'close') CS.closeout.render($('#tab-close'), sess);
      if (d.tab === 'stock') CS.stock.render($('#tab-stock'), sess);
      render();
    } else if (t.id === 'signout') { S.logout(); location.replace('index.html'); }
  });
  $('#sheet').addEventListener('close', () => { pay = null; });
  $('#sheet').addEventListener('input', e => {
    if (e.target.id !== 'ref') return;
    e.target.value = e.target.value.replace(/\D/g, '');
    pay.ref = e.target.value;
    $('[data-confirm]', $('#sheet')).disabled = !canConfirm();
  });

  /* ---------- boot ---------- */
  const ev = S.activeEvent();
  $('#boothBadge').innerHTML = badge(booth);
  $('#boothName').textContent = booth.name;
  $('#eventName').textContent = (ev ? ev.name + ' · ' : '') + sess.name;
  $('#signout').innerHTML = icon('logout');
  $('[data-tab="sell"]').innerHTML = icon('cart') + 'Sell';
  $('[data-tab="today"]').innerHTML = icon('chart') + 'Today<span class="hide-sm">\'s sales</span>';
  $('[data-tab="close"]').innerHTML = icon('cash') + 'Close<span class="hide-sm"> day</span>';
  $('[data-tab="stock"]').innerHTML = icon('sticker') + 'Stock';
  $('[data-tab="stock"]').hidden = !CS.stock.items(sess.booth).length;
  render();
  CS.sync.start();
})();
