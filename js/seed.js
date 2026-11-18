/* Starter catalog. The moderator can change all of this in Admin → Booths.
   Money is in centavos: 5000 = ₱50. */
CS.seed = (function () {
  const h = CS.util.hash;
  const booths = [
    { code: 'PHOTO',  name: 'Photobooth',      prefix: 'P', hint: 'Strips & prints',      color: '#FF8A7A', icon: 'camera',  active: true },
    { code: 'POETRY', name: 'Poetry Booth',    prefix: 'V', hint: 'Poems on request',     color: '#8CC8FF', icon: 'pen',     active: true },
    { code: 'DOODLE', name: 'Live Doodle',     prefix: 'D', hint: 'Drawn while you wait', color: '#FFE27A', icon: 'brush',   active: true },
    { code: 'STICK',  name: 'Stickers & Pins', prefix: 'S', hint: 'Grab and go',          color: '#C7A8FF', icon: 'sticker', active: true },
  ];
  const P = (sku, booth, name, type, price, cost, est_min = 0) =>
    ({ sku, booth, name, type, price_c: price * 100, cost_c: cost * 100, low_at: 10, est_min, active: true });
  const products = [
    P('PH-1S', 'PHOTO', '1 photo strip', 'service', 50, 12, 5),
    P('PH-2S', 'PHOTO', '2 photo strips', 'service', 90, 24, 5),
    P('PH-4R', 'PHOTO', 'Group 4R print', 'service', 80, 18, 7),
    P('PO-HK', 'POETRY', 'Haiku card', 'service', 20, 4, 5),
    P('PO-CP', 'POETRY', 'Custom poem', 'service', 40, 6, 12),
    P('PO-LL', 'POETRY', 'Love letter', 'service', 60, 10, 15),
    P('DO-MP', 'DOODLE', 'Mini portrait', 'service', 50, 8, 10),
    P('DO-CD', 'DOODLE', 'Couple doodle', 'service', 90, 12, 15),
    P('DO-PD', 'DOODLE', 'Pet doodle', 'service', 60, 8, 12),
    P('ST-1',  'STICK', 'Single sticker', 'good', 10, 3),
    P('ST-SH', 'STICK', 'Sticker sheet', 'good', 35, 12),
    P('PN-58', 'STICK', 'Pin 58mm', 'good', 35, 14),
    P('PN-3',  'STICK', 'Pin set of 3', 'good', 90, 42),
  ];
  const stock = [
    ['STK-PAPER', 'PHOTO', 'Photo paper', 'sheets', 20], ['STK-CARD', 'POETRY', 'Card stock', 'pcs', 10], ['STK-ENV', 'POETRY', 'Envelopes', 'pcs', 10],
    ['STK-ART', 'DOODLE', 'Art cards', 'pcs', 10], ['STK-STK1', 'STICK', 'Single stickers', 'pcs', 20], ['STK-SHEET', 'STICK', 'Sticker sheets', 'pcs', 10], ['STK-PIN', 'STICK', 'Pins 58mm', 'pcs', 10],
  ].map(([stock_id, booth, name, unit, low_at]) => ({ stock_id, booth, name, unit, low_at, active: true }));
  const USES = { 'PH-1S': [['STK-PAPER', 1]], 'PH-2S': [['STK-PAPER', 2]], 'PH-4R': [['STK-PAPER', 1]], 'PO-HK': [['STK-CARD', 1]], 'PO-CP': [['STK-CARD', 1], ['STK-ENV', 1]],
    'PO-LL': [['STK-CARD', 1], ['STK-ENV', 1]], 'DO-MP': [['STK-ART', 1]], 'DO-CD': [['STK-ART', 1]], 'DO-PD': [['STK-ART', 1]], 'ST-1': [['STK-STK1', 1]],
    'ST-SH': [['STK-SHEET', 1]], 'PN-58': [['STK-PIN', 1]], 'PN-3': [['STK-PIN', 3]] };
  products.forEach(p => { p.uses = (USES[p.sku] || []).map(([stock_id, qty]) => ({ stock_id, qty })); });
  // Starting PIN for every booth and the moderator: 1234. Change it in Admin → Booths.
  const staff = booths.map(b => ({ staff_id: b.code + '-L1', name: b.name + ' team', booth: b.code, role: 'lead', pin_hash: h('1234' + b.code), active: true }));
  staff.push({ staff_id: 'ADMIN-1', name: 'Moderator', booth: 'ADMIN', role: 'admin', pin_hash: h('1234ADMIN'), active: true });
  return { booths, products, staff, stock };
})();
