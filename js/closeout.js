/* End-of-day cash count for one booth: starting cash + cash sales = what should be in the box.
   The seller counts each bill and coin; the difference is flagged when it is more than ₱50. */
CS.closeout = (function () {
  const U = CS.util, { esc, money, time, today } = U, S = CS.store, { icon, toast, openSheet } = CS.ui;
  const DEN = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 100]; // ₱1000 … ₱1, in centavos
  const FLAG = 5000; // ₱50
  let sess = null, el = null;

  const key = () => `closedraft.${sess.booth}.${today()}`;
  const draft = () => S.get(key(), { float: '', counts: {}, note: '' });
  const keep = d => S.set(key(), d);

  function figures(d) {
    const paid = S.salesToday(sess.booth).filter(s => s.status === 'paid');
    const sum = m => paid.filter(s => s.pay === m).reduce((a, s) => a + s.total_c, 0);
    const f = U.centavos(d.float), float = isNaN(f) ? 0 : f, cash = sum('cash');
    const counted = DEN.reduce((a, v) => a + v * (parseInt(d.counts[v], 10) || 0), 0);
    return { float, cash, cashN: paid.filter(s => s.pay === 'cash').length, gcash: sum('gcash'), counted, expected: float + cash, variance: counted - (float + cash) };
  }

  function verdict(v) {
    if (v === 0) return { ok: true, title: 'It matches!', text: 'The cash box is exactly right.' };
    const word = v < 0 ? 'Short' : 'Over';
    if (Math.abs(v) <= FLAG) return { ok: true, title: `${word} by ${money(Math.abs(v))}`, text: 'Small difference. That is okay.' };
    return { ok: false, title: `${word} by ${money(Math.abs(v))}`, text: 'Count again. If it is still off, write a note and tell your moderator.' };
  }

  function sumHTML(d) {
    const x = figures(d), vd = verdict(x.variance);
    return `
      <div class="row"><span>Starting cash</span><span class="num">${money(x.float)}</span></div>
      <div class="row"><span>Cash sales today <span class="sub">(${x.cashN})</span></span><span class="num">+ ${money(x.cash)}</span></div>
      <div class="row total"><span>Should be in the box</span><span class="num">${money(x.expected)}</span></div>
      <div class="row total"><span>You counted</span><span class="num">${money(x.counted)}</span></div>
      <div class="change${vd.ok ? ' ok' : ''}"><p class="label">${esc(vd.title)}</p><p class="sub-v">${esc(vd.text)}</p></div>
      ${x.gcash ? `<p class="sub">GCash today: ${money(x.gcash)} (not in the cash box)</p>` : ''}`;
  }

  function render(container, session) {
    el = container; sess = session;
    const d = draft(), done = S.closeoutsToday(sess.booth).slice().reverse();
    el.innerHTML = `
      <p class="howto" style="padding:0"><span><b>1</b>Starting cash</span><span><b>2</b>Count each bill and coin</span><span><b>3</b>Save</span></p>
      <section class="panel">
        <label class="field"><span>1 · Cash you started with (panukli)</span>
          <span class="peso"><input class="input num" id="coFloat" inputmode="decimal" autocomplete="off" value="${esc(d.float)}" placeholder="0"></span>
          <small>The change money in the box before the first sale. Put 0 if there was none.</small></label>
      </section>
      <section class="panel">
        <p class="h3">2 · Count the money in the box</p>
        <ul class="denoms">${DEN.map(v => { const n = parseInt(d.counts[v], 10) || 0; return `
          <li><span class="den ${v >= 2000 ? 'bill' : 'coin'}">₱${v / 100}</span>
            <span class="step"><button data-co-dec="${v}" aria-label="One less ₱${v / 100}">−</button>
              <input class="num" data-co-n="${v}" inputmode="numeric" autocomplete="off" value="${n || ''}" placeholder="0" aria-label="How many ₱${v / 100}">
              <button data-co-inc="${v}" aria-label="One more ₱${v / 100}">+</button></span>
            <span class="num den-amt" data-co-amt="${v}">${n ? money(v * n) : ''}</span></li>`; }).join('')}</ul>
      </section>
      <section class="panel">
        <p class="h3">3 · Check and save</p>
        <div class="co-sum" id="coSum">${sumHTML(d)}</div>
        <label class="field"><span>Note <small>(optional)</small></span><input class="input" id="coNote" value="${esc(d.note)}" placeholder="e.g. lent ₱100 change to the Doodle booth"></label>
        <button class="btn go wide" data-co-save>${icon('check')} Save cash count</button>
      </section>
      ${done.length ? `<section><p class="h3" style="margin-bottom:var(--s-2)">Saved today</p><ol class="feed">${done.map((c, i) => { const vd = verdict(c.variance_c); return `
        <li><time class="num">${time(c.ts)}</time><span>Counted <b class="num">${money(c.counted_cash_c)}</b> of ${money(c.expected_cash_c)}</span>
          <span class="pill ${vd.ok ? 'ok' : 'bad'}">${esc(vd.title)}</span>
          <span class="meta">${i === 0 ? 'Latest count' : 'Earlier count'}${c.note ? ' · ' + esc(c.note) : ''}</span><span></span></li>`; }).join('')}</ol></section>` : ''}`;
  }

  function refresh(v) {
    const d = draft();
    if (v != null) {
      const n = parseInt(d.counts[v], 10) || 0, inp = el.querySelector(`[data-co-n="${v}"]`);
      if (inp && document.activeElement !== inp) inp.value = n || '';
      el.querySelector(`[data-co-amt="${v}"]`).textContent = n ? money(v * n) : '';
    }
    el.querySelector('#coSum').innerHTML = sumHTML(d);
  }

  function save() {
    const d = draft(), x = figures(d), vd = verdict(x.variance);
    if (!x.counted && !confirm('You counted ₱0. Save anyway?')) return;
    const counts = {}; DEN.forEach(v => { const n = parseInt(d.counts[v], 10) || 0; if (n) counts[v / 100] = n; });
    const r = S.recordCloseout({ booth: sess.booth, staff_id: sess.staff_id, float_c: x.float, cash_sales_c: x.cash, expected_cash_c: x.expected,
      counted_cash_c: x.counted, variance_c: x.variance, gcash_total_c: x.gcash, denoms: counts, note: d.note.trim() });
    render(el, sess);
    if (CS.sync) CS.sync.run();
    openSheet(`<div class="done">
      <div class="sheet-head"><span class="done-mark${vd.ok ? '' : ' bad'}">${icon(vd.ok ? 'check' : 'x')}</span><button class="x" data-close aria-label="Close">${icon('x')}</button></div>
      <div><p class="h2">${esc(vd.title)}</p><p class="sub">Counted ${money(x.counted)} · should be ${money(x.expected)} · ${time(r.close.ts)}</p></div>
      <p>${esc(vd.text)}</p>
      ${r.saved ? '' : '<p class="note warn">This phone is out of storage. Tell the moderator now.</p>'}
      <p class="note">Saved. It goes to the moderator with your sales. You can recount and save again; the latest count is the one that counts.</p>
      <button class="btn primary wide" data-close autofocus>Done</button></div>`);
  }

  function step(v, by) { const d = draft(); d.counts[v] = Math.max(0, (parseInt(d.counts[v], 10) || 0) + by); keep(d); refresh(v); }

  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || !el || !el.contains(t)) return;
    if (t.dataset.coInc) step(+t.dataset.coInc, 1);
    else if (t.dataset.coDec) step(+t.dataset.coDec, -1);
    else if ('coSave' in t.dataset) save();
  });
  document.addEventListener('input', e => {
    const t = e.target; if (!el || !el.contains(t)) return;
    const d = draft();
    if (t.id === 'coFloat') { t.value = t.value.replace(/[^\d.]/g, ''); d.float = t.value; keep(d); refresh(); }
    else if (t.id === 'coNote') { d.note = t.value; keep(d); }
    else if (t.dataset.coN) { t.value = t.value.replace(/\D/g, '').slice(0, 4); d.counts[t.dataset.coN] = t.value; keep(d); refresh(+t.dataset.coN); }
  });

  return { render };
})();
