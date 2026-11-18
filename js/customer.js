/* Customers: name + grade/section, remembered across visits and booths.
   Typing protection: numbers/symbols are removed from names and every name is Title Case
   ("JUAN dela cRUZ jr" → "Juan Dela Cruz Jr."). Only name and section are kept (RA 10173: minimum data). */
CS.customer = (function () {
  const U = CS.util, S = CS.store;
  const LEVELS = [
    ['Grade school', [['K', 'Kinder'], ...[1, 2, 3, 4, 5, 6].map(n => [String(n), 'Grade ' + n])]],
    ['High school', [7, 8, 9, 10].map(n => [String(n), 'Grade ' + n])],
    ['Senior high', [['11', 'Grade 11'], ['12', 'Grade 12']]],
    ['College', ['1st', '2nd', '3rd', '4th', '5th'].map((y, i) => ['C' + (i + 1), `College ${y} year`])],
    ['Teacher / Staff', [['teacher', 'Teacher / Staff']]],
    ['Visitor', [['guest', 'Visitor / Parent']]],
  ];
  const GRADES = LEVELS.flatMap(l => l[1]);
  const levelOf = g => (LEVELS.find(l => l[1].some(x => x[0] === g)) || ['Other'])[0];
  // What the third box means for each kind of customer (always required).
  const sectionInfo = g => /^C\d$/.test(g) ? ['Course & section', 'e.g. BSIT 2A'] : g === 'teacher' ? ['Department or office', 'e.g. Science Dept.']
    : g === 'guest' ? ['School or group', 'e.g. Rizal High or parent of Juan'] : ['K', '1', '2', '3', '4', '5', '6'].includes(g) ? ['Section', 'e.g. Sampaguita'] : ['Section', 'e.g. Einstein or STEM A'];
  const SUFFIX = { jr: 'Jr.', sr: 'Sr.', ii: 'II', iii: 'III', iv: 'IV' };
  const ACRONYM = /^(stem|abm|humss|gas|tvl|ict|he|ia|ste|spa|spj|sps|spfl|smaw|css|eim|afa|ssc|sci|bs[a-z]{0,5}|ab[a-z]{0,4}|beed|bsed|bped|btvted|bat|it|cs|is|hrm|hm|tm|ce|ee|me|ece|cpe)$/i;
  const ROMAN = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i;

  /* ---------- auto-correct ---------- */
  const cap = w => w.toLowerCase().replace(/(^|[\s.'’-])(\p{L})/gu, (m, p, c) => p + c.toUpperCase());
  // While typing: drop numbers/symbols, squeeze spaces, Title Case. Works on any prefix the same way, so the cursor can be kept.
  const liveName = s => cap(String(s).replace(/[^\p{L} .'’-]/gu, '').replace(/ {2,}/g, ' ').replace(/\.{2,}/g, '.').replace(/^[ .]+/, ''));
  // On finish: also fix suffixes, "Ma." and initials, and trim.
  function name(s) {
    const words = liveName(s).replace(/^[ .'-]+|[ '-]+$/g, '').split(' ').filter(Boolean);
    return words.map((w, i) => {
      const k = w.toLowerCase().replace(/\.$/, '');
      if (i > 0 && SUFFIX[k]) return SUFFIX[k];
      if (k === 'ma' && i < words.length - 1) return 'Ma.';
      if (/^\p{L}$/u.test(k) && i > 0 && i < words.length - 1) return k.toUpperCase() + '.'; // middle initial
      return cap(w);
    }).join(' ');
  }
  const liveSection = s => String(s).replace(/[^\p{L}\d .'’-]/gu, '').replace(/ {2,}/g, ' ');
  function section(s) {
    return liveSection(s).trim().split(' ').filter(Boolean).map(w =>
      ACRONYM.test(w) || ROMAN.test(w) || /^\p{L}$/u.test(w) || /^\d+\p{L}{1,2}$/u.test(w) ? w.toUpperCase()
        : w.split('-').map(p => /^\d+\p{L}?$/u.test(p) || ACRONYM.test(p) || /^\p{L}$/u.test(p) ? p.toUpperCase() : cap(p)).join('-')).join(' ');
  }
  const isStudent = g => !!g && g !== 'teacher' && g !== 'guest';
  const gradeLabel = g => (GRADES.find(x => x[0] === g) || [g, g])[1];
  const short = g => g === 'K' ? 'Kinder' : /^\d+$/.test(g) ? 'Gr ' + g : /^C\d$/.test(g) ? 'College ' + g.slice(1) : g === 'teacher' ? 'Teacher' : g === 'guest' ? 'Visitor' : g;
  const details = c => !c || !c.grade ? '' : short(c.grade) + (c.section ? ' · ' + c.section : '');
  const label = c => !c ? '' : c.name + (c.grade ? ' · ' + details(c) : '');
  const matchKey = c => [c.name, c.grade, c.section].join('|').toLowerCase().replace(/[^a-z0-9|]/g, '');

  /* ---------- memory ---------- */
  const mine = () => S.get('customers', {});
  function all() { // this phone + everyone the Sheet knows, one entry per person
    const out = {}, seen = {};
    S.get('remote.customers', []).concat(Object.values(mine())).forEach(c => {
      const k = matchKey(c);
      if (seen[k] && seen[k] !== c.customer_id) { out[seen[k]].visits = (out[seen[k]].visits || 0) + (c.visits || 0); return; }
      seen[k] = c.customer_id; out[c.customer_id] = { ...out[c.customer_id], ...c };
    });
    return Object.values(out);
  }
  const byId = id => all().find(c => c.customer_id === id) || null;
  function suggest(q, limit = 5) {
    const t = name(q).toLowerCase();
    if (t.length < 2) return [];
    const words = t.split(' ');
    return all().filter(c => { const n = c.name.toLowerCase(); return words.every(w => n.split(' ').some(p => p.startsWith(w))); })
      .sort((a, b) => (b.last || '').localeCompare(a.last || '')).slice(0, limit);
  }
  // Save (or find) the customer for a sale. A new person is sent to the Sheet once; visits are counted from sales.
  function commit(c) {
    const clean = { name: name(c.name), grade: c.grade || '', section: section(c.section) };
    if (clean.name.replace(/[^\p{L}]/gu, '').length < 2) return null;
    const list = mine(), now = U.now();
    let rec = (c.customer_id && byId(c.customer_id)) || all().find(x => matchKey(x) === matchKey(clean));
    const isNew = !rec;
    rec = { ...(rec || { customer_id: 'C-' + U.today().slice(2).replace(/-/g, '') + '-' + U.rand(5), ts: now, visits: 0 }), ...clean, last: now };
    rec.visits = (list[rec.customer_id] ? list[rec.customer_id].visits : rec.visits || 0) + 1;
    list[rec.customer_id] = rec;
    S.set('customers', list);
    if (isNew) S.push([{ tab: 'Customers', data: { customer_id: rec.customer_id, ts: rec.ts, name: rec.name, grade: rec.grade, section: rec.section,
      type: isStudent(rec.grade) ? 'student' : rec.grade || 'guest', booth: (S.session() || {}).booth || '' } }]);
    return rec;
  }

  /* ---------- form at checkout ---------- */
  let form = null; // { c: {customer_id, name, grade, section}, done(c|null) }
  function open(current, done) {
    form = { c: { customer_id: '', name: '', grade: '', section: '', ...(current || {}) }, done };
    draw();
  }
  function draw() {
    const { icon, esc, head } = { icon: CS.ui.icon, esc: U.esc, head: CS.ui.head }, c = form.c;
    const si = sectionInfo(c.grade);
    CS.ui.openSheet(`${head('Who is buying?', 'Needed for every sale. BoothPay remembers them for next time.')}
      <div class="form" id="cuForm">
        <label class="field"><span>Name</span>
          <input class="input" id="cuName" value="${esc(c.name)}" placeholder="Juan Dela Cruz" autocomplete="off" autocapitalize="words" spellcheck="false" autofocus>
          <small id="cuHint" aria-live="polite"></small></label>
        <ul class="sugg" id="cuSug" aria-label="People seen before"></ul>
        <label class="field"><span>Grade or year</span>
          <select class="input" id="cuGrade"><option value="">Pick one…</option>${LEVELS.map(([lv, opts]) => `<optgroup label="${lv}">${opts.map(([v, l]) => `<option value="${v}" ${c.grade === v ? 'selected' : ''}>${l}</option>`).join('')}</optgroup>`).join('')}</select></label>
        <label class="field" id="cuSecWrap"><span id="cuSecLabel">${si[0]}</span>
          <input class="input" id="cuSection" value="${esc(c.section)}" placeholder="${si[1]}" autocomplete="off" spellcheck="false">
          <small id="cuSecHint"></small></label>
        <p class="err" id="cuErr" role="alert"></p>
        <div class="btn-grid"><button type="button" class="btn go" data-cu-save>${icon('check')} Use this customer</button>
          <button type="button" class="btn ghost" data-cu-skip>Cancel</button></div>
        <p class="sub">Only the name and grade/section are saved, for club records.</p>
      </div>`);
    hints(); sugg();
  }
  function hints() {
    const c = form.c, n = name(c.name), h = document.getElementById('cuHint');
    if (!h) return;
    h.textContent = Date.now() < (form.removedUntil || 0) ? 'Numbers and symbols are not allowed in names, so they were removed.'
      : n && n !== c.name.trim() ? `Will be saved as: ${n}`
      : n && n.split(' ').length === 1 ? 'Add the last name too, so people are not mixed up.' : '';
    const sh = document.getElementById('cuSecHint');
    if (sh) sh.textContent = c.section && section(c.section) !== c.section.trim() ? `Will be saved as: ${section(c.section)}` : '';
  }
  function sugg() {
    const ul = document.getElementById('cuSug'); if (!ul) return;
    const list = form.c.customer_id ? [] : suggest(form.c.name);
    ul.innerHTML = list.map(p => `<li><button type="button" data-cu-pick="${p.customer_id}">${CS.ui.icon('user')}<span><b>${U.esc(p.name)}</b><span class="sub">${U.esc(details(p) || 'No grade yet')} · seen before</span></span></button></li>`).join('');
  }
  // Rewrite the field as the user types, keeping the cursor where it was.
  function fix(el, fn) {
    const pos = el.selectionStart, v = el.value, nv = fn(v);
    if (nv === v) return v;
    const np = fn(v.slice(0, pos)).length;
    el.value = nv; el.setSelectionRange(np, np);
    return nv;
  }
  document.addEventListener('input', e => {
    if (!form || !e.target.closest('#cuForm')) return;
    const t = e.target;
    if (t.id === 'cuName') {
      const before = t.value;
      if (/[^\p{L} .'’-]/u.test(before)) { form.removedUntil = Date.now() + 3000; setTimeout(() => form && hints(), 3100); }
      form.c.name = fix(t, liveName); form.c.customer_id = '';
      hints(); sugg();
    } else if (t.id === 'cuSection') { form.c.section = fix(t, liveSection); hints(); }
  });
  document.addEventListener('focusout', e => { // tidy up when leaving a field ("jr" → "Jr.", "stem a" → "STEM A")
    if (!form || !e.target.closest('#cuForm')) return;
    if (e.target.id === 'cuName') { form.c.name = e.target.value = name(e.target.value); hints(); }
    if (e.target.id === 'cuSection') { form.c.section = e.target.value = section(e.target.value); hints(); }
  });
  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!form || !t || !t.closest('#cuForm')) return;
    const d = t.dataset, err = m => { document.getElementById('cuErr').textContent = m; };
    if (d.cuPick) {
      const p = byId(d.cuPick); if (!p) return;
      form.c = { customer_id: p.customer_id, name: p.name, grade: p.grade, section: p.section || '' };
      draw();
    } else if ('cuSkip' in d) { const f = form; form = null; f.done('cancel'); }
    else if ('cuSave' in d) {
      const c = form.c; c.name = name(c.name); c.section = section(c.section);
      if (c.name.replace(/[^\p{L}]/gu, '').length < 2) return err('Type the customer’s name.');
      if (!c.grade) return err('Pick the grade or year (or Teacher / Visitor).');
      if (!c.section) return err(`Type the ${sectionInfo(c.grade)[0].toLowerCase()}, so people with the same name are not mixed up.`);
      const f = form; form = null; f.done({ ...c });
    }
  });
  document.addEventListener('change', e => {
    if (!form || e.target.id !== 'cuGrade') return;
    form.c.grade = e.target.value;
    const si = sectionInfo(form.c.grade), inp = document.getElementById('cuSection');
    document.getElementById('cuSecLabel').textContent = si[0]; inp.placeholder = si[1];
    if (form.c.grade) inp.focus();
  });
  document.addEventListener('close', e => { if (e.target.id === 'sheet') form = null; }, true);

  return { GRADES, LEVELS, levelOf, name, liveName, section, liveSection, isStudent, gradeLabel, details, label, suggest, commit, byId, all, open };
})();
