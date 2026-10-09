const assert = require('node:assert/strict');
const test = require('node:test');
const zlib = require('node:zlib');
const {markdownToDocx, markdownToCsv, crc32} = require('../server/services/export-formats');

// Reads our own stored-entry zip back using only the central directory, verifying every CRC.
function readZip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'End of central directory present.');
  const count = buffer.readUInt16LE(end + 10);
  let pointer = buffer.readUInt32LE(end + 16);
  const files = {};
  for (let n = 0; n < count; n += 1) {
    assert.equal(buffer.readUInt32LE(pointer), 0x02014b50);
    const crc = buffer.readUInt32LE(pointer + 16), size = buffer.readUInt32LE(pointer + 24);
    const nameLength = buffer.readUInt16LE(pointer + 28), extraLength = buffer.readUInt16LE(pointer + 30), commentLength = buffer.readUInt16LE(pointer + 32);
    const offset = buffer.readUInt32LE(pointer + 42), name = buffer.toString('utf8', pointer + 46, pointer + 46 + nameLength);
    assert.equal(buffer.readUInt32LE(offset), 0x04034b50);
    const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
    const data = buffer.subarray(start, start + size);
    assert.equal(crc32(data), crc, `CRC matches for ${name}`);
    files[name] = data.toString('utf8');
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const sample = [
  '# Launch plan & budget <draft>', '',
  'Intro with **bold** text and a "quote".', '',
  '## Budget', '| Channel | Spend (IDR) |', '| --- | --- |', '| Instagram | 9,000,000 |', '| =HYPERLINK("x") | 1 |', '',
  '- First point', '  - Nested point', '1. Step one', '',
].join('\n');

test('DOCX is a valid package with headings, table, bullets and escaped text', () => {
  const files = readZip(markdownToDocx(sample, 'Launch plan'));
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels', 'docProps/core.xml']) assert.ok(name in files, `${name} exists`);
  const doc = files['word/document.xml'];
  assert.match(doc, /w:pStyle w:val="Heading1"/);
  assert.match(doc, /w:pStyle w:val="Heading2"/);
  assert.match(doc, /<w:tbl>/);
  assert.match(doc, /Instagram/);
  assert.match(doc, /&amp; budget &lt;draft&gt;/, 'Special characters are escaped.');
  assert.match(doc, /• First point/);
  assert.match(doc, /<w:b\/>/, 'Bold runs are kept.');
  assert.ok(!doc.includes('**'), 'Markdown markers are removed.');
  assert.ok(!/<w:t[^>]*>[^<]*<draft>/.test(doc));
});

test('DOCX copes with empty and unusual input', () => {
  assert.ok(Object.keys(readZip(markdownToDocx('', 'Empty'))).length >= 6);
  assert.match(readZip(markdownToDocx('plain\u0000 text \u0007 here', 'x'))['word/document.xml'], /plain text\s+here/);
});

test('CSV exports tables as rows and neutralises spreadsheet formulas', () => {
  const csv = markdownToCsv(sample);
  assert.match(csv, /^Budget\r\n/);
  assert.match(csv, /Channel,Spend \(IDR\)\r\n/);
  assert.match(csv, /Instagram,"9,000,000"|Instagram,9,000,000/);
  assert.match(csv, /'=HYPERLINK/, 'Formula-looking cells are prefixed so they stay text.');
  assert.ok(csv.endsWith('\r\n'));
});

test('CSV falls back to Section/Item rows when a document has no table', () => {
  const csv = markdownToCsv('# Plan\n\n## Risks\n- Budget overrun, again\n- Late supplier\n\n## Next\n1. Call "Rani"\n');
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], 'Section,Item');
  assert.equal(lines[1], 'Risks,"Budget overrun, again"');
  assert.equal(lines[2], 'Risks,Late supplier');
  assert.equal(lines[3], 'Next,"Call ""Rani"""');
});

test('CRC matches Node zlib for known data', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  if (typeof zlib.crc32 === 'function') assert.equal(crc32(Buffer.from('organa')), zlib.crc32(Buffer.from('organa')) >>> 0);
});
