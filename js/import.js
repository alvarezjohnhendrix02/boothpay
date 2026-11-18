/* Moderator → Upload: PMS sales exports (any CSV, columns matched by the user)
   and CSV files sent from booth phones ("Send to moderator"). */
CS.views = CS.views || {};
CS.views.upload = (function () {
  const U = CS.util, { esc, money, time, dayLabel, today } = U, S = CS.store, { icon, badge, toast, openSheet, closeSheet, head } = CS.ui;
  const FIELDS = [
    ['date', 'Date (or date and time)', /date|timestamp|created|when|day/],
    ['time', 'Time (if it has its own column)', /^time$|^time\b|\btime$/],
    ['item', 'Item / package', /item|package|product|desc|service|layout|name/],
    ['qty', 'Quantity', /qty|quantity|count|pcs|copies/],
    ['amount', 'Amount paid (total)', /total|amount|price|paid|sales|grand|net|php|peso/],
    ['pay', 'Payment method', /pay|method|mode|tender/],
    ['ref', 'Reference / transaction no.', /ref|trans|receipt|order|invoice|txn|\bid\b|no\.?$/],
  ];
  const PAY = { cash: 'Cash', gcash: 'GCash', other: 'Other (card, Maya…)', unknown: 'Not stated' };
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  let st = null, delId = null;
  const fresh = () => ({ step: 'pick', event_id: (S.activeEvent() || {}).event_id || '', booth: (S.booth('PHOTO') || S.catalog().booths[0] || {}).code || '' });

  /* ---------- parsing ---------- */
  function normPay(s) {
    s = String(s || '').toLowerCase();
    if (!s.trim()) return 'unknown';
    if (/g-?cash/.test(s)) return 'gcash';
    if (/cash/.test(s)) return 'cash';
    return 'other';
  }
  function parseWhen(d, t, fb) {
    d = String(d || '').trim(); t = String(t || '').trim();
    const p = n => String(n).padStart(2, '0');
    let y, m, day, h = 12, mi = 0, se = 0, mm;
    if (/^\d{5}(\.\d+)?$/.test(d)) { // Excel serial date
      const x = new Date(Date.UTC(1899, 11, 30) + Math.round(parseFloat(d) * 86400000));
      y = x.getUTCFullYear(); m = x.getUTCMonth() + 1; day = x.getUTCDate(); h = x.getUTCHours(); mi = x.getUTCMinutes();
      if (!t) return new Date(`${y}-${p(m)}-${p(day)}T${p(h)}:${p(mi)}:00+08:00`).toISOString();
    }
    const s = (d + ' ' + t).trim();
    if ((mm = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) { y = +mm[1]; m = +mm[2]; day = +mm[3]; }
    else if ((mm = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) { m = +mm[1]; day = +mm[2]; y = +mm[3]; if (y < 100) y += 2000; if (m > 12) [m, day] = [day, m]; }
    else if ((mm = s.match(/([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/))) { m = MONTHS.indexOf(mm[1].slice(0, 3).toLowerCase()) + 1; day = +mm[2]; y = +mm[3]; }
    if (!y || !m || m < 1) [y, m, day] = fb.split('-').map(Number);
    const tm = s.replace(/\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/, '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?\s?m\.?)?/i);
    if (tm) {
      h = +tm[1]; mi = +tm[2]; se = +(tm[3] || 0);
      const ap = (tm[4] || '').toLowerCase();
      if (ap.startsWith('p') && h < 12) h += 12;
      if (ap.startsWith('a') && h === 12) h = 0;
    }
    const dt = new Date(`${y}-${p(m)}-${p(day)}T${p(h)}:${p(mi)}:${p(se)}+08:00`);
    return isNaN(dt) ? new Date(fb + 'T12:00:00+08:00').toISOString() : dt.toISOString();
  }

  function guess(headers) {
    const used = new Set(), map = {}, low = headers.map(h => h.trim().toLowerCase());
    FIELDS.forEach(([k, , re]) => {
      let i = k === 'amount' ? low.findIndex((h, j) => !used.has(j) && /total/.test(h)) : -1;
      if (i < 0) i = low.findIndex((h, j) => !used.has(j) && re.test(h));
      map[k] = i >= 0 ? i : '';
      if (i >= 0) used.add(i);
    });
    return map;
  }
  const mapKey = headers => 'map.' + U.hash(headers.join('|'));
  const knownIds = () => new Set([...S.imports().flatMap(b => b.rows.map(r => r.ext_id)), ...S.allSales().map(s => s.sale_id)]);
  const eventDay = () => { const ev = S.events().find(e => e.event_id === st.event_id); return (ev && ev.start) || today(); };

  function buildPms() {
    const counts = {}, rows = []; let skipped = 0;
    st.data.forEach(r => {
      const v = k => st.map[k] === '' || st.map[k] == null ? '' : String(r[st.map[k]] || '').trim();
      const amt = U.centavos(v('amount'));
      if (isNaN(amt)) { skipped++; return; }
      const raw = r.join('|'); counts[raw] = (counts[raw] || 0) + 1; // same row twice in one file = 2 sales; same file twice = skipped
      const qty = Math.max(1, parseInt(v('qty'), 10) || 1);
      rows.push({ ext_id: 'pms-' + U.hash(raw + '#' + counts[raw]), ts: parseWhen(v('date'), v('time'), eventDay()),
        items: [{ name: v('item') || 'PMS sale', qty, total_c: amt }], total_c: amt, pay: normPay(v('pay')), ref: v('ref') });
    });
    return { rows, skipped };
  }

  function buildBoothFile() {
    const ix = n => st.headers.findIndex(h => h.trim().toLowerCase() === n), I = {};
    ['sale_id', 'date', 'time', 'event_id', 'booth', 'item', 'qty', 'line_total', 'sale_total', 'payment', 'ref', 'status'].forEach(n => { I[n] = ix(n); });
    const groups = new Map(), evIds = new Set(S.events().map(e => e.event_id)); let skipped = 0;
    st.data.forEach(r => {
      const id = r[I.sale_id]; if (!id) { skipped++; return; }
      let g = groups.get(id);
      if (!g) {
        const ev = r[I.event_id] || '';
        g = { ext_id: id, ts: parseWhen(r[I.date], r[I.time], today()), event_id: evIds.has(ev) ? ev : st.event_id, booth: r[I.booth] || '',
          items: [], total_c: U.centavos(r[I.sale_total]) || 0, pay: normPay(r[I.payment]), ref: r[I.ref] || '', status: r[I.status] || 'paid' };
        groups.set(id, g);
      }
      g.items.push({ name: r[I.item] || '', qty: +r[I.qty] || 1, total_c: U.centavos(r[I.line_total]) || 0 });
    });
    return { rows: [...groups.values()], skipped };
  }

  async function takeFile(f) {
    if (/\.xlsx?$/i.test(f.name)) return toast('That is an Excel file. In Excel: File → Save As → CSV, then upload the CSV.', 'bad');
    const all = CS.csv.parse(await CS.csv.readFile(f));
    if (all.length < 2) return toast('That file has no sales rows.', 'bad');
    const headers = all[0].map(h => h.trim());
    const low = headers.map(h => h.toLowerCase());
    Object.assign(st, { file: f.name, headers, data: all.slice(1), kind: low.includes('sale_id') && low.includes('line_total') ? 'booth' : 'pms' });
    if (st.kind === 'pms') st.map = S.get(mapKey(headers), null) || guess(headers);
    st.step = 'map';
    CS.admin.refresh();
  }

  /* ---------- views ---------- */
  function eventSelect() {
    return `<select class="input" id="upEvent"><option value="">No event</option>${S.events().map(e => `<option value="${e.event_id}" ${e.event_id === st.event_id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select>`;
  }

  function renderPick(el) {
    const ups = S.imports().slice().reverse(), evName = id => (S.events().find(e => e.event_id === id) || { name: 'No event' }).name;
    el.innerHTML = `
      <div class="view-head"><div><h2 class="h1">Upload sales</h2>
        <p class="sub">Bring sales from your PMS (photobooth management system) or files from booth phones into the reports.</p></div></div>
      <ol class="steps panel">
        <li><b>1</b><span>In your PMS, export the sales report as a <b>CSV</b> file. (Excel file? Open it, then File → Save As → CSV.)</span></li>
        <li><b>2</b><span>Pick the event and booth these sales belong to.</span></li>
        <li><b>3</b><span>Choose the file. You will check the columns before anything is saved.</span></li>
      </ol>
      <div class="field-row">
        <label class="field"><span>Event</span>${eventSelect()}</label>
        <label class="field"><span>Booth <small>(for PMS files)</small></span><select class="input" id="upBooth">${S.catalog().booths.map(b => `<option value="${b.code}" ${b.code === st.booth ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
      </div>
      <label class="drop" id="drop">${icon('upload')}<span class="h3">Tap to choose a CSV file</span><span class="sub">or drag it here</span>
        <input type="file" id="upFile" accept=".csv,.txt,text/csv"></label>
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
    const pms = st.kind === 'pms', built = pms ? buildPms() : buildBoothFile(), ids = knownIds();
    const newRows = built.rows.filter(r => !ids.has(r.ext_id)), dup = built.rows.length - newRows.length;
    const live = newRows.filter(r => r.status !== 'void'), voided = newRows.length - live.length, total = live.reduce((a, r) => a + r.total_c, 0);
    st.ready = newRows;
    const b = S.booth(st.booth);
    el.innerHTML = `
      <button class="link" data-up-back>${icon('back')} Choose a different file</button>
      <div class="view-head"><div><h2 class="h1">${pms ? 'Match the columns' : 'Check the booth file'}</h2>
        <p class="sub">${icon('file')} ${esc(st.file)} · ${st.data.length} rows${pms ? ` · goes to ${esc(b ? b.name : st.booth)}` : ''}</p></div></div>
      ${pms ? `<p class="sub">Tell ContactSheet what each column means. We made a guess, so just check it. <b>Amount paid</b> is the only one you must pick.</p>
        <div class="map-grid">${FIELDS.map(([k, label]) => `<label class="field"><span>${label}${k === 'amount' ? ' *' : ''}</span>
          <select class="input" data-map="${k}"><option value="">Not in this file</option>${st.headers.map((h, i) => `<option value="${i}" ${String(st.map[k]) === String(i) ? 'selected' : ''}>${esc(h || 'Column ' + (i + 1))}</option>`).join('')}</select></label>`).join('')}</div>` : ''}
      <div class="stats">
        <div class="stat"><p class="label">Sales to add</p><p class="big-num">${live.length}</p></div>
        <div class="stat"><p class="label">Total</p><p class="big-num">${money(total)}</p></div>
        ${built.skipped ? `<div class="stat"><p class="label">Skipped (no amount)</p><p class="big-num bad-text">${built.skipped}</p></div>` : ''}
        ${voided ? `<div class="stat"><p class="label">Undone (not counted)</p><p class="big-num">${voided}</p></div>` : ''}
        ${dup ? `<div class="stat"><p class="label">Already here</p><p class="big-num">${dup}</p></div>` : ''}
      </div>
      <p class="h3">Preview</p>
      <div class="table-wrap"><table class="table"><thead><tr><th>When</th>${pms ? '' : '<th>Booth</th>'}<th>Item</th><th class="r">Qty</th><th class="r">Amount</th><th>Paid by</th><th>Ref</th></tr></thead>
        <tbody>${built.rows.slice(0, 8).map(r => `<tr${ids.has(r.ext_id) || r.status === 'void' ? ' class="dim"' : ''}><td class="num">${dayLabel(U.dayOf(r.ts))} ${time(r.ts)}</td>${pms ? '' : `<td>${esc(r.booth)}</td>`}
          <td>${r.items.map(i => esc(i.name)).join(', ')}</td><td class="r num">${r.items.reduce((a, i) => a + i.qty, 0)}</td>
          <td class="r num">${money(r.total_c)}</td><td>${r.status === 'void' ? 'Undone' : PAY[r.pay]}</td><td class="mono">${esc(r.ref)}</td></tr>`).join('')}</tbody></table></div>
      ${built.rows.length > 8 ? `<p class="sub">…and ${built.rows.length - 8} more rows.</p>` : ''}
      ${!pms || st.map.date !== '' ? '' : `<p class="note warn">No date column picked. All sales will use the event's first day (${dayLabel(eventDay())}).</p>`}
      <div class="btn-row">
        <button class="btn go" data-up-save ${newRows.length ? "" : "disabled"}>${icon("check")} Save ${live.length} sale${live.length === 1 ? '' : 's'}</button>
        <button class="btn ghost" data-up-back>Cancel</button></div>`;
  }

  function render(el) { if (!st) st = fresh(); (st.step === 'map' ? renderMap : renderPick)(el); }

  function save() {
    const list = S.imports();
    list.push({ import_id: 'IMP-' + U.rand(6), source: st.kind === 'pms' ? 'pms' : 'booth-file', file: st.file, ts: U.now(),
      event_id: st.event_id, booth: st.kind === 'pms' ? st.booth : '', rows: st.ready });
    if (!S.saveImports(list)) return toast('This device is out of storage. Remove old uploads first.', 'bad');
    if (st.kind === 'pms') S.set(mapKey(st.headers), st.map); // next export from the same PMS maps itself
    toast(`Added ${st.ready.filter(r => r.status !== 'void').length} sales. See them in Reports.`);
    st = { ...fresh(), event_id: st.event_id, booth: st.booth };
    CS.admin.refresh();
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
    else if (t.dataset.map) { st.map[t.dataset.map] = t.value === '' ? '' : +t.value; CS.admin.refresh(); }
  }
  ['dragover', 'drop'].forEach(type => document.addEventListener(type, e => {
    const z = e.target.closest && e.target.closest('#drop'); if (!z) return;
    e.preventDefault();
    if (type === 'drop' && e.dataTransfer.files[0]) takeFile(e.dataTransfer.files[0]);
  }));

  return { render, click, change };
})();
