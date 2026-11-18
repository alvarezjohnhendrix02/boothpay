/* Demo mode: a full sample event to try every feature. Lives in its own storage (cs.demo.*), never syncs.
   Open with ?demo or the "Try the demo" button; every demo PIN is 2468. */
CS.demo = (function () {
  const U = CS.util, S = CS.store, PIN = '2468', EV = 'EV-DEMO';
  if (!S.demo) return { on: false };

  let seed = 7; // same sample every time
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const day = U.today(), at = (h, m) => new Date(`${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+08:00`).toISOString();

  const PEOPLE = [ // [booth, name, username, role, also]
    ['PHOTO', 'Jasmine Marie Cruz', 'jasmine.photo', 'manager'], ['PHOTO', 'Adrielle Santos', 'adrielle.photo', 'cashier'], ['PHOTO', 'Paolo Reyes', 'paolo.photo', 'cashier', ['STICK']],
    ['POETRY', 'Bea Villanueva', 'bea.poetry', 'manager'], ['POETRY', 'Lance Mendoza', 'lance.poetry', 'cashier'],
    ['DOODLE', 'Kyla Ramos', 'kyla.doodle', 'manager'], ['DOODLE', 'Miguel Torres', 'miguel.doodle', 'cashier'],
    ['STICK', 'Andrea Lim', 'andrea.stick', 'manager'], ['STICK', 'Joshua Bautista', 'joshua.stick', 'cashier'],
  ];
  const BUYERS = [['Isha Navarro', '12', 'STA'], ['Nicolo Garcia', '7', 'OLHR'], ['Charlene Dizon', '9', 'St. John'], ['Zarina Flores', '8', 'St. Augustine'],
    ['Dominic Aquino', '9', 'St. Luke'], ['Winslet Tan', '11', 'St. Andrew'], ['Ezekiel Ramos', '9', 'St. Luke'], ['Hazel Mercado', '8', 'St. Dominic Savio'],
    ['Kenneth Uy', '10', 'St. Pedro Calungsod'], ['Myiesha Castro', '8', 'St. Augustine'], ['Ruvenna Ocampo', '10', 'St. Lorenzo Ruiz'], ['Jade Salazar', '12', 'FLC'],
    ['Ana Lopez', 'K', 'Sampaguita'], ['Carlos Medina', '4', 'Rizal'], ['Paula Gomez', 'teacher', 'Science Dept.'], ['Leana Cortez', 'C2', 'BSIT 2A'],
    ['Tita Lyn Pascual', 'guest', 'Parent of Ana'], ['Grazelle Yap', '11', 'St. Philip'], ['Aira Santiago', '12', 'St. Paul'], ['Joshua Lee', '7', 'OLCS']];

  function build() {
    S.wipe();
    // booths, items, stock (starter catalog) + the demo team
    const c = JSON.parse(JSON.stringify(CS.seed));
    c.staff = [{ staff_id: 'ADMIN-1', username: 'moderator', name: 'Ms. Demo Moderator', booth: 'ADMIN', role: 'admin', active: true }];
    PEOPLE.forEach(([booth, name, username, role, also], i) => c.staff.push({ staff_id: `${booth}-D${i}`, username, name, booth, role, also: also || [], active: true }));
    c.staff.forEach(s => S.setStaffPin(s, PIN));
    c.booths.find(b => b.code === 'PHOTO').prefix = 'PB';
    S.saveCatalog(c);
    S.saveEvents([{ event_id: EV, name: 'BoothPay Demo Fair', start: day, end: day, venue: 'School gym', booths: [], created: U.now() }]);
    S.setActiveEvent(EV);

    // stock: morning delivery (pins kept low on purpose), one jam
    const moves = [], mv = (booth, stock_id, qty, reason, ts, note = '', ref = '') => moves.push({ move_id: 'M-DEMO-' + moves.length, ts, booth, stock_id, name: (c.stock.find(x => x.stock_id === stock_id) || {}).name || '', qty, reason, ref_id: ref, staff_id: 'ADMIN-1', note });
    c.stock.forEach(s => mv(s.booth, s.stock_id, s.stock_id === 'STK-PIN' ? 24 : 60, 'restock', at(7, 30), 'Morning delivery'));
    mv('PHOTO', 'STK-PAPER', -2, 'waste', at(10, 5), 'Printer jam');

    // customers seen today
    const custs = {};
    BUYERS.forEach(([name, grade, section], i) => { const id = 'C-DEMO-' + i; custs[id] = { customer_id: id, ts: at(8, 0), name, grade, section, visits: 0, last: at(8, 0) }; });
    const custIds = Object.keys(custs), label = cu => `${cu.name} · ${cu.grade === 'K' ? 'Kinder' : /^\d+$/.test(cu.grade) ? 'Gr ' + cu.grade : /^C\d$/.test(cu.grade) ? 'College ' + cu.grade.slice(1) : cu.grade === 'teacher' ? 'Teacher' : 'Visitor'} · ${cu.section}`;

    // about 45 sales between 8:00 and 16:30
    const weights = ['PHOTO', 'PHOTO', 'PHOTO', 'POETRY', 'DOODLE', 'STICK', 'STICK'], byBooth = {}, ctr = {};
    for (let i = 0; i < 46; i++) {
      const booth = pick(weights), mins = 8 * 60 + Math.floor((i + rnd()) * (510 / 46)), ts = at(Math.floor(mins / 60), mins % 60);
      const prods = c.products.filter(p => p.booth === booth && p.active), lines = [pick(prods)];
      if (rnd() < 0.25) lines.push(pick(prods));
      const merged = {}; lines.forEach(p => { merged[p.sku] = (merged[p.sku] || 0) + (rnd() < 0.2 ? 2 : 1); });
      const team = c.staff.filter(s => s.booth === booth || (s.also || []).includes(booth)), staff = pick(team);
      const cu = custs[pick(custIds)]; cu.visits++; cu.last = ts;
      const sale_id = `${booth}-${day.slice(2).replace(/-/g, '')}-D${String(i).padStart(2, '0')}`;
      const items = Object.entries(merged).map(([sku, qty]) => { const p = c.products.find(x => x.sku === sku); return { sale_id, sku, name: p.name, qty, price_c: p.price_c, cost_c: p.cost_c }; });
      const total = items.reduce((a, x) => a + x.price_c * x.qty, 0), gcash = rnd() < 0.3;
      const tickets = items.filter(x => c.products.find(p => p.sku === x.sku).type === 'service').map(x => {
        ctr[booth] = (ctr[booth] || 0) + 1; const no = S.ticketFormat(c.booths.find(b => b.code === booth), ctr[booth]);
        return { ticket_no: no, code: U.code(no), sale_id, booth, sku: x.sku, qty: x.qty, status: 'queued', ts_created: ts, ts_ready: '', ts_claimed: '', note: '' };
      });
      const voided = i === 17 || i === 33;
      const sale = { sale_id, ts, event_id: EV, booth, staff_id: staff.staff_id, customer_id: cu.customer_id, subtotal_c: total, discount_c: 0, total_c: total,
        pay: gcash ? 'gcash' : 'cash', gcash_ref: gcash ? String(1000 + Math.floor(rnd() * 9000)) : '', tendered_c: total, status: voided ? 'void' : 'paid',
        void_reason: i === 17 ? 'Wrong item' : i === 33 ? 'Customer changed mind' : '', staff_name: staff.name, customer_name: label(cu), items, tickets };
      (byBooth[booth] = byBooth[booth] || []).push(sale);
      if (!voided) items.forEach(x => (c.products.find(p => p.sku === x.sku).uses || []).forEach(u => mv(booth, u.stock_id, -u.qty * x.qty, 'sale', ts, '', sale_id)));
    }
    Object.entries(byBooth).forEach(([b, list]) => S.set(`sales.${b}.${day}`, list));
    Object.entries(ctr).forEach(([b, n]) => S.set(`ctr.${b}.${day}`, n));
    S.set('moves', moves);
    S.set('customers', custs);

    // expenses (mix of booth and whole-club costs)
    S.set('expenses', [['PHOTO', 'printing', '4R photo paper', 3, 180], ['STICK', 'materials', 'Sticker paper', 10, 25], ['POETRY', 'materials', 'Card stock', 2, 120],
      ['', 'decor', 'Tarpaulin banner', 1, 350], ['', 'load', 'Load for the GCash phone', 1, 100], ['', 'food', 'Snacks for volunteers', 1, 250]].map(([booth, type, item, qty, unit], i) =>
      ({ exp_id: 'EXP-DEMO-' + i, ts: at(7, 45), ts_v: at(7, 45), date: day, event_id: EV, booth, type, item, qty, unit_c: unit * 100, amount_c: qty * unit * 100, paid_by: 'Ms. Demo Moderator', note: '', status: 'ok' })));

    // Photobooth cash count: ₱20 short
    const cash = (byBooth.PHOTO || []).filter(x => x.status === 'paid' && x.pay === 'cash').reduce((a, x) => a + x.total_c, 0);
    S.set(`close.PHOTO.${day}`, [{ close_id: 'PHOTO-DEMO-CLOSE', ts: at(16, 40), event_id: EV, booth: 'PHOTO', staff_id: 'PHOTO-D0', float_c: 50000, cash_sales_c: cash,
      expected_cash_c: 50000 + cash, counted_cash_c: 50000 + cash - 2000, variance_c: -2000, gcash_total_c: 0, denoms: '{}', note: 'Gave ₱20 change to Stickers booth' }]);

    S.set('setup.ts', U.now()); S.set('demo.built', day + ':2');
  }

  // A small PMS-style export (with one refund and a TOTAL line) to try Upload PMS.
  function pmsCSV() {
    const head = ['Ticket(s)', 'Date', 'Time', 'Customer', 'Grade & Section', 'Transaction Type', 'Base Price', 'Extras', 'Extras Amount', 'Total', 'Cash', 'Change', 'Status', 'Cashier'];
    const rows = [['#700101', day, '9:05 AM', 'Rina Cruz', '9-St. Luke', 'Regular Shoot', 100, '', 0, 100, 100, 0, 'Paid', 'Adrielle'],
      ['#700102, #700103', day, '9:40 AM', 'MARCO DY', '11 St Andrew', 'Regular Shoot', 100, 'Additional Shoot × 1', 100, 200, 500, 300, 'Paid', 'Paolo'],
      ['#700104', day, '10:15 AM', 'lea santos', '8- St. Augustine', 'Regular Shoot', 100, 'Additional Print × 2', 200, 300, 300, 0, 'Paid', 'Adrielle'],
      ['#700105', day, '11:00 AM', 'Ben Uy', '7 OLHR', 'Regular Shoot', 100, '', 0, 100, 100, 0, 'Refunded', 'Paolo'],
      ['#700106', day, '1:30 PM', 'Mia Tan', 'Teacher', 'Additional Print', 100, '', 0, 100, 100, 0, 'Paid', 'Jasmine'],
      ['TOTAL', '', '', '4 counted tickets', '', '', '', '', '', 700, '', '', '', '']];
    return CS.csv.write([head, ...rows]);
  }

  function banner() {
    const admin = /admin\.html$/.test(location.pathname), bar = document.createElement('div');
    bar.className = 'demo-bar';
    bar.innerHTML = `<span><b>Demo mode</b> · sample data, never synced · every PIN is <b class="mono">${PIN}</b></span>
      ${admin ? '<button class="btn sm ghost" data-demo-pms>Sample PMS file</button>' : ''}
      <button class="btn sm ghost" data-demo-reset>Reset demo</button><button class="btn sm primary" data-demo-exit>Exit demo</button>`;
    document.body.prepend(bar);
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-demo-reset],[data-demo-exit],[data-demo-pms]'); if (!t) return;
    if ('demoPms' in t.dataset) CS.csv.download('sample-pms-export.csv', pmsCSV());
    else if ('demoReset' in t.dataset) { if (confirm('Start the demo over with fresh sample data?')) { build(); location.replace('index.html'); } }
    else { try { sessionStorage.removeItem('boothpay.demo'); } catch (err) { /* blocked */ } location.replace('index.html'); }
  });

  if (S.get('demo.built', '') !== day + ':2') build(); // a fresh sample day each day
  if (document.body) banner(); else document.addEventListener('DOMContentLoaded', banner);
  return { on: true, PIN, build, pmsCSV };
})();
