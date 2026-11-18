/* Local cache + outbox. Every sale is saved here first; P2 sync sends the outbox. */
CS.store = (function () {
  const U = CS.util, P = 'cs.v1.';
  function get(k, d) { try { const v = localStorage.getItem(P + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function del(k) { try { localStorage.removeItem(P + k); } catch (e) { /* storage blocked */ } }
  function keys(prefix) {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(P + prefix)) out.push(k.slice(P.length)); }
    return out;
  }

  /* ---------- catalog: booths, products, staff ---------- */
  function catalog() {
    const c = get('catalog', null) || CS.seed;
    c.booths.forEach(b => { if (CS.ui && CS.ui.OLD[b.color]) b.color = CS.ui.OLD[b.color]; });
    if (!c.staff.some(s => s.booth === 'ADMIN')) c.staff = c.staff.concat(CS.seed.staff.filter(s => s.booth === 'ADMIN'));
    // Older setups: "lead" is now "manager", and everyone gets a starting username.
    c.staff.forEach(s => {
      if (!s.role || s.role === 'lead') s.role = 'manager';
      if (!s.username) s.username = s.booth === 'ADMIN' ? 'moderator' : s.booth.toLowerCase() + '-' + (s.role === 'cashier' ? 'cashier' : 'manager');
    });
    return c;
  }
  const saveCatalog = c => set('catalog', c);
  const booth = code => catalog().booths.find(b => b.code === code);
  const productName = sku => (catalog().products.find(p => p.sku === sku) || { name: sku }).name;

  /* ---------- events ---------- */
  const events = () => get('events', []);
  const saveEvents = list => set('events', list);
  const activeEvent = () => events().find(e => e.event_id === get('event.active', '')) || null;
  const setActiveEvent = id => set('event.active', id || '');
  function boothsForSale() {
    const all = catalog().booths.filter(b => b.active !== false), ev = activeEvent();
    return ev && ev.booths && ev.booths.length ? all.filter(b => ev.booths.includes(b.code)) : all;
  }

  /* ---------- sign in ---------- */
  const session = () => get('session', null);
  const deviceBooth = () => get('device.booth', null);
  const setDeviceBooth = b => b ? set('device.booth', b) : del('device.booth');
  /* ---------- people: username + own PIN. role = manager | cashier | admin ---------- */
  const uname = v => String(v || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 20);
  const staffList = (boothCode, c = catalog()) => c.staff.filter(s => s.active !== false && (!boothCode || s.booth === boothCode));
  const findUser = (u, c = catalog()) => c.staff.find(s => s.active !== false && s.username === uname(u)) || null;
  // New PINs are salted with the person's id; older ones (before usernames) used the booth code.
  const pinOk = (s, pin) => s.hash_v === 2 ? s.pin_hash === U.hash(pin + ':' + s.staff_id) : s.pin_hash === U.hash(pin + s.booth);
  function setStaffPin(s, pin) { s.pin_hash = U.hash(pin + ':' + s.staff_id); s.hash_v = 2; return s; }
  const isDefault = s => pinOk(s, '1234');
  const isDefaultPin = boothCode => staffList(boothCode).some(isDefault);

  function login(username, pin) {
    const s = CS.pin ? CS.pin.check(username, pin) : (u => u && pinOk(u, pin) ? u : null)(findUser(username));
    if (!s) return null;
    const sess = { staff_id: s.staff_id, name: s.name, username: s.username, role: s.role, booth: s.booth, ts: U.now() };
    set('session', sess); set('last.user', s.username);
    return sess;
  }
  const logout = () => del('session');

  /* ---------- sales ---------- */
  function nextTicketNo(boothCode) {
    const key = `ctr.${boothCode}.${U.today()}`, n = get(key, 0) + 1;
    set(key, n);
    const prefix = (booth(boothCode) || {}).prefix || boothCode[0];
    return `${prefix}-${String(n).padStart(3, '0')}`;
  }
  function push(rows) { const o = get('outbox', []); o.push(...rows); set('outbox', o); }
  const outboxCount = () => get('outbox', []).filter(r => r.tab === 'Sales').length;

  // lines: [{p: product, q: qty}], pay: {method, tendered, ref}
  function recordSale({ booth: boothCode, staff, lines, total, pay, customer }) {
    const ts = U.now(), sale_id = U.id(boothCode), ev = activeEvent();
    const sale = {
      sale_id, ts, event_id: ev ? ev.event_id : '', booth: boothCode, staff_id: staff.staff_id, customer_id: customer ? customer.customer_id : '',
      subtotal_c: total, discount_c: 0, total_c: total, pay: pay.method,
      gcash_ref: pay.method === 'gcash' ? pay.ref : '',
      tendered_c: pay.method === 'cash' ? pay.tendered : total,
      status: 'paid', void_reason: '',
    };
    const items = lines.map(l => ({ sale_id, sku: l.p.sku, name: l.p.name, qty: l.q, price_c: l.p.price_c, cost_c: l.p.cost_c }));
    const tickets = lines.filter(l => l.p.type === 'service').map(l => {
      const ticket_no = nextTicketNo(boothCode);
      return { ticket_no, code: U.code(ticket_no), sale_id, booth: boothCode, sku: l.p.sku, qty: l.q, status: 'queued', ts_created: ts, ts_ready: '', ts_claimed: '', note: '' };
    });
    const day = `sales.${boothCode}.${U.today()}`;
    const list = get(day, []);
    list.push({ ...sale, staff_name: staff.name || '', customer_name: customer ? CS.customer.label(customer) : '', items, tickets });
    const saved = set(day, list);
    push([{ tab: 'Sales', data: sale }, ...items.map(d => ({ tab: 'SaleItems', data: d })), ...tickets.map(d => ({ tab: 'Tickets', data: d }))]);
    if (CS.stock) CS.stock.forSale(lines, boothCode, sale_id);
    return { sale, items, tickets, saved };
  }
  const salesToday = boothCode => get(`sales.${boothCode}.${U.today()}`, []);
  const allSales = () => keys('sales.').flatMap(k => get(k, []));

  /* ---------- end-of-day cash count (a recount adds a new record; the latest one counts) ---------- */
  function recordCloseout(rec) {
    const ev = activeEvent();
    const c = { close_id: U.id(rec.booth), ts: U.now(), event_id: ev ? ev.event_id : '', ...rec, denoms: JSON.stringify(rec.denoms || {}) };
    const k = `close.${rec.booth}.${U.today()}`, list = get(k, []);
    list.push(c);
    const saved = set(k, list);
    push([{ tab: 'CloseOuts', data: c }]);
    return { close: c, saved };
  }
  const closeoutsToday = boothCode => get(`close.${boothCode}.${U.today()}`, []);
  const allCloseouts = () => keys('close.').flatMap(k => get(k, []));

  // Undo = mark void + log a reversing row. Nothing is deleted.
  function voidSale(saleId, boothCode, ts, reason, staff) {
    const k = `sales.${boothCode}.${U.dayOf(ts)}`, list = get(k, []), s = list.find(x => x.sale_id === saleId);
    if (!s || s.status === 'void') return false;
    s.status = 'void'; s.void_reason = reason;
    set(k, list);
    push([{ tab: 'Voids', data: { sale_id: saleId, ts: U.now(), booth: boothCode, reason, staff_id: staff.staff_id } }]);
    const cat = catalog().products;
    if (CS.stock) CS.stock.forSale(s.items.map(i => ({ p: cat.find(p => p.sku === i.sku), q: i.qty })).filter(l => l.p), boothCode, saleId, 1);
    return true;
  }

  /* ---------- PMS / booth-file uploads ---------- */
  const imports = () => get('imports', []);
  const saveImports = list => set('imports', list);

  /* ---------- setup file: moderator → booth phones ---------- */
  const exportSetup = () => ({ app: 'contactsheet', v: 1, ts: U.now(), catalog: catalog(), events: events(), active: get('event.active', ''), sync: get('sync.cfg', null) });
  function importSetup(o) {
    if (!o || o.app !== 'contactsheet' || !o.catalog || !Array.isArray(o.catalog.booths)) return false;
    saveCatalog(o.catalog); saveEvents(o.events || []); setActiveEvent(o.active || '');
    if (o.sync && o.sync.url) set('sync.cfg', o.sync);
    return true;
  }

  return {
    get, set, push, catalog, saveCatalog, booth, productName,
    events, saveEvents, activeEvent, setActiveEvent, boothsForSale,
    session, deviceBooth, setDeviceBooth, login, logout, uname, staffList, findUser, pinOk, setStaffPin, isDefault, isDefaultPin,
    recordSale, salesToday, allSales, voidSale, outboxCount, recordCloseout, closeoutsToday, allCloseouts,
    imports, saveImports, exportSetup, importSetup,
  };
})();
