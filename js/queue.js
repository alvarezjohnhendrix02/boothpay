/* Ticket queue for booths that sell ticket items: who is not served yet, who is ongoing, and a Done button.
   Statuses: queued (not yet served) → serving (ongoing) → done. Every change is saved and sent to the Sheet. */
CS.queue = (function () {
  const U = CS.util, { esc, time } = U, S = CS.store, { icon, openSheet, head, toast } = CS.ui;
  let sess = null;

  const tickets = () => S.salesToday(sess.booth).filter(s => s.status === 'paid').flatMap(s => (s.tickets || []).map(t => ({ ...t, sale: s })));
  const unfinished = () => tickets().filter(t => t.status !== 'done');
  const mins = iso => Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  const ago = m => m < 1 ? 'just now' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
  const item = t => { const p = S.catalog().products.find(x => x.sku === t.sku); return (p ? p.name : t.sku) + (t.qty > 1 ? ' ×' + t.qty : ''); };
  const who = t => String(t.sale.customer_name || '').split(' · ')[0] || 'Customer';
  const ref = t => `data-qt="${esc(t.ticket_no)}" data-qs="${esc(t.sale.sale_id)}"`;

  function row(t) {
    const serving = t.status === 'serving', m = mins(serving && t.ts_started ? t.ts_started : t.ts_created);
    return `<li class="q-row ${serving ? 'serving' : 'queued'}${m >= 15 && !serving ? ' late' : ''}">
      <span class="q-no">${esc(t.ticket_no)}</span>
      <span class="q-info"><b>${esc(item(t))}</b><span class="sub">${esc(who(t))} · ${m < 1 ? (serving ? 'started just now' : 'just arrived') : serving ? 'started ' + ago(m) + ' ago' : 'waiting ' + ago(m)}</span></span>
      <span class="q-acts">${serving ? '' : `<button class="btn ghost sm" data-q="serving" ${ref(t)}>Start</button>`}
        <button class="btn go sm" data-q="done" ${ref(t)}>${icon('check')} Done</button></span></li>`;
  }

  function render() {
    const all = tickets(), byTime = (a, b) => a.ts_created.localeCompare(b.ts_created);
    const on = all.filter(t => t.status === 'serving').sort(byTime), wait = all.filter(t => t.status !== 'serving' && t.status !== 'done').sort(byTime);
    const done = all.filter(t => t.status === 'done').sort((a, b) => String(b.ts_ready).localeCompare(String(a.ts_ready)));
    openSheet(`${head('Ticket queue', `${on.length + wait.length} not finished yet`)}
      ${!on.length && !wait.length ? `<div class="empty">${icon('check')}<p>Everyone is served. Nice work!</p></div>` : ''}
      ${on.length ? `<p class="label">Ongoing (${on.length})</p><ul class="q-list">${on.map(row).join('')}</ul>` : ''}
      ${wait.length ? `<p class="label">Not yet served (${wait.length})</p><ul class="q-list">${wait.map(row).join('')}</ul>` : ''}
      ${done.length ? `<details class="q-done"><summary>Done today (${done.length})</summary><ul class="q-list">${done.map(t => `<li class="q-row done">
          <span class="q-no">${esc(t.ticket_no)}</span><span class="q-info"><b>${esc(item(t))}</b><span class="sub">${esc(who(t))} · done ${t.ts_ready ? time(t.ts_ready) : ''}</span></span>
          <button class="link" data-q="serving" ${ref(t)}>Undo</button></li>`).join('')}</ul></details>` : ''}`);
  }

  function badge() {
    const b = document.getElementById('queueBtn'); if (!b || !sess) return;
    const n = unfinished().length;
    b.querySelector('.q-count').textContent = n;
    b.classList.toggle('has', n > 0);
    b.setAttribute('aria-label', `Ticket queue, ${n} not finished`);
  }

  function init(session) {
    sess = session;
    const b = document.getElementById('queueBtn'); if (!b) return;
    const sells = S.catalog().products.some(p => p.active && p.booth === sess.booth && p.type === 'service');
    b.hidden = !sells;
    b.innerHTML = `${icon('ticket')}<span>Queue</span><b class="q-count">0</b>`;
    badge();
    setInterval(() => { badge(); const sh = document.getElementById('sheet'); if (sh.open && sh.querySelector('.q-list, .q-done') && !sh.querySelector('details[open]')) render(); }, 60000);
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || !sess) return;
    if (t.id === 'queueBtn') return render();
    if (!t.dataset.q) return;
    const sale = S.salesToday(sess.booth).find(s => s.sale_id === t.dataset.qs); if (!sale) return;
    if (S.setTicketStatus(sale.sale_id, sess.booth, sale.ts, t.dataset.qt, t.dataset.q, sess)) {
      if (t.dataset.q === 'done') toast(`Ticket ${t.dataset.qt} is done.`);
      render(); badge(); if (CS.sync) CS.sync.run();
    }
  });

  return { init, badge, render };
})();
