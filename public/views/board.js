// Ops Board and the decision queue: every row, what it waits on, who holds it.
import { h, fmtDate, daysSince } from '../lib/util.js';
import { S, rows, freshness, body, children, sun } from '../lib/store.js';

const ORDER = ['Needs human', 'Blocked', 'In progress', 'Not started', 'Done'];
const tone = s => s === 'Needs human' ? 'warn' : s === 'Blocked' ? 'crit' : s === 'Done' ? 'good' : 'muted';

export default {
  id: 'board', label: 'Board', order: 2,
  render(root, ctx) {
    const f = freshness('ops');
    const all = rows('ops');
    const filt = { body: 'all', status: 'open', q: '' };
    const head = h('div.sechead', h('h2', 'Ops Board'), h('span.src', f.sample ? 'Sample rows' : `As of ${f.as_of} · ${f.source}`));
    const need = all.filter(r => r.status === 'Needs human');
    const queue = h('section.queue', h('h3', `Decision queue · ${need.length} waiting on a human`), h('ul', ...need.map(r => h('li', h('b', r.id), ' ', r.title, h('small', ` · ${r.who || ''}${r.since ? ` · ${daysSince(r.since, S.today)} d` : ''}`)))));
    const bar = h('div.ixbar',
      h('input', { type: 'search', placeholder: 'Filter rows', 'aria-label': 'Filter rows', oninput: e => { filt.q = e.target.value.toLowerCase(); paint(); } }),
      h('select', { 'aria-label': 'Division', onchange: e => { filt.body = e.target.value; paint(); } }, h('option', { value: 'all' }, 'All divisions'), ...children(sun().id).filter(b => b.kind === 'division').map(d => h('option', { value: d.id }, d.name))),
      h('select', { 'aria-label': 'Status', onchange: e => { filt.status = e.target.value; paint(); } }, h('option', { value: 'open' }, 'Open'), h('option', { value: 'all' }, 'All'), ...ORDER.map(s => h('option', { value: s }, s))),
      h('span.note'));
    const table = h('table.grid', h('thead', h('tr', h('th', 'ID'), h('th', 'Workstream'), h('th', 'Status'), h('th', 'Who'), h('th', 'Division'), h('th', 'Updated'))), h('tbody'));
    root.append(head, queue, bar, h('div.tablewrap', table));
    const tb = table.querySelector('tbody'), note = bar.querySelector('.note');
    function paint() {
      const vis = all.filter(r => (filt.body === 'all' || r.body === filt.body) && (filt.status === 'all' || (filt.status === 'open' ? r.status !== 'Done' : r.status === filt.status)) && (!filt.q || `${r.id} ${r.title} ${r.who}`.toLowerCase().includes(filt.q)))
        .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.id.localeCompare(b.id));
      tb.innerHTML = '';
      for (const r of vis) tb.append(h('tr', h('td.mono', r.id), h('td', r.title), h('td', h('span.pill.t-' + tone(r.status), r.status)), h('td', r.who || ''), h('td', body(r.body) ? h('button.link', { onclick: () => ctx.openBody(r.body) }, body(r.body).short || body(r.body).name) : ''), h('td.mono', fmtDate(r.updated))));
      note.textContent = `${vis.length} of ${all.length}`;
    }
    paint();
  },
};
