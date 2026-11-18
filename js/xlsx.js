/* Read Excel .xlsx files in the browser with no libraries: an .xlsx is a zip of XML files.
   Uses the built-in DecompressionStream to unzip. Returns [{name, rows: [[cell text, …], …]}]; dates stay Excel serial numbers. */
CS.xlsx = (function () {
  async function inflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // Zip central directory → a getter that returns one file's text.
  function unzip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf), td = new TextDecoder();
    let end = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
    if (end < 0) throw new Error('not a zip');
    const files = {}, count = dv.getUint16(end + 10, true);
    let p = dv.getUint32(end + 16, true);
    for (let k = 0; k < count && dv.getUint32(p, true) === 0x02014b50; k++) {
      const nameLen = dv.getUint16(p + 28, true), extra = dv.getUint16(p + 30, true), comment = dv.getUint16(p + 32, true);
      files[td.decode(u8.subarray(p + 46, p + 46 + nameLen))] = { method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) };
      p += 46 + nameLen + extra + comment;
    }
    return async name => {
      const f = files[name]; if (!f) return null;
      const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
      const data = u8.subarray(start, start + f.size);
      return td.decode(f.method === 0 ? data : await inflate(data));
    };
  }

  const parse = s => new DOMParser().parseFromString(s || '<x/>', 'application/xml');
  const tags = (node, name) => Array.from(node.getElementsByTagName(name));
  const col = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

  async function read(file) {
    if (typeof DecompressionStream === 'undefined') throw new Error('old browser');
    const get = unzip(await file.arrayBuffer());
    const strings = tags(parse(await get('xl/sharedStrings.xml')), 'si').map(si => tags(si, 't').map(t => t.textContent).join(''));
    const wb = parse(await get('xl/workbook.xml')), rels = parse(await get('xl/_rels/workbook.xml.rels'));
    const target = {};
    tags(rels, 'Relationship').forEach(r => { target[r.getAttribute('Id')] = r.getAttribute('Target'); });
    const sheets = [];
    for (const sh of tags(wb, 'sheet')) {
      let t = target[sh.getAttribute('r:id')]; if (!t) continue;
      t = t.replace(/^\//, ''); if (!t.startsWith('xl/')) t = 'xl/' + t;
      const rows = tags(parse(await get(t)), 'row').map(r => {
        const out = [];
        tags(r, 'c').forEach((c, i) => {
          const ref = c.getAttribute('r'), at = ref ? col(ref) : i, type = c.getAttribute('t'), v = tags(c, 'v')[0];
          out[at] = type === 's' ? strings[+(v && v.textContent)] || '' : type === 'inlineStr' ? tags(c, 't').map(x => x.textContent).join('') : v ? v.textContent : '';
        });
        return Array.from(out, x => (x == null ? '' : String(x)));
      }).filter(r => r.some(x => x.trim() !== ''));
      sheets.push({ name: sh.getAttribute('name'), rows });
    }
    return sheets;
  }

  return { read };
})();
