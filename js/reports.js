/* Reports: one summary of booth-register sales + PMS uploads + booth-phone files. */
CS.report = (function () {
  const U = CS.util, S = CS.store;
  // Every transaction, one shape: {id, ts, event_id, booth, items:[{name,qty,total_c}], total_c, pay, source}
  function collect() {
    const out = [], seen = new Set();
    S.allSales().forEach(s => {
      seen.add(s.sale_id);
      if (s.status !== 'paid') return;
      out.push({ id: s.sale_id, ts: s.ts, event_id: s.event_id || '', booth: s.booth, total_c: s.total_c, pay: s.pay, source: 'pos', customer_id: s.customer_id || '', customer_name: s.customer_name || '',
        items: s.items.map(i => ({ name: i.name || S.productName(i.sku), qty: i.qty, total_c: i.price_c * i.qty })) });
    });
    S.get('remote.sales', []).forEach(s => { // every booth's sales, from the Google Sheet
      if (seen.has(s.sale_id)) return;
      seen.add(s.sale_id);
      if (s.status === 'void') return;
      out.push({ id: s.sale_id, ts: s.ts, event_id: s.event_id || '', booth: s.booth, total_c: s.total_c, pay: s.pay, source: 'sheet', customer_id: s.customer_id || '',
        items: s.items.map(i => ({ name: i.name || S.productName(i.sku), qty: i.qty, total_c: i.price_c * i.qty })) });
    });
    S.imports().forEach(b => b.rows.forEach(r => {
      if (seen.has(r.ext_id)) return; // a booth file holding sales this device already has
      seen.add(r.ext_id);
      if (r.status === 'void') return;
      out.push({ id: r.ext_id, ts: r.ts, event_id: r.event_id != null ? r.event_id : b.event_id, booth: r.booth || b.booth,
        items: r.items, total_c: r.total_c, pay: r.pay, source: b.source });
    }));
    return out;
  }
  function totalsByEvent() { const t = {}; collect().forEach(r => { t[r.event_id] = (t[r.event_id] || 0) + r.total_c; }); return t; }
  return { collect, totalsByEvent };
})();

CS.views = CS.views || {};
CS.views.reports = (function () {
  const U = CS.util, { esc, money, dayLabel, hourLabel, time } = U, S = CS.store, { icon, badge, toast } = CS.ui;
  const PAY = { cash: 'Cash', gcash: 'GCash', other: 'Other', unknown: 'Not stated' };
  const SRC = { pos: 'This device', sheet: 'Booth phones (Sheet)', pms: 'PMS upload', 'booth-file': 'Booth phone file' };
  const PAY_COLOR = { cash: 'var(--mint)', gcash: 'var(--sky)', other: 'var(--lemon)', unknown: 'var(--rule)' };
  let f = null;

  const boothOf = code => S.booth(code) || { code, name: code || 'Unknown booth', color: '#FFB98A', icon: 'store' };
  const evName = id => id ? (S.events().find(e => e.event_id === id) || { name: 'Deleted event' }).name : 'No event';
  // Latest cash count per booth per day (a recount replaces the earlier one), from this device + the Sheet.
  function closeouts() {
    const all = {}, latest = {};
    S.allCloseouts().concat(S.get('remote.closeouts', [])).forEach(c => { all[c.close_id] = c; });
    Object.values(all).forEach(c => {
      if (!((f.event === '*' || (c.event_id || '') === f.event) && (f.booth === '*' || c.booth === f.booth) && (f.day === '*' || U.dayOf(c.ts) === f.day))) return;
      const k = c.booth + '|' + U.dayOf(c.ts);
      if (!latest[k] || c.ts > latest[k].ts) latest[k] = c;
    });
    return Object.values(latest).sort((a, b) => a.ts.localeCompare(b.ts));
  }
  function moneyPanel(rows) {
    const ex = CS.expenses.live().filter(x => (f.event === '*' || (x.event_id || '') === f.event) && (f.booth === '*' || (x.booth || '') === f.booth) && (f.day === '*' || x.date === f.day));
    if (!ex.length) return '';
    const sales = group(rows, r => r.booth), cost = group(ex, x => x.booth || '', x => x.amount_c);
    const codes = [...new Set([...Object.keys(sales), ...Object.keys(cost)])].sort((a, b) => (a === '') - (b === ''));
    const tS = rows.reduce((a, r) => a + r.total_c, 0), tE = ex.reduce((a, x) => a + x.amount_c, 0);
    const pl = v => `<b class="${v < 0 ? 'bad-text' : 'ok-text'}">${v < 0 ? '−' : ''}${money(Math.abs(v))}</b>`;
    return `<section class="panel span2"><p class="h3">${icon('chart')} Sales, expenses and profit</p>
      <div class="table-wrap"><table class="table"><thead><tr><th>Booth</th><th class="r">Sales</th><th class="r">Expenses</th><th class="r">Profit</th></tr></thead>
      <tbody>${codes.map(c => `<tr><td>${c ? `<span class="mini">${badge(boothOf(c), 'sm')}${esc(boothOf(c).name)}</span>` : 'Whole club (shared costs)'}</td>
        <td class="r num">${money(sales[c] || 0)}</td><td class="r num">${money(cost[c] || 0)}</td><td class="r num">${pl((sales[c] || 0) - (cost[c] || 0))}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td><b>Total</b></td><td class="r num"><b>${money(tS)}</b></td><td class="r num"><b>${money(tE)}</b></td><td class="r num">${pl(tS - tE)}</td></tr></tfoot></table></div>
      <p class="sub">Expenses come from the <b>Expenses</b> page. Whole-club costs are not split between booths.</p></section>`;
  }
  function stockPanel() {
    const list = CS.stock.items().filter(s => f.booth === '*' || s.booth === f.booth);
    if (!list.length) return '';
    const hand = CS.stock.onHand(), low = list.filter(s => CS.stock.isLow(s, hand[s.stock_id] || 0));
    return `<section class="panel"><p class="h3">${icon('sticker')} Stock left ${low.length ? `<span class="pill bad">${low.length} low</span>` : '<span class="pill ok">All OK</span>'}</p>
      <ul class="hbars">${list.map(s => { const n = hand[s.stock_id] || 0, bad = CS.stock.isLow(s, n); return `<li><span class="hb-name">${badge(boothOf(s.booth), 'sm')}${esc(s.name)}</span>
        <span class="sub">${bad ? (n <= 0 ? 'Out' : 'Low') : ''}</span><span class="num hb-val"><b class="${bad ? 'bad-text' : ''}">${n}</b> <span class="sub">${esc(s.unit)}</span></span></li>`; }).join('')}</ul></section>`;
  }

  function cashPanel() {
    const list = closeouts();
    if (!list.length) return '';
    const flagged = list.filter(c => Math.abs(c.variance_c) > 5000).length;
    return `<section class="panel span2"><p class="h3">${icon('cash')} End-of-day cash count ${flagged ? `<span class="pill bad">${flagged} to check</span>` : '<span class="pill ok">All good</span>'}</p>
      <div class="table-wrap"><table class="table"><thead><tr><th>Booth</th><th>Day</th><th class="r">Should be</th><th class="r">Counted</th><th>Difference</th><th>Note</th></tr></thead>
      <tbody>${list.map(c => { const v = c.variance_c, off = Math.abs(v) > 5000; return `<tr>
        <td><span class="mini">${badge(boothOf(c.booth), 'sm')}${esc(boothOf(c.booth).name)}</span></td><td class="num">${dayLabel(U.dayOf(c.ts))} ${time(c.ts)}</td>
        <td class="r num">${money(c.expected_cash_c)}</td><td class="r num"><b>${money(c.counted_cash_c)}</b></td>
        <td><span class="pill ${off ? 'bad' : 'ok'}">${v === 0 ? 'Exact' : (v < 0 ? 'Short ' : 'Over ') + money(Math.abs(v))}</span></td>
        <td class="sub">${esc(c.note || '')}</td></tr>`; }).join('')}</tbody></table></div>
      <p class="sub">Should be = starting cash + cash sales. Differences over ₱50 are marked to check.</p></section>`;
  }

  // Customers who gave a name: how many, how many came back, and which grades buy.
  const custOf = r => (r.customer_id && CS.customer.byId(r.customer_id)) || null;
  function custCols(r) { const c = custOf(r); return c ? [c.name, CS.customer.gradeLabel(c.grade), c.section || ''] : [r.customer_name || '', '', '']; }
  function custPanel(rows) {
    const named = rows.filter(r => r.customer_id);
    if (!named.length) return '';
    const per = {}; named.forEach(r => { per[r.customer_id] = (per[r.customer_id] || 0) + 1; });
    const people = Object.keys(per).length, back = Object.values(per).filter(n => n > 1).length;
    const grades = {}; Object.keys(per).forEach(id => { const c = CS.customer.byId(id); const g = c ? CS.customer.levelOf(c.grade) : 'Unknown'; grades[g] = (grades[g] || 0) + 1; });
    const max = Math.max(...Object.values(grades));
    const top = Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 5).filter(e => e[1] > 1);
    return `<section class="panel"><p class="h3">${icon('user')} Customers</p>
      <div class="row"><span>People who gave their name</span><b class="num">${people}</b></div>
      <div class="row"><span>Came back more than once</span><b class="num">${back}</b></div>
      <div class="row"><span>Sales with no name</span><b class="num">${rows.length - named.length}</b></div>
      <ul class="hbars">${Object.entries(grades).sort((a, b) => b[1] - a[1]).map(([g, n]) => `<li><span class="hb-name">${esc(g)}</span>
        <span class="hb-track"><i style="width:${(n / max * 100).toFixed(1)}%;background:var(--pink)"></i></span><span class="num hb-val"><b>${n}</b></span></li>`).join('')}</ul>
      ${top.length ? `<p class="sub">Most visits: ${top.map(([id, n]) => { const c = CS.customer.byId(id); return `${esc(c ? CS.customer.label(c) : id)} (${n})`; }).join(', ')}</p>` : ''}
    </section>`;
  }

  const group = (rows, key, val = r => r.total_c) => rows.reduce((m, r) => { const k = key(r); m[k] = (m[k] || 0) + val(r); return m; }, {});

  function filtered() {
    return CS.report.collect().filter(r => (f.event === '*' || r.event_id === f.event) && (f.booth === '*' || r.booth === f.booth) && (f.day === '*' || U.dayOf(r.ts) === f.day));
  }

  function bars(obj, label, color) {
    const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]), max = Math.max(1, ...entries.map(e => e[1])), sum = entries.reduce((a, e) => a + e[1], 0);
    return `<ul class="hbars">${entries.map(([k, v]) => `<li><span class="hb-name">${label(k)}</span>
      <span class="hb-track"><i style="width:${(v / max * 100).toFixed(1)}%;background:${color(k)}"></i></span>
      <span class="num hb-val"><b>${money(v)}</b> <span class="sub">${sum ? Math.round(v / sum * 100) : 0}%</span></span></li>`).join('')}</ul>`;
  }

  function hourChart(rows) {
    const by = group(rows, r => U.hour(r.ts)), hs = Object.keys(by).map(Number);
    const lo = Math.min(8, ...hs), hi = Math.max(17, ...hs), max = Math.max(1, ...Object.values(by));
    const n = hi - lo + 1, W = n * 44, H = 170;
    let svg = '';
    for (let h = lo; h <= hi; h++) {
      const v = by[h] || 0, bh = Math.round(v / max * 120), x = (h - lo) * 44 + 6;
      svg += `<g><title>${hourLabel(h)}: ${money(v)}</title>
        <rect x="${x}" y="${140 - bh}" width="32" height="${Math.max(bh, v ? 2 : 0)}" rx="4" fill="var(--coral)"/>
        ${v ? `<text x="${x + 16}" y="${134 - bh}" text-anchor="middle" class="svg-val">${v >= 100000 ? (v / 100000).toFixed(1).replace(/\.0$/, '') + 'k' : Math.round(v / 100)}</text>` : ''}
        <text x="${x + 16}" y="160" text-anchor="middle" class="svg-lab">${hourLabel(h)}</text></g>`;
    }
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sales by hour, in pesos" preserveAspectRatio="xMinYMid meet" style="min-width:${Math.min(W, 640)}px">
      <line x1="0" y1="140.5" x2="${W}" y2="140.5" stroke="var(--rule)"/>${svg}</svg>`;
  }

  function render(el) {
    if (!f) f = { event: (S.activeEvent() || {}).event_id || '*', booth: '*', day: '*' };
    const all = CS.report.collect();
    const evIds = [...new Set(all.map(r => r.event_id))], evs = S.events();
    if (f.event !== '*' && !evs.some(e => e.event_id === f.event) && !evIds.includes(f.event)) f.event = '*';
    const days = [...new Set(all.filter(r => f.event === '*' || r.event_id === f.event).map(r => U.dayOf(r.ts)))].sort();
    if (!days.includes(f.day)) f.day = '*';
    const rows = filtered();
    const gross = rows.reduce((a, r) => a + r.total_c, 0), units = rows.reduce((a, r) => a + r.items.reduce((b, i) => b + i.qty, 0), 0);
    const boothCodes = [...new Set([...S.catalog().booths.map(b => b.code), ...all.map(r => r.booth)])];
    const opt = (v, cur, label) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;

    const items = {};
    rows.forEach(r => r.items.forEach(i => { const k = r.booth + '|' + i.name; const o = items[k] || (items[k] = { booth: r.booth, name: i.name, qty: 0, total_c: 0 }); o.qty += i.qty; o.total_c += i.total_c; }));
    const top = Object.values(items).sort((a, b) => b.total_c - a.total_c).slice(0, 10);
    const byDay = group(rows, r => U.dayOf(r.ts));
    const scope = [f.event === '*' ? 'All events' : evName(f.event), f.booth === '*' ? 'all booths' : boothOf(f.booth).name, f.day === '*' ? 'all days' : dayLabel(f.day)].join(' · ');

    el.innerHTML = `
      <div class="view-head"><div><h2 class="h1">Reports</h2><p class="sub">Booth sales and PMS uploads, together in one summary.</p></div>
        <div class="btn-row no-print">
          <button class="btn ghost sm" data-r-csv ${rows.length ? '' : 'disabled'}>${icon('download')} All sales (CSV)</button>
          <button class="btn ghost sm" data-r-sum ${rows.length ? '' : 'disabled'}>${icon('download')} Summary (CSV)</button>
          <button class="btn primary sm" data-r-print ${rows.length ? '' : 'disabled'}>${icon('printer')} Print / PDF</button></div></div>
      <div class="filters no-print">
        <label class="field"><span>Event</span><select class="input" data-f="event">${opt('*', f.event, 'All events')}${evs.map(e => opt(e.event_id, f.event, e.name)).join('')}${evIds.includes('') ? opt('', f.event, 'No event') : ''}</select></label>
        <label class="field"><span>Booth</span><select class="input" data-f="booth">${opt('*', f.booth, 'All booths')}${boothCodes.map(c => opt(c, f.booth, boothOf(c).name)).join('')}</select></label>
        <label class="field"><span>Day</span><select class="input" data-f="day">${opt('*', f.day, 'All days')}${days.map(d => opt(d, f.day, dayLabel(d))).join('')}</select></label>
      </div>
      <p class="print-only h3">${esc(scope)}</p>
      ${!rows.length ? `<div class="empty big">${icon('chart')}<p class="h3">No sales to show yet</p>
        <p>Sales made on this device appear here by themselves. For the PMS and other booth phones, go to <b>Upload PMS</b>.</p>
        <button class="btn primary" data-view="upload">${icon('upload')} Upload sales</button></div>` : `
      <div class="stats">
        <div class="stat"><p class="label">Total sales</p><p class="big-num">${money(gross)}</p></div>
        <div class="stat"><p class="label">Transactions</p><p class="big-num">${rows.length}</p></div>
        <div class="stat"><p class="label">Average sale</p><p class="big-num">${money(Math.round(gross / rows.length))}</p></div>
        <div class="stat"><p class="label">Items sold</p><p class="big-num">${units}</p></div>
      </div>
      <div class="report-grid">
        ${moneyPanel(rows)}
        ${stockPanel()}
        ${cashPanel()}
        <section class="panel"><p class="h3">By booth</p>
          ${bars(group(rows, r => r.booth), k => `${badge(boothOf(k), 'sm')}${esc(boothOf(k).name)}`, k => boothOf(k).color)}</section>
        ${custPanel(rows)}
        <section class="panel"><p class="h3">How people paid</p>
          ${bars(group(rows, r => r.pay || 'unknown'), k => PAY[k] || k, k => PAY_COLOR[k] || 'var(--graphite)')}</section>
        <section class="panel span2"><p class="h3">Sales by hour <span class="sub">(pesos)</span></p><div class="chart-wrap">${hourChart(rows)}</div></section>
        ${Object.keys(byDay).length > 1 ? `<section class="panel"><p class="h3">By day</p>${bars(byDay, k => dayLabel(k), () => 'var(--peach)')}</section>` : ''}
        <section class="panel"><p class="h3">Where the numbers came from</p>
          ${bars(group(rows, r => r.source), k => SRC[k] || k, k => ({ pos: 'var(--lilac)', sheet: 'var(--sky)', pms: 'var(--coral)' })[k] || 'var(--aqua)')}</section>
        <section class="panel span2"><p class="h3">Best sellers</p>
          <div class="table-wrap"><table class="table"><thead><tr><th>Item</th><th>Booth</th><th class="r">Sold</th><th class="r">Sales</th></tr></thead>
          <tbody>${top.map(i => `<tr><td>${esc(i.name)}</td><td><span class="mini">${badge(boothOf(i.booth), 'sm')}${esc(boothOf(i.booth).name)}</span></td>
            <td class="r num">${i.qty}</td><td class="r num"><b>${money(i.total_c)}</b></td></tr>`).join('')}</tbody></table></div></section>
      </div>`}`;
  }

  function exportAll() {
    const out = [['date', 'time', 'event', 'booth', 'item', 'qty', 'amount', 'payment', 'source', 'transaction_id', 'customer', 'grade', 'section']];
    filtered().sort((a, b) => a.ts.localeCompare(b.ts)).forEach(r => r.items.forEach(i => out.push([U.dayOf(r.ts), time(r.ts), evName(r.event_id), boothOf(r.booth).name,
      i.name, i.qty, (i.total_c / 100).toFixed(2), PAY[r.pay] || r.pay, SRC[r.source] || r.source, r.id, ...custCols(r)])));
    CS.csv.download(`contactsheet-sales-${U.today()}.csv`, CS.csv.write(out));
  }
  function exportSummary() {
    const rows = filtered(), out = [['ContactSheet summary', ''], ['Scope', [f.event === '*' ? 'All events' : evName(f.event), f.booth === '*' ? 'All booths' : boothOf(f.booth).name, f.day === '*' ? 'All days' : f.day].join(' / ')], [],
      ['Booth', 'Transactions', 'Items', 'Cash', 'GCash', 'Other / not stated', 'Total']];
    const by = {};
    rows.forEach(r => { const o = by[r.booth] || (by[r.booth] = { n: 0, q: 0, cash: 0, gcash: 0, other: 0, t: 0 });
      o.n++; o.q += r.items.reduce((a, i) => a + i.qty, 0); o.t += r.total_c; o[r.pay === 'cash' || r.pay === 'gcash' ? r.pay : 'other'] += r.total_c; });
    const p = c => (c / 100).toFixed(2), tot = { n: 0, q: 0, cash: 0, gcash: 0, other: 0, t: 0 };
    Object.entries(by).forEach(([b, o]) => { out.push([boothOf(b).name, o.n, o.q, p(o.cash), p(o.gcash), p(o.other), p(o.t)]); Object.keys(tot).forEach(k => { tot[k] += o[k]; }); });
    out.push(['TOTAL', tot.n, tot.q, p(tot.cash), p(tot.gcash), p(tot.other), p(tot.t)]);
    CS.csv.download(`contactsheet-summary-${U.today()}.csv`, CS.csv.write(out));
  }

  function click(e, t) {
    const d = t.dataset;
    if ('rCsv' in d) { exportAll(); toast('Sales file saved. It opens in Excel or Google Sheets.'); }
    else if ('rSum' in d) { exportSummary(); toast('Summary file saved.'); }
    else if ('rPrint' in d) window.print();
  }
  function change(e) { const k = e.target.dataset.f; if (k && k in f) { f[k] = e.target.value; CS.admin.refresh(); } }

  return { render, click, change };
})();
