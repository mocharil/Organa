const zlib = require('node:zlib');

// ---- Minimal ZIP writer (stored entries, no compression) -------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  return table;
})();
function crc32(buffer) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buffer) >>> 0;
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  const stamp = new Date();
  const dosTime = ((stamp.getHours() << 11) | (stamp.getMinutes() << 5) | (stamp.getSeconds() >> 1)) & 0xffff;
  const dosDate = ((((stamp.getFullYear() - 1980) << 9) | ((stamp.getMonth() + 1) << 5) | stamp.getDate())) & 0xffff;
  for (const {name, data} of entries) {
    const nameBuf = Buffer.from(name, 'utf8'), body = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'), crc = crc32(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(body.length, 22); local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12); central.writeUInt16LE(dosDate, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20); central.writeUInt32LE(body.length, 24); central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

// ---- Markdown helpers --------------------------------------------------------------------------------
const xml = text => String(text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isTableRow = line => /^\s*\|.*\|\s*$/.test(line);
const isTableRule = line => /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-');
const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
const stripInline = text => String(text).replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,;:!?]|$)/g, '$1$2').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

function runs(text) {
  // **bold** and plain text only; everything else was flattened by the caller.
  const parts = [];
  let last = 0;
  for (const match of String(text).matchAll(/\*\*(.+?)\*\*/g)) {
    if (match.index > last) parts.push({text: text.slice(last, match.index)});
    parts.push({text: match[1], bold: true});
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({text: text.slice(last)});
  return parts.filter(part => part.text).map(part => `<w:r>${part.bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xml(stripInline(part.text))}</w:t></w:r>`).join('');
}
const paragraph = (text, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${runs(text)}</w:p>`;

function tableXml(rows) {
  const width = Math.max(...rows.map(row => row.length));
  const border = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(side => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="BFC7D9"/>`).join('');
  const body = rows.map((row, index) => `<w:tr>${Array.from({length: width}, (_, col) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr><w:p>${runs(index === 0 ? `**${row[col] ?? ''}**` : row[col] ?? '')}</w:p></w:tc>`).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${border}</w:tblBorders></w:tblPr>${body}</w:tbl><w:p/>`;
}

function markdownToDocx(markdown, title = 'Document') {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  const body = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (isTableRow(line)) {
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) { if (!isTableRule(lines[i])) rows.push(cells(lines[i])); i += 1; }
      i -= 1;
      if (rows.length) body.push(tableXml(rows));
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) { body.push(paragraph(heading[2], `Heading${heading[1].length}`)); continue; }
    if (/^\s*---+\s*$/.test(line)) continue;
    const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (bullet) { body.push(`<w:p><w:pPr><w:ind w:left="${360 + Math.min(bullet[1].length, 8) * 180}" w:hanging="260"/></w:pPr>${runs(`• ${bullet[2]}`)}</w:p>`); continue; }
    const numbered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
    if (numbered) { body.push(`<w:p><w:pPr><w:ind w:left="${360 + Math.min(numbered[1].length, 8) * 180}" w:hanging="300"/></w:pPr>${runs(`${numbered[2]}. ${numbered[3]}`)}</w:p>`); continue; }
    body.push(paragraph(line.replace(/^>\s?/, '')));
  }
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const heading = (id, name, size) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3A8A"/><w:sz w:val="${size}"/></w:rPr></w:style>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${heading('Heading1', 'heading 1', 40)}${heading('Heading2', 'heading 2', 30)}${heading('Heading3', 'heading 3', 25)}</w:styles>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(title)}</dc:title><dc:creator>Organa</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`;
  return zip([
    {name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'},
    {name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'},
    {name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'},
    {name: 'word/document.xml', data: document},
    {name: 'word/styles.xml', data: styles},
    {name: 'docProps/core.xml', data: core},
  ]);
}

// CSV: markdown tables become CSV tables; documents without tables become Section / Item rows so they still open cleanly in a spreadsheet.
// Cells that start with a formula character are prefixed with an apostrophe so spreadsheets show them as text.
const csvCell = value => {
  let text = stripInline(value ?? '').replace(/\s+/g, ' ').trim();
  if (/^[=+@]/.test(text) || /^-(?![\d.,\s]*%?$)/.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const csvLine = values => values.map(csvCell).join(',');

function markdownToCsv(markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  const flatItems = [];
  let section = '';
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (isTableRow(line)) {
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) { if (!isTableRule(lines[i])) rows.push(cells(lines[i])); i += 1; }
      i -= 1;
      if (out.length) out.push('');
      if (section) out.push(csvLine([section]));
      for (const row of rows) out.push(csvLine(row));
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) { section = stripInline(heading[1]); continue; }
    const item = line.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/);
    if (item) flatItems.push([section, item[1]]);
  }
  if (out.length) return `${out.join('\r\n')}\r\n`;
  return `${[csvLine(['Section', 'Item']), ...flatItems.map(row => csvLine(row))].join('\r\n')}\r\n`;
}

module.exports = {zip, crc32, markdownToDocx, markdownToCsv};
