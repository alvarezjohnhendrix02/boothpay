/**
 * ContactSheet ↔ Google Sheet bridge (Apps Script web app).
 * Setup steps: docs/SYNC_SETUP.md
 *
 * 1. Change SYNC_KEY below to your own secret words (no spaces needed, at least 8 characters).
 * 2. Deploy → New deployment → Web app · Execute as: Me · Who has access: Anyone.
 * 3. Paste the web app URL and the same key in ContactSheet → Moderator → Sync & phones.
 */
const SYNC_KEY = 'CHANGE-ME';
const VERSION = 4; // 2 = cash counts (CloseOuts) · 3 = customers (Customers) · 4 = stock (Moves) + expenses (Expenses)

// Columns per tab. Writes are append-only; a row whose _key already exists is skipped.
const TABS = {
  Sales: ['sale_id', 'ts', 'event_id', 'booth', 'staff_id', 'customer_id', 'subtotal_c', 'discount_c', 'total_c', 'total_php', 'pay', 'gcash_ref', 'tendered_c', 'status', 'void_reason'],
  SaleItems: ['sale_id', 'sku', 'name', 'qty', 'price_c', 'cost_c'],
  Tickets: ['ticket_no', 'code', 'sale_id', 'booth', 'sku', 'qty', 'status', 'ts_created'],
  Voids: ['sale_id', 'ts', 'booth', 'reason', 'staff_id'],
  Moves: ['move_id', 'ts', 'booth', 'stock_id', 'name', 'qty', 'reason', 'ref_id', 'staff_id', 'note'],
  Expenses: ['exp_id', 'ts', 'ts_v', 'date', 'event_id', 'booth', 'type', 'item', 'qty', 'unit_c', 'amount_c', 'amount_php', 'paid_by', 'note', 'status'],
  Customers: ['customer_id', 'ts', 'name', 'grade', 'section', 'type', 'booth'],
  CloseOuts: ['close_id', 'ts', 'event_id', 'booth', 'staff_id', 'float_c', 'cash_sales_c', 'expected_cash_c', 'counted_cash_c', 'variance_c', 'variance_php', 'gcash_total_c', 'denoms', 'note'],
};
const DATE_FIELDS = { ts: 1, ts_created: 1, ts_v: 1 };
const META = ['_key', '_device', '_received'];

function doGet() { return out({ ok: true, app: 'contactsheet' }); }

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, why: 'Bad request' }); }
  if (!SYNC_KEY || SYNC_KEY === 'CHANGE-ME' || SYNC_KEY.length < 8) return out({ ok: false, why: 'Set your own SYNC_KEY in Code.gs (8+ characters), then deploy again.' });
  if (body.key !== SYNC_KEY) return out({ ok: false, why: 'Wrong sync key' });
  try {
    switch (body.op) {
      case 'ping': return out({ ok: true, sheet: SpreadsheetApp.getActive().getName() });
      case 'append': return out(append(body.rows || [], String(body.device || '')));
      case 'getSetup': return out(getSetup());
      case 'putSetup': return out(putSetup(body.setup));
      case 'sales': return out(sales());
      case 'customers': return out(customers());
      case 'stock': return out({ ok: true, moves: moves(body.booth) });
      default: return out({ ok: false, why: 'Unknown op' });
    }
  } catch (err) {
    return out({ ok: false, why: String(err && err.message || err) });
  }
}

function out(o) { o.v = VERSION; return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function tab(name, headers) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sh;
}

// Keep text as text: refs like "0482" or "=..." must not turn into numbers/formulas.
function cell(h, v) {
  if (v == null) return '';
  if (DATE_FIELDS[h] && v) { const d = new Date(v); return isNaN(d) ? String(v) : d; }
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  const s = String(v);
  return /^[=+\-@\d.]/.test(s) ? "'" + s : s;
}

function append(rows, device) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const byTab = {}, now = new Date();
    let added = 0, skipped = 0;
    rows.forEach(r => { if (r && TABS[r.tab] && r.key && r.data) (byTab[r.tab] = byTab[r.tab] || []).push(r); else skipped++; });
    Object.keys(byTab).forEach(name => {
      const cols = TABS[name], sh = tab(name, META.concat(cols)), last = sh.getLastRow();
      const keys = new Set(last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(v => String(v[0])) : []);
      const values = [];
      byTab[name].forEach(r => {
        const k = String(r.key);
        if (keys.has(k)) { skipped++; return; }
        keys.add(k);
        const d = Object.assign({}, r.data);
        if (name === 'Sales') d.total_php = (Number(d.total_c) || 0) / 100;
        if (name === 'Expenses') d.amount_php = (Number(d.amount_c) || 0) / 100;
        if (name === 'CloseOuts') d.variance_php = (Number(d.variance_c) || 0) / 100;
        values.push([k, device, now].concat(cols.map(h => cell(h, d[h]))));
      });
      if (values.length) { sh.getRange(last + 1, 1, values.length, values[0].length).setValues(values); added += values.length; }
    });
    return { ok: true, added, skipped };
  } finally {
    lock.releaseLock();
  }
}

/* Setup = booths, items, PINs (hashed), events. One JSON string, split over cells (50k char limit). */
function putSetup(setup) {
  if (!setup || !setup.catalog) return { ok: false, why: 'No setup' };
  const sh = tab('Setup', ['updated', 'json (do not edit)']), json = JSON.stringify(setup), parts = [];
  for (let i = 0; i < json.length; i += 40000) parts.push([json.slice(i, i + 40000)]);
  sh.getRange(2, 1, Math.max(sh.getLastRow(), 2), 2).clearContent();
  sh.getRange(2, 1).setValue(setup.ts || new Date().toISOString());
  sh.getRange(2, 2, parts.length, 1).setValues(parts);
  return { ok: true };
}

function getSetup() {
  const sh = SpreadsheetApp.getActive().getSheetByName('Setup');
  if (!sh || sh.getLastRow() < 2) return { ok: true, setup: null };
  const json = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().map(r => r[0]).join('');
  return { ok: true, setup: json ? JSON.parse(json) : null };
}

function moves(booth) {
  return read('Moves').filter(m => !booth || String(m.booth) === String(booth)).map(m => ({ move_id: String(m.move_id), ts: m.ts, booth: String(m.booth),
    stock_id: String(m.stock_id), name: String(m.name || ''), qty: Number(m.qty) || 0, reason: String(m.reason || ''), ref_id: String(m.ref_id || ''), note: String(m.note || '') }));
}

// Each change to an expense is a new row; the newest row of each expense is the current one (a delete has status "void").
function expenses() {
  const latest = {};
  read('Expenses').forEach(x => {
    const e = { exp_id: String(x.exp_id), ts: x.ts, ts_v: x.ts_v || x.ts, date: String(x.date || ''), event_id: String(x.event_id || ''), booth: String(x.booth || ''),
      type: String(x.type || 'other'), item: String(x.item || ''), qty: Number(x.qty) || 0, unit_c: Number(x.unit_c) || 0, amount_c: Number(x.amount_c) || 0,
      paid_by: String(x.paid_by || ''), note: String(x.note || ''), status: String(x.status || 'ok') };
    if (!latest[e.exp_id] || e.ts_v >= latest[e.exp_id].ts_v) latest[e.exp_id] = e;
  });
  return Object.values(latest);
}

function customers() {
  const list = read('Customers').map(c => ({ customer_id: String(c.customer_id), ts: c.ts, name: String(c.name || ''), grade: String(c.grade || ''), section: String(c.section || '') }));
  return { ok: true, customers: list };
}

function read(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getDataRange().getValues(), h = v[0];
  return v.slice(1).map(r => {
    const o = {};
    h.forEach((k, i) => { const x = r[i]; o[k] = x instanceof Date ? x.toISOString() : x; });
    return o;
  });
}

// All sales with their items; voided sales come back with status "void".
function sales() {
  const voids = {};
  read('Voids').forEach(v => { voids[v.sale_id] = v.reason || 'void'; });
  const items = {};
  read('SaleItems').forEach(i => { (items[i.sale_id] = items[i.sale_id] || []).push({ sku: String(i.sku), name: String(i.name), qty: Number(i.qty) || 1, price_c: Number(i.price_c) || 0 }); });
  const list = read('Sales').map(s => ({
    sale_id: String(s.sale_id), ts: s.ts, event_id: String(s.event_id || ''), booth: String(s.booth), total_c: Number(s.total_c) || 0,
    customer_id: String(s.customer_id || ''), pay: String(s.pay || ''), gcash_ref: String(s.gcash_ref || ''), status: voids[s.sale_id] ? 'void' : String(s.status || 'paid'),
    void_reason: voids[s.sale_id] || '', items: items[s.sale_id] || [], device: String(s._device || ''),
  }));
  const closeouts = read('CloseOuts').map(c => ({
    close_id: String(c.close_id), ts: c.ts, event_id: String(c.event_id || ''), booth: String(c.booth), staff_id: String(c.staff_id || ''),
    float_c: Number(c.float_c) || 0, cash_sales_c: Number(c.cash_sales_c) || 0, expected_cash_c: Number(c.expected_cash_c) || 0,
    counted_cash_c: Number(c.counted_cash_c) || 0, variance_c: Number(c.variance_c) || 0, gcash_total_c: Number(c.gcash_total_c) || 0, note: String(c.note || ''),
  }));
  return { ok: true, sales: list, closeouts, moves: moves(), expenses: expenses(), ts: new Date().toISOString() };
}
