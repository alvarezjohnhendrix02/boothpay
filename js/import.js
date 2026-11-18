/* Moderator → Upload: PMS sales exports (Excel .xlsx or CSV; columns matched by the user, guessed first)
   and CSV files sent from booth phones ("Send to moderator"). Parsing lives in js/pms.js. */
CS.views = CS.views || {};
CS.views.upload = (function () {
  const U = CS.util, { esc, money, time, dayLabel, today } = U, S = CS.store, P = CS.pms, { icon, toast, openSheet, closeSheet, head } = CS.ui;
  const PAY = { cash: 'Cash', gcash: 'GCash', other: 'Other (card, Maya…)', unknown: 'Not stated' };
  let st = null, delId = null;
  const fresh = () => ({ step: 'pick', event_id: (S.activeEvent() || {}).event_id || '', booth: (S.booth('PHOTO') || S.catalog().booths[0] || {}).code || '' });

  const mapKey = headers => 'map.' + U.hash(headers.join('|'));
  const knownIds = () => new Set([...S.imports().flatMap(b => b.rows.map(r => r.ext_id)), ...S.allSales().map(s => s.sale_id)]);
  const eventDay = () => { const ev = S.events().find(e => e.event_id === st.event_id); return (ev && ev.start) || today(); };

  function buildBoothFile() {
    const ix = n => st.headers.findIndex(h => h.trim().toLowerCase() === n), I = {};
    ['sale_id', 'date', 'time', 'event_id', 'booth', 'item', 'qty', 'line_total', 'sale_total', 'payment', 'ref', 'status'].forEach(n => { I[n] = ix(n); });
    const groups = new Map(), evIds = new Set(S.events().map(e => e.event_id)); let noAmount = 0;
    st.data.forEach(r => {
      const id = r[I.sale_id]; if (!id) { noAmount++; return; }
      let g = groups.get(id);
      if (!g) {
        const ev = r[I.event_id] || '';
        g = { ext_id: id, ts: P.parseWhen(r[I.date], r[I.time], today()), event_id: evIds.has(ev) ? ev : st.event_id, booth: r[I.booth] || '',
          items: [], total_c: U.centavos(r[I.sale_total]) || 0, pay: P.normPay(r[I.payment]), ref: r[I.ref] || '', status: r[I.status] || 'paid' };
        groups.set(id, g);
      }
      g.items.push({ name: r[I.item] || '', qty: +r[I.qty] || 1, total_c: U.centavos(r[I.line_total]) || 0 });
    });
    return { rows: [...groups.values()], skip: { noAmount, voided: 0, voidedAmt: 0, summary: 0 } };
  }

  /* ---------- files ---------- */
  function useRows(all) {
    const headers = (all[0] || []).map(h => String(h).trim()), low = headers.map(h => h.toLowerCase());
    Object.assign(st, { headers, data: all.slice(1), kind: low.includes('sale_id') && low.includes('line_total') ? 'booth' : 'pms' });
    if (st.kind === 'pms') st.map = S.get(mapKey(headers), null) || P.guess(headers);
  }
  // In a workbook, the sales are on a sheet called "Sales" (or the first sheet with a Total/Amount column).
  function pickSheet(sheets) {
    const ok = s => s.rows.length > 1 && s.rows[0].some(c => /total|amount/i.test(c));
    return (sheets.find(s => /sales|transactions/i.test(s.name) && ok(s)) || sheets.find(ok) || sheets[0]).name;
  }
  async function takeFile(f) {
    st.file = f.name; st.sheets = null; st.exp = [];
    if (/\.xls$/i.test(f.name)) return toast('That is an old Excel file (.xls). Save it as .xlsx or CSV, then upload it.', 'bad');
    if (/\.xlsx$/i.test(f.name)) {
      try { st.sheets = await CS.xlsx.read(f); } catch (e) { return toast('Could not read that Excel file. Save it as CSV and try again.', 'bad'); }
      st.sheet = pickSheet(st.sheets);
      useRows(st.sheets.find(s => s.name === st.sheet).rows);
      const ex = st.sheets.find(s => /expense/i.test(s.name));
      st.exp = ex ? P.expenses(ex.rows) : []; st.expOn = false; st.expType = 'materials';
    } else useRows(CS.csv.parse(await CS.csv.readFile(f)));
    if (st.data.length < 1) return toast('That file has no sales rows.', 'bad');
    st.step = 'map';
    CS.admin.refresh();
  }

  /* ---------- views ---------- */
  function renderPick(el) {
    const ups = S.imports().slice().reverse(), evName = id => (S.events().find(e => e.event_id === id) || { name: 'No event' }).name;
    el.innerHTML = `
      <div class="view-head"><div><h2 class="h1">Upload sales</h2>
        <p class="sub">Bring sales from your PMS (photobooth management system) or files from booth phones into the reports.</p></div></div>
      <ol class="steps panel">
        <li><b>1</b><span>In your PMS, export the event report. The <b>Excel (.xlsx)</b> file works as it is; CSV works too.</span></li>
        <li><b>2</b><span>Pick the event and booth these sales belong to.</span></li>
        <li><b>3</b><span>Choose the file. You will check everything before it is saved.</span></li>
      </ol>
      <div class="field-row">
        <label class="field"><span>Event</span><select class="input" id="upEvent"><option value="">No event</option>${S.events().map(e => `<option value="${e.event_id}" ${e.event_id === st.event_id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Booth <small>(for PMS files)</small></span><select class="input" id="upBooth">${S.catalog().booths.map(b => `<option value="${b.code}" ${b.code === st.booth ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
      </div>
      <label class="drop" id="drop">${icon('upload')}<span class="h3">Tap to choose an Excel or CSV file</span><span class="sub">or drag it here</span>
        <input type="file" id="upFile" accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
      <section><p class="h3" style="margin-bottom:var(--s-2)">Uploaded files</p>
      ${ups.length ? `<ul class="uploads">${ups.map(b => {
        const sum = b.rows.filter(r => r.status !== 'void').reduce((a, r) => a + r.total_c, 0), bt = S.booth(b.booth);
        return `<li>${icon('file')}<div><p class="nm">${esc(b.file)}</p>
          <p class="sub">${b.source === 'pms' ? 'PMS' : 'Booth phone'} · ${esc(evName(b.event_id))}${bt ? ' · ' + esc(bt.name) : ''} · ${dayLabel(U.dayOf(b.ts))} ${time(b.ts)}</p></div>
          <p class="num"><b>${money(sum)}</b><br><span class="sub">${b.rows.length} sales</span></p>
          <button class="icon-btn" data-up-del="${b.import_id}" aria-label="Remove ${esc(b.file)}">${icon('trash')}</button></li>`;
      }).join('')}</ul>` : '<p class="sub">Nothing uploaded yet.</p>'}</section>`;
  }

  function renderMap(el) {
    const pms = st.kind === 'pms', built = pms ? P.build(st, eventDay()) : buildBoothFile(), ids = knownIds(), sk = built.skip;
    const newRows = built.rows.filter(r => !ids.has(r.ext_id)), dup = built.rows.length - newRows.length;
    const live = newRows.filter(r => r.status !== 'void'), voided = newRows.length - live.length, total = live.reduce((a, r) => a + r.total_c, 0);
    const expTotal = (st.exp || []).reduce((a, x) => a + x.amount_c, 0);
    st.ready = newRows;
    const b = S.booth(st.booth), opt = (v, cur, l) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
    el.innerHTML = `
      <button class="link" data-up-back>${icon('back')} Choose a different file</button>
      <div class="view-head"><div><h2 class="h1">${pms ? 'Check the PMS file' : 'Check the booth file'}</h2>
        <p class="sub">${icon('file')} ${esc(st.file)}${st.sheets ? ` · sheet “${esc(st.sheet)}”` : ''} · ${st.data.length} rows${pms ? ` · goes to ${esc(b ? b.name : st.booth)}` : ''}</p></div></div>
      ${st.sheets && st.sheets.length > 1 ? `<label class="field" style="max-width:320px"><span>Sheet with the sales</span><select class="input" id="upSheet">${st.sheets.map(s => opt(s.name, st.sheet, s.name)).join('')}</select></label>` : ''}
      ${pms ? `<details class="panel map-box"${st.mapOpen ? ' open' : ''}><summary class="h3">Columns <span class="sub">(guessed for you; open to check or change)</span></summary>
        <div class="map-grid">${P.FIELDS.map(([k, label]) => `<label class="field"><span>${label}${k === 'amount' ? ' *' : ''}</span>
          <select class="input" data-map="${k}"><option value="">Not in this file</option>${st.headers.map((h, i) => `<option value="${i}" ${String(st.map[k]) === String(i) ? 'selected' : ''}>${esc(h || 'Column ' + (i + 1))}</option>`).join('')}</select></label>`).join('')}</div></details>` : ''}
      <div class="stats">
        <div class="stat"><p class="label">Sales to add</p><p class="big-num">${live.length}</p></div>
        <div class="stat"><p class="label">Total</p><p class="big-num">${money(total)}</p></div>
        ${sk.voided ? `<div class="stat"><p class="label">Refunded / voided (left out)</p><p class="big-num">${sk.voided}</p><p class="sub">${money(sk.voidedAmt)}</p></div>` : ''}
        ${voided ? `<div class="stat"><p class="label">Undone (left out)</p><p class="big-num">${voided}</p></div>` : ''}
        ${dup ? `<div class="stat"><p class="label">Already here</p><p class="big-num">${dup}</p></div>` : ''}
      </div>
      ${sk.summary || sk.noAmount ? `<p class="sub">Also left out: ${[sk.summary && `${sk.summary} total/summary line${sk.summary > 1 ? 's' : ''}`, sk.noAmount && `${sk.noAmount} row${sk.noAmount > 1 ? 's' : ''} with no amount`].filter(Boolean).join(', ')}.</p>` : ''}
      <p class="h3">Preview</p>
      <div class="table-wrap"><table class="table"><thead><tr><th>When</th>${pms ? '<th>Customer</th>' : '<th>Booth</th>'}<th>Items</th><th class="r">Amount</th><th>Paid by</th><th>Ticket / ref</th></tr></thead>
        <tbody>${built.rows.slice(0, 8).map(r => `<tr${ids.has(r.ext_id) || r.status === 'void' ? ' class="dim"' : ''}><td class="num">${dayLabel(U.dayOf(r.ts))} ${time(r.ts)}</td>
          <td>${pms ? (r.cust ? `${esc(CS.customer.name(r.cust.name))}<br><span class="sub">${esc(CS.customer.details({ grade: r.cust.grade, section: CS.customer.section(r.cust.section) }))}</span>` : '—') : esc(r.booth)}</td>
          <td>${r.items.map(i => `${esc(i.name)}${i.qty > 1 ? ' ×' + i.qty : ''}`).join(', ')}</td>
          <td class="r num">${money(r.total_c)}</td><td>${r.status === 'void' ? 'Undone' : PAY[r.pay]}</td><td class="mono">${esc(r.ref)}</td></tr>`).join('')}</tbody></table></div>
      ${built.rows.length > 8 ? `<p class="sub">…and ${built.rows.length - 8} more sales.</p>` : ''}
      ${!pms || st.map.date !== '' ? '' : `<p class="note warn">No date column picked. All sales will use the event's first day (${dayLabel(eventDay())}).</p>`}
      ${st.exp && st.exp.length ? `<section class="panel"><label class="check"><input type="checkbox" id="upExp" ${st.expOn ? 'checked' : ''}>
          Also add the <b>${st.exp.length} expenses (${money(expTotal)})</b> from the “Expenses” sheet</label>
        <label class="field"><span>What kind of expenses are they?</span><select class="input" id="upExpType">${CS.expenses.TYPES.map(t => opt(t[0], st.expType, t[1])).join('')}</select>
          <small>${st.exp.map(x => esc(x.item)).join(', ')}. You can change each one later on the Expenses page.</small></label></section>` : ''}
      <div class="btn-row">
        <button class="btn go" data-up-save ${newRows.length || st.expOn ? '' : 'disabled'}>${icon('check')} Save ${live.length} sale${live.length === 1 ? '' : 's'}${st.expOn ? ` + ${st.exp.length} expenses` : ''}</button>
        <button class="btn ghost" data-up-back>Cancel</button></div>`;
  }

  function render(el) { if (!st) st = fresh(); (st.step === 'map' ? renderMap : renderPick)(el); }

  function save() {
    const rows = st.ready.map(r => {
      const out = { ...r }; delete out.cust;
      if (r.cust) { // remember PMS customers too (same clean-up as at the booth), so they are suggested at every booth
        const c = CS.customer.commit({ name: r.cust.name, grade: r.cust.grade, section: r.cust.section });
        if (c) { out.customer_id = c.customer_id; out.customer_name = CS.customer.label(c); }
      }
      return out;
    });
    const list = S.imports();
    if (rows.length) list.push({ import_id: 'IMP-' + U.rand(6), source: st.kind === 'pms' ? 'pms' : 'booth-file', file: st.file, ts: U.now(),
      event_id: st.event_id, booth: st.kind === 'pms' ? st.booth : '', rows });
    if (!S.saveImports(list)) return toast('This device is out of storage. Remove old uploads first.', 'bad');
    if (st.kind === 'pms') S.set(mapKey(st.headers), st.map); // next export from the same PMS maps itself
    let nx = 0;
    if (st.expOn) { // same file uploaded twice → same expense ids, so nothing is doubled
      const at = new Date(eventDay() + 'T12:00:00+08:00').toISOString();
      st.exp.forEach((x, i) => { CS.expenses.record({ exp_id: 'EXP-PMS-' + U.hash(st.file + '|' + st.event_id + '|' + i + '|' + x.item), ts: at, ts_v: at, date: eventDay(),
        event_id: st.event_id, booth: st.booth, type: st.expType, item: x.item, qty: x.qty, unit_c: x.unit_c, amount_c: x.amount_c, paid_by: '', note: 'From PMS file ' + st.file, status: 'ok' }); nx++; });
    }
    toast(`Added ${rows.filter(r => r.status !== 'void').length} sales${nx ? ` and ${nx} expenses` : ''}. See them in Reports.`);
    st = { ...fresh(), event_id: st.event_id, booth: st.booth };
    CS.admin.refresh(); if (CS.sync) CS.sync.run();
  }

  function click(e, t) {
    const d = t.dataset;
    if ('upBack' in d) { st.step = 'pick'; CS.admin.refresh(); }
    else if ('upSave' in d) save();
    else if (d.upDel) {
      delId = d.upDel; const b = S.imports().find(x => x.import_id === delId);
      openSheet(`${head('Remove this upload?')}<p><b>${esc(b.file)}</b> (${b.rows.length} sales) will be taken out of the reports. You can upload it again later.</p>
        <button class="btn danger wide" data-up-del-yes>${icon('trash')} Remove upload</button><button class="btn ghost wide" data-close>Keep it</button>`);
    } else if ('upDelYes' in d) { S.saveImports(S.imports().filter(x => x.import_id !== delId)); closeSheet(); toast('Upload removed.'); CS.admin.refresh(); }
  }
  function change(e) {
    const t = e.target;
    if (t.id === 'upFile' && t.files[0]) takeFile(t.files[0]);
    else if (t.id === 'upEvent') st.event_id = t.value;
    else if (t.id === 'upBooth') st.booth = t.value;
    else if (t.id === 'upSheet') { st.sheet = t.value; useRows(st.sheets.find(s => s.name === t.value).rows); CS.admin.refresh(); }
    else if (t.id === 'upExp') { st.expOn = t.checked; CS.admin.refresh(); }
    else if (t.id === 'upExpType') st.expType = t.value;
    else if (t.dataset.map) { st.map[t.dataset.map] = t.value === '' ? '' : +t.value; st.mapOpen = true; CS.admin.refresh(); }
  }
  ['dragover', 'drop'].forEach(type => document.addEventListener(type, e => {
    const z = e.target.closest && e.target.closest('#drop'); if (!z) return;
    e.preventDefault();
    if (type === 'drop' && e.dataTransfer.files[0]) takeFile(e.dataTransfer.files[0]);
  }));

  return { render, click, change };
})();
