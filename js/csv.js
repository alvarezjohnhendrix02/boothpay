/* CSV read/write + file download. Works from file:// (no server needed). */
CS.csv = (function () {
  const count = (s, ch) => s.split(ch).length - 1;

  // Handles quotes, "" escapes, CRLF, BOM, and comma / semicolon / tab files.
  function parse(text) {
    text = String(text).replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0];
    const d = [',', ';', '\t'].sort((a, b) => count(first, b) - count(first, a))[0];
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
      } else if (c === '"') q = true;
      else if (c === d) { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); rows.push(row); row = []; f = '';
      } else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim() !== ''));
  }

  const cell = v => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const write = rows => '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');

  function download(name, text, type = 'text/csv') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  const readFile = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });

  return { parse, write, download, readFile };
})();
