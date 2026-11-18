/* Sync with the Google Sheet (gas/Code.gs).
   Phones: push the outbox, pull the moderator's setup. Moderator: push outbox + setup, pull every booth's sales.
   Runs every 20s and when the internet comes back; on errors waits longer (up to 5 min). */
CS.sync = (function () {
  const S = CS.store, U = CS.util;
  const EVERY = 20000, MAX = 300000, BATCH = 200;
  const st = { busy: false, err: '', delay: EVERY, timer: 0 };

  const cfg = () => S.get('sync.cfg', null);
  const configured = () => { const c = cfg(); return !!(c && c.url && c.key); };
  function setCfg(c) { S.set('sync.cfg', c && c.url ? { url: c.url.trim(), key: c.key.trim() } : null); st.err = ''; st.delay = EVERY; }
  function device() {
    let d = S.get('device.id', '');
    if (!d) { d = 'dev-' + U.rand(6); S.set('device.id', d); }
    return d;
  }
  const isAdmin = () => { const s = S.session(); return !!(s && s.role === 'admin'); };

  // Stable id per row so a retry never makes a duplicate in the Sheet.
  function rowKey(r) {
    const d = r.data || {};
    if (r.tab === 'SaleItems') return `SaleItems:${d.sale_id}:${d.sku}`;
    if (r.tab === 'Tickets') return `Tickets:${d.sale_id}:${d.ticket_no}`;
    return `${r.tab}:${d.sale_id || d.close_id || d.customer_id || d.ts}`;
  }

  async function call(op, extra) {
    const c = cfg();
    if (!c || !c.url) throw new Error('Not connected to a Google Sheet');
    if (!navigator.onLine) throw new Error('No internet');
    // text/plain avoids a CORS preflight, which Apps Script cannot answer.
    let res;
    try { res = await fetch(c.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ op, key: c.key, device: device(), ...extra }) }); }
    catch (e) { throw new Error('Could not reach the Sheet'); }
    let j;
    try { j = await res.json(); } catch (e) { throw new Error('The Sheet link did not answer. Check the web app URL.'); }
    if (!j.ok) throw new Error(j.why || 'The Sheet said no');
    return j;
  }

  // Tabs that need a newer Code.gs. Rows for them wait on the phone until the Sheet script is updated.
  const NEED = { CloseOuts: 2, Customers: 3 };
  const fits = r => (NEED[r.tab] || 1) <= S.get('sync.v', 0) || !NEED[r.tab];

  async function pushOutbox() {
    for (;;) {
      const box = S.get('outbox', []);
      const ready = box.filter(fits);
      st.oldSheet = false;
      if (!ready.length && box.length) {
        const p = await call('ping');
        if (p.v) S.set('sync.v', p.v);
        if (box.some(fits)) continue;
        st.oldSheet = true; return;
      }
      if (!ready.length) return;
      const batch = ready.slice(0, BATCH);
      const j = await call('append', { rows: batch.map(r => ({ tab: r.tab, key: rowKey(r), data: r.data })) });
      if (j.v) S.set('sync.v', j.v);
      const sent = new Set(batch.map(rowKey));
      S.set('outbox', S.get('outbox', []).filter(r => !sent.has(rowKey(r))));
    }
  }

  // Everyone the Sheet knows, so a name typed at one booth is suggested at all booths. Every 2 minutes is plenty.
  async function pullCustomers() {
    if (S.get('sync.v', 0) < 3 || Date.now() - S.get('cust.pulled', 0) < 120000) return;
    const j = await call('customers');
    S.set('remote.customers', j.customers || []); S.set('cust.pulled', Date.now());
  }

  // Booth/item/PIN/event setup. The setup file still works; this keeps phones current without it.
  const setupHash = () => U.hash(JSON.stringify([S.catalog(), S.events(), S.activeEvent() && S.activeEvent().event_id]));
  async function pushSetup() {
    const h = setupHash();
    if (h === S.get('setup.pushed', '')) return;
    const setup = { ...S.exportSetup(), ts: U.now() };
    delete setup.sync;
    await call('putSetup', { setup });
    S.set('setup.pushed', h); S.set('setup.ts', setup.ts);
  }
  async function pullSetup() {
    const j = await call('getSetup');
    if (!j.setup || !j.setup.ts || j.setup.ts <= S.get('setup.ts', '')) return false;
    S.importSetup(j.setup);
    S.set('setup.ts', j.setup.ts); S.set('setup.pushed', setupHash());
    return true;
  }
  async function pullSales() {
    const j = await call('sales');
    S.set('remote.sales', j.sales || []); S.set('remote.closeouts', j.closeouts || []); S.set('sync.pulled', j.ts || U.now());
    if (j.v) S.set('sync.v', j.v);
  }

  async function run() {
    if (st.busy || !configured()) { emit({}); return; }
    clearTimeout(st.timer);
    st.busy = true; emit({});
    let setupChanged = false, pulled = false;
    try {
      await pushOutbox();
      if (isAdmin()) {
        if (!S.get('setup.ts', '')) setupChanged = await pullSetup(); // fresh moderator device: start from the Sheet's copy
        await pushSetup();
        await pullSales(); pulled = true;
      } else setupChanged = await pullSetup();
      await pullCustomers();
      st.err = ''; st.delay = EVERY; S.set('sync.last', U.now());
    } catch (e) {
      st.err = e.message || String(e);
      st.delay = Math.min(st.delay * 2, MAX);
    } finally {
      st.busy = false;
      st.timer = setTimeout(run, st.delay);
      emit({ setupChanged, pulled });
    }
  }
  const emit = detail => document.dispatchEvent(new CustomEvent('cs-sync', { detail }));

  function status() {
    return { configured: configured(), oldSheet: !!st.oldSheet, busy: st.busy, err: st.err, unsent: S.outboxCount(), last: S.get('sync.last', ''), pulled: S.get('sync.pulled', '') };
  }

  // One line for the top bar, e.g. "Synced" or "3 waiting · No internet".
  function label() {
    const s = status();
    if (!s.configured) return { text: s.unsent ? `${s.unsent} saved on this phone` : 'Ready to sell', ok: !s.unsent };
    if (s.busy) return { text: 'Syncing…', ok: false };
    if (s.oldSheet && !s.err) return { text: 'Some records waiting · update Sheet', ok: false };
    if (s.err) return { text: s.unsent ? `${s.unsent} waiting · ${s.err === 'No internet' ? 'offline' : 'not sent'}` : 'Sheet not reached', ok: false };
    return { text: s.unsent ? `${s.unsent} waiting` : 'Synced', ok: !s.unsent };
  }

  async function test(c) {
    const old = cfg();
    S.set('sync.cfg', c);
    try { const j = await call('ping'); return { ok: true, sheet: j.sheet }; }
    catch (e) { return { ok: false, why: e.message }; }
    finally { S.set('sync.cfg', old); }
  }

  function start() {
    window.addEventListener('online', () => { st.delay = EVERY; run(); });
    run();
  }

  return { start, run, status, label, cfg, setCfg, configured, test, rowKey };
})();
