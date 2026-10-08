(() => {
  'use strict';
  const node = (tag, text, cls) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = String(text);
    if (cls) element.className = cls;
    return element;
  };

  // Render the supported document syntax with DOM nodes. Model output is never HTML.
  function inline(element, source) {
    const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\[([^\]\n]+)\]\(([^\s)]+)\))/g;
    let cursor = 0;
    for (const match of source.matchAll(pattern)) {
      element.append(document.createTextNode(source.slice(cursor, match.index)));
      const token = match[0];
      if (token.startsWith('`')) element.append(node('code', token.slice(1, -1)));
      else if (token.startsWith('**') || token.startsWith('__')) element.append(node('strong', token.slice(2, -2)));
      else {
        let url;
        try { url = new URL(match[3]); } catch {}
        if (url && ['https:', 'http:'].includes(url.protocol)) {
          const link = node('a', match[2]);
          link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
          element.append(link);
        } else element.append(document.createTextNode(match[2]));
      }
      cursor = match.index + token.length;
    }
    element.append(document.createTextNode(source.slice(cursor)));
  }

  function documentView(source, className = '') {
    const documentElement = node('div', undefined, `organa-document ${className}`.trim());
    const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
    let list, listKind, code, quoted;
    const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(value => value.trim());
    const append = block => { documentElement.append(block, document.createTextNode('\n')); };
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (/^\s*```/.test(line)) {
        list = quoted = null;
        if (code) code = null;
        else { const pre = node('pre'); code = node('code', ''); pre.append(code); append(pre); }
        continue;
      }
      if (code) { code.append(document.createTextNode(`${line}\n`)); continue; }
      if (!line.trim()) { list = quoted = null; continue; }
      if (line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] || '')) {
        list = quoted = null;
        const wrapper = node('div', undefined, 'organa-document-table');
        const table = node('table'), head = node('thead'), row = node('tr'), body = node('tbody');
        const headers = cells(line);
        headers.forEach(value => { const cell = node('th'); cell.scope = 'col'; inline(cell, value); row.append(cell); });
        head.append(row); table.append(head, body); index++;
        while (index + 1 < lines.length && lines[index + 1].includes('|') && lines[index + 1].trim()) {
          const values = cells(lines[++index]), dataRow = node('tr');
          headers.forEach((_, position) => { const cell = node('td'); inline(cell, values[position] || ''); dataRow.append(cell); });
          body.append(dataRow);
        }
        wrapper.append(table); append(wrapper); continue;
      }
      const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
      const item = line.match(/^\s*(?:([-*+])|\d+[.)])\s+(.+)$/);
      if (item) {
        quoted = null;
        const kind = item[1] ? 'ul' : 'ol';
        if (!list || kind !== listKind) { listKind = kind; list = node(kind); append(list); }
        const entry = node('li'); inline(entry, item[2]); list.append(entry); continue;
      }
      list = null;
      if (heading) { quoted = null; const title = node(`h${Math.min(6, heading[1].length + 2)}`); inline(title, heading[2]); append(title); }
      else if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { quoted = null; append(node('hr')); }
      else if (/^\s*>/.test(line)) {
        if (!quoted) { quoted = node('blockquote'); append(quoted); }
        const paragraph = node('p'); inline(paragraph, line.replace(/^\s*>\s?/, '')); quoted.append(paragraph);
      } else { quoted = null; const paragraph = node('p'); inline(paragraph, line); append(paragraph); }
    }
    return documentElement;
  }

  function emptyState(title, description, action) {
    const empty = node('div', undefined, 'mc-empty');
    const orbit = node('span', '◎', 'mc-empty-orbit'); orbit.setAttribute('aria-hidden', 'true');
    empty.append(orbit, node('strong', title), node('p', description));
    if (action) empty.append(action);
    return empty;
  }

  function collectionTools({name, records, root, selector, saved = {}, statuses = [], onChange}) {
    const toolbar = node('div', undefined, 'mc-collection-tools');
    toolbar.setAttribute('role', 'group'); toolbar.setAttribute('aria-label', `Filter ${name}`);
    const searchLabel = node('label', `Search ${name}`), search = node('input');
    search.type = 'search'; search.value = saved.query || ''; search.placeholder = `Find ${name}…`;
    search.setAttribute('aria-label', `Search ${name}`); searchLabel.append(search);
    const statusLabel = node('label', 'Status'), status = node('select');
    status.setAttribute('aria-label', `${name[0].toUpperCase() + name.slice(1)} status`);
    const all = node('option', 'All statuses'); all.value = 'all'; status.append(all);
    statuses.forEach(([value, label]) => { const option = node('option', label); option.value = value; status.append(option); });
    status.value = statuses.some(([value]) => value === saved.status) ? saved.status : 'all'; statusLabel.append(status);
    const count = node('span', '', 'mc-collection-count'); count.setAttribute('role', 'status');
    toolbar.append(searchLabel, statusLabel, count);
    const clear = node('button', 'Clear filters', 'mc-secondary'); clear.type = 'button';
    const empty = emptyState('No matching results', 'Try another keyword or clear the filters.', clear); empty.hidden = true;
    const apply = () => {
      const query = search.value.trim().toLowerCase();
      const matches = records.filter(record => (!query || JSON.stringify(record).toLowerCase().includes(query)) && (status.value === 'all' || record.status === status.value));
      const ids = new Set(matches.map(record => record.id));
      root.querySelectorAll(selector).forEach(element => { element.hidden = !ids.has(element.dataset.collectionId); });
      count.textContent = `${matches.length} of ${records.length}`; empty.hidden = matches.length > 0;
      onChange?.({query: search.value, status: status.value});
    };
    search.oninput = status.onchange = apply;
    clear.onclick = () => { search.value = ''; status.value = 'all'; apply(); search.focus(); };
    return {toolbar, empty, apply};
  }

  function loadingView(title) {
    const loading = node('div', undefined, 'mc-loading-view'); loading.setAttribute('role', 'status');
    const orbit = node('span', '◎', 'mc-loading-orbit'); orbit.setAttribute('aria-hidden', 'true');
    loading.append(orbit, node('strong', `Opening ${title}`), node('p', 'Bringing your team’s saved activity into view.'));
    return loading;
  }
  window.OrganaUI = Object.freeze({documentView, emptyState, collectionTools, loadingView});
})();
