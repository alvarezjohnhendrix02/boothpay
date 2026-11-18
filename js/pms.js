/* Reading a PMS (photobooth management system) sales export: column guesses, dates, payment,
   extras split into their own items, and which rows are NOT sales (TOTAL lines, refunded / voided). */
CS.pms = (function () {
  const U = CS.util;
  // [key, label, header pattern]. Order matters: an earlier field claims a column first.
  const FIELDS = [
    ['date', 'Date (or date and time)', /\bdate\b|timestamp|created|\bwhen\b|^day$/],
    ['time', 'Time (if it has its own column)', /^time$|^time\b|\btime$/],
    ['status', 'Status (paid / refunded)', /status|state/],
    ['item', 'Item / package', /type|package|product|\bitems?\b|service|layout|desc/],
    ['extras_amt', 'Extras amount', /(extra|add-?on).*(amount|total|price)/],
    ['extras', 'Extras / add-ons', /extra|add-?on/],
    ['qty', 'Quantity', /\bqty\b|quantity|\bcount\b|\bpcs\b|copies/],
    ['amount', 'Amount paid (total)', /total|amount|price|paid|sales|grand|net|php|peso/],
    ['pay', 'Payment method', /pay|method|mode|tender|^cash$/],
    ['ref', 'Ticket / reference no.', /ticket|receipt|invoice|txn|order|\bref|transaction\s*(id|no|#)|^or\b/],
    ['customer', 'Customer name', /customer|buyer|client|^name$/],
    ['section', 'Grade & section', /grade|section|strand|year level/],
    ['cashier', 'Cashier', /cashier|sold by|seller|staff/],
  ];
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  function guess(headers) {
    const used = new Set(), map = {}, low = headers.map(h => String(h).trim().toLowerCase());
    FIELDS.forEach(([k, , re]) => {
      let i = k === 'amount' ? low.findIndex((h, j) => !used.has(j) && /total/.test(h)) : -1;
      if (i < 0) i = low.findIndex((h, j) => !used.has(j) && h && re.test(h));
      map[k] = i >= 0 ? i : '';
      if (i >= 0) used.add(i);
    });
    return map;
  }

  // Payment text → cash | gcash | other | unknown. A "Cash" column holding an amount means it was paid in cash.
  function normPay(s, header) {
    s = String(s || '').toLowerCase().trim();
    if (/^cash$/i.test(String(header || '').trim())) return parseFloat(s) > 0 ? 'cash' : 'unknown';
    if (!s) return 'unknown';
    if (/g-?cash/.test(s)) return 'gcash';
    if (/cash/.test(s)) return 'cash';
    return 'other';
  }

  function parseWhen(d, t, fb) {
    d = String(d || '').trim(); t = String(t || '').trim();
    const p = n => String(n).padStart(2, '0');
    let y, m, day, h = 12, mi = 0, se = 0, mm;
    if (/^\d{5}(\.\d+)?$/.test(d)) { // Excel serial date (time of day in the decimals)
      const x = new Date(Date.UTC(1899, 11, 30) + Math.round(parseFloat(d) * 86400000));
      y = x.getUTCFullYear(); m = x.getUTCMonth() + 1; day = x.getUTCDate(); h = x.getUTCHours(); mi = x.getUTCMinutes();
      if (!t || /^\d{5}(\.\d+)?$/.test(t)) return new Date(`${y}-${p(m)}-${p(day)}T${p(h)}:${p(mi)}:00+08:00`).toISOString();
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

  const isSummaryRow = r => r.slice(0, 3).some(c => /^\s*(grand\s+)?totals?\b/i.test(String(c)));
  const isVoid = s => /refund|void|cancel|delet|unpaid|fail|revers/i.test(String(s));

  // "Additional Print × 2, Additional Shoot × 1" → [{name, qty}], amount shared by quantity.
  function extras(text, amt) {
    const list = String(text || '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean).map(part => {
      const m = part.match(/^(.*?)\s*[×x*]\s*(\d+)\s*$/i);
      return { name: (m ? m[1] : part).replace(/\s*\((extra|add-?on)\)\s*$/i, '').trim(), qty: m ? +m[2] : 1 };
    });
    const units = list.reduce((a, x) => a + x.qty, 0);
    let left = amt;
    list.forEach((x, i) => { x.total_c = i === list.length - 1 ? left : Math.round(amt * x.qty / units); left -= x.total_c; });
    return list;
  }

  // "7 OLHR" → {grade:'7', section:'OLHR'}; "Teacher" → teacher; anything else → visitor.
  function gradeSection(gs) {
    const s = String(gs || '').trim(); let m;
    if (!s) return { grade: '', section: '' };
    if ((m = s.match(/^(?:grade|gr\.?|g)?\s*(1[0-2]|[1-9])(?![\d])\s*[-–:]?\s*(.*)$/i))) return { grade: m[1], section: m[2] };
    if ((m = s.match(/^k(?:inder(?:garten)?)?\b\s*[-–:]?\s*(.*)$/i))) return { grade: 'K', section: m[1] };
    if (/teacher|faculty|staff/i.test(s)) return { grade: 'teacher', section: s.replace(/teachers?|faculty/ig, '').replace(/^[\s-–:]+/, '') || 'Faculty' };
    if (/college/i.test(s)) return { grade: 'C', section: s.replace(/college/ig, '').replace(/^[\s-–:]+/, '') };
    return { grade: 'guest', section: s };
  }

  // st: {data, map, headers}. Returns the sales plus what was left out and why.
  function build(st, day) {
    const counts = {}, rows = [], skip = { noAmount: 0, voided: 0, voidedAmt: 0, summary: 0 };
    st.data.forEach(r => {
      const v = k => st.map[k] === '' || st.map[k] == null ? '' : String(r[st.map[k]] == null ? '' : r[st.map[k]]).trim();
      if (isSummaryRow(r)) { skip.summary++; return; }
      const amt = U.centavos(v('amount'));
      if (isNaN(amt)) { skip.noAmount++; return; }
      if (isVoid(v('status'))) { skip.voided++; skip.voidedAmt += amt; return; }
      const raw = r.join('|'); counts[raw] = (counts[raw] || 0) + 1; // same row twice in one file = 2 sales; same file twice = skipped
      const ex = U.centavos(v('extras_amt')), exAmt = isNaN(ex) ? 0 : Math.min(ex, amt);
      const added = v('extras') ? extras(v('extras'), exAmt) : [];
      const qty = Math.max(1, parseInt(v('qty'), 10) || 1);
      const items = [{ name: v('item') || 'PMS sale', qty, total_c: amt - (added.length ? exAmt : 0) }, ...added];
      rows.push({ ext_id: 'pms-' + U.hash(raw + '#' + counts[raw]), ts: parseWhen(v('date'), v('time'), day), items, total_c: amt,
        pay: normPay(v('pay'), st.map.pay === '' ? '' : st.headers[st.map.pay]), ref: v('ref'), staff_name: v('cashier'),
        cust: v('customer') ? { name: v('customer'), ...gradeSection(v('section')) } : null });
    });
    return { rows, skip };
  }

  // An "Expenses" sheet: Item | Quantity | Unit cost | Total. Stops at the TOTAL line.
  function expenses(rows) {
    const hi = rows.findIndex(r => r.some(c => /item|description/i.test(c)) && r.some(c => /total|cost|amount/i.test(c)));
    if (hi < 0) return [];
    const h = rows[hi].map(c => String(c).toLowerCase()), at = re => h.findIndex(c => re.test(c));
    const iItem = at(/item|description/), iQty = at(/qty|quantity/), iUnit = at(/unit|price|cost each/), iTotal = at(/total|amount/);
    const out = [];
    for (const r of rows.slice(hi + 1)) {
      const item = String(r[iItem] || '').trim();
      if (!item || /^total/i.test(item)) continue;
      const qty = parseFloat(r[iQty]) || 1, total = U.centavos(r[iTotal]), unit = U.centavos(r[iUnit]);
      const amount_c = !isNaN(total) ? total : Math.round(qty * (isNaN(unit) ? 0 : unit));
      if (amount_c > 0) out.push({ item, qty, unit_c: !isNaN(unit) ? unit : Math.round(amount_c / qty), amount_c });
    }
    return out;
  }

  return { FIELDS, guess, normPay, parseWhen, build, expenses, gradeSection };
})();
