/* Stock: a ledger of moves (sale −, restock +, used/spoiled −, fix count ±). Counts are never overwritten:
   stock left = the sum of all moves. Items and what each product uses are set by the moderator in Booths. */
CS.stock = (function () {
  const U = CS.util, { esc } = U, S = CS.store;
  const UNITS = ['pcs', 'sheets', 'packs', 'rolls', 'bottles', 'sets'];
  const REASON = { sale: 'Sold', void: 'Sale undone', restock: 'Added', waste: 'Used / spoiled', adjust: 'Count fixed' };

  const items = booth => (S.catalog().stock || []).filter(x => x.active !== false && (!booth || x.booth === booth));
  const byId = id => (S.catalog().stock || []).find(x => x.stock_id === id);
  function moves() { // this device + the Sheet, one entry per move
    const m = {};
    S.get('remote.moves', []).forEach(x => { m[x.move_id] = x; });
    S.get('moves', []).forEach(x => { m[x.move_id] = x; });
    return Object.values(m);
  }
  function onHand(booth) {
    const t = {};
    moves().forEach(x => { if (!booth || x.booth === booth) t[x.stock_id] = (t[x.stock_id] || 0) + (Number(x.qty) || 0); });
    return t;
  }
  function add(list) { // [{booth, stock_id, qty, reason, ref_id?, note?}]
    const who = S.session() || {};
    const rows = list.filter(x => x.qty).map(x => ({ move_id: 'M-' + U.today().slice(2).replace(/-/g, '') + '-' + U.rand(6), ts: U.now(), booth: x.booth,
      stock_id: x.stock_id, name: (byId(x.stock_id) || {}).name || '', qty: x.qty, reason: x.reason, ref_id: x.ref_id || '', staff_id: x.staff_id || who.staff_id || '', note: x.note || '' }));
    if (!rows.length) return [];
    S.set('moves', S.get('moves', []).concat(rows));
    S.push(rows.map(d => ({ tab: 'Moves', data: d })));
    return rows;
  }
  // A sale takes out what its products use; undoing it (sign +1) puts it back.
  function forSale(lines, booth, saleId, sign = -1) {
    const need = {};
    lines.forEach(l => ((l.p && l.p.uses) || []).forEach(u => { need[u.stock_id] = (need[u.stock_id] || 0) + u.qty * l.q; }));
    return add(Object.entries(need).map(([id, q]) => ({ booth, stock_id: id, qty: sign * q, reason: sign < 0 ? 'sale' : 'void', ref_id: saleId })));
  }
  // How many more of a product stock allows (null = this product does not use tracked stock).
  function canMake(p, hand) {
    const u = (p.uses || []).filter(x => byId(x.stock_id));
    return u.length ? Math.max(0, Math.min(...u.map(x => Math.floor((hand[x.stock_id] || 0) / x.qty)))) : null;
  }
  const isLow = (it, n) => n <= (Number(it.low_at) || 0);

  /* ---------- register tab ---------- */
  let ctx = null; // { el, sess, act: {stock_id, kind} }
  function render(el, sess) {
    ctx = { el, sess, act: null };
    const list = items(sess.booth), hand = onHand(sess.booth), { icon } = CS.ui;
    const recent = moves().filter(m => m.booth === sess.booth && m.reason !== 'sale').sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 8);
    el.innerHTML = !list.length
      ? `<div class="empty">${icon('sticker')}<p>No stock to track for this booth yet. The moderator adds stock items in <b>Booths</b>.</p></div>`
      : `<p class="howto" style="padding:0"><span><b>1</b>Got new supplies? Tap <b>Add</b></span><span><b>2</b>Wrong number? Tap <b>Fix count</b></span></p>
      <ul class="stock-list">${list.map(it => { const n = hand[it.stock_id] || 0, low = isLow(it, n); return `
        <li class="${n <= 0 ? 'out' : low ? 'low' : ''}">
          <div><p class="h3">${esc(it.name)}</p>${n <= 0 ? '<span class="pill bad">Out of stock</span>' : low ? '<span class="pill bad">Running low</span>' : '<span class="pill ok">OK</span>'}</div>
          <p class="stock-n"><span class="big-num">${n}</span> <span class="sub">${esc(it.unit || 'pcs')} left</span></p>
          <div class="stock-acts">
            <button class="btn go sm" data-st="restock" data-sid="${it.stock_id}">${icon('plus')} Add</button>
            <button class="btn ghost sm" data-st="waste" data-sid="${it.stock_id}">Used / spoiled</button>
            <button class="btn ghost sm" data-st="adjust" data-sid="${it.stock_id}">Fix count</button></div></li>`; }).join('')}</ul>
      ${recent.length ? `<section><p class="h3" style="margin-bottom:var(--s-2)">Recent changes</p><ol class="feed">${recent.map(m => `
        <li><time class="num">${U.time(m.ts)}</time><span>${esc((byId(m.stock_id) || m).name)} · ${REASON[m.reason] || m.reason}${m.note ? ' · ' + esc(m.note) : ''}</span>
          <span class="num"><b>${m.qty > 0 ? "+" : ""}${m.qty}</b></span><span></span></li>`).join('')}</ol></section>` : ''}`;
  }

  function askSheet(kind, id) {
    const it = byId(id), n = onHand(ctx.sess.booth)[id] || 0, { head, openSheet, icon } = CS.ui;
    ctx.act = { kind, id };
    const t = { restock: ['Add stock', `How many ${esc(it.unit)} of ${esc(it.name)} did you get?`, 'Add to stock'],
      waste: ['Used or spoiled', `How many ${esc(it.unit)} were used up, lost or spoiled (not sold)?`, 'Take out of stock'],
      adjust: ['Fix the count', `Count the ${esc(it.name)} you really have now. The app has ${n}.`, 'Save the real count'] }[kind];
    openSheet(`${head(t[0], esc(it.name))}<p>${t[1]}</p>
      <input class="input big-input num" id="stQty" inputmode="numeric" autocomplete="off" placeholder="0" autofocus>
      <label class="field"><span>Note <small>(optional)</small></span><input class="input" id="stNote" placeholder="${kind === 'waste' ? 'e.g. printer jam' : 'e.g. from the club store room'}"></label>
      <p class="err" id="stErr" role="alert"></p>
      <button class="btn go wide" data-st-save>${icon('check')} ${t[2]}</button>`);
  }

  function save() {
    const { kind, id } = ctx.act, raw = document.getElementById('stQty').value.trim(), note = document.getElementById('stNote').value.trim();
    const v = parseInt(raw, 10), now = onHand(ctx.sess.booth)[id] || 0;
    if (raw === '' || isNaN(v) || v < 0 || (kind !== 'adjust' && v === 0)) { document.getElementById('stErr').textContent = 'Type a number.'; return; }
    const qty = kind === 'restock' ? v : kind === 'waste' ? -v : v - now;
    if (kind === 'adjust' && qty === 0) { CS.ui.closeSheet(); CS.ui.toast('The count was already right.'); return; }
    add([{ booth: ctx.sess.booth, stock_id: id, qty, reason: kind, note, staff_id: ctx.by }]);
    CS.ui.closeSheet(); CS.ui.toast(kind === 'adjust' ? `Count fixed to ${v}.` : kind === 'restock' ? `Added ${v}.` : `Took out ${v}.`);
    render(ctx.el, ctx.sess);
    if (CS.sync) CS.sync.run();
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || !ctx) return;
    if (t.dataset.st && ctx.el.contains(t)) { const kind = t.dataset.st, id = t.dataset.sid; CS.pin.approve(ctx.sess.booth, 'To change stock', who => { ctx.by = who && who.staff_id; askSheet(kind, id); }); }
    else if ('stSave' in t.dataset) save();
  });
  document.addEventListener('input', e => { if (e.target.id === 'stQty') e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5); });

  return { UNITS, REASON, items, byId, moves, onHand, add, forSale, canMake, isLow, render };
})();
