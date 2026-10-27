// The detail panel for any body: generic, built from the registry and from every data set that names it.
import { h, esc, fmtDate, usd, plural, trunc } from '../lib/util.js';
import { S, body, children, ancestors, kindOf, statusOf, colorOf, metric, rowsFor, freshness, set } from '../lib/store.js';
import { tasksSection } from '../lib/plan.js';

const pill = (text, tone = 'muted') => h(`span.pill.t-${tone}`, text);
const who = id => body(id) ? h('button.link', { onclick: () => openBody(id) }, body(id).name) : h('span', id);
let openBody = () => {};

export function renderBody(root, id, ctx) {
  openBody = ctx.openBody;
  const b = body(id);
  root.innerHTML = '';
  if (!b) { root.append(h('p.muted', 'That body is not in the registry.')); return; }
  const k = kindOf(b), st = statusOf(b);
  const head = h('header.bhead',
    h('span.swatch', { style: `background:${colorOf(b)}` }),
    h('div', h('div.kicker', [k.label, ...ancestors(b.id).map(a => a.name)].join(' · ')), h('h2', b.name), b.role ? h('p.role', b.role) : null));
  root.append(head);

  const facts = h('dl.facts');
  const add = (t, v) => { if (v == null || v === '' || (Array.isArray(v) && !v.length)) return; facts.append(h('dt', t), h('dd', v)); };
  add('Status', pill(st.label, st.tone));
  add('Orbits', b.orbits ? who(b.orbits) : null);
  add('Lead', b.lead ? who(b.lead) : null);
  add('Owner', b.owner ? who(b.owner) : null);
  add('Approver', (b.approver || []).length ? h('span', ...(b.approver || []).flatMap((a, i) => [i ? ', ' : null, who(a)])) : null);
  if (b.row) { add('Row', b.row.id); add('Owner → approver', b.row.who); add('Updated', fmtDate(b.row.updated)); add('Waiting since', b.row.since ? fmtDate(b.row.since) : null); }
  add('Wave', b.wave ? `Wave ${b.wave}` : null);
  add('Dates', [b.since && `since ${b.since}`, b.due && `due ${b.due}`].filter(Boolean).join(' · ') || null);
  add('Tier', b.tier && b.tier !== 'open' ? pill(b.tier, b.tier === 'restricted' ? 'crit' : 'warn') : null);
  add('Drive', b.drive ? h('a', { href: `https://drive.google.com/drive/folders/${b.drive.id}`, target: '_blank', rel: 'noopener' }, b.drive.folder) : null);
  if (b.url) add('Link', h('a', { href: b.url, target: '_blank', rel: 'noopener' }, b.url.replace(/^https?:\/\//, '').slice(0, 40)));
  root.append(facts);
  if (b.mission) root.append(h('p.mission', b.mission));
  if (b.why) root.append(h('p.mission', b.why, b.who ? h('span.muted', ` · ${b.who}`) : null));
  if (b.rules) root.append(h('ul.rules', ...b.rules.map(r => h('li', r))));

  if ((b.metrics || []).length) {
    const grid = h('div.mgrid');
    for (const m of b.metrics) { const v = metric(m.source); grid.append(h('div.mt', h('div.lbl', m.label), h('div.val' + (v.tone ? `.t-${v.tone}` : ''), String(v.value ?? '')), h('div.sub', v.sub || ''), v.sample ? h('div.src', 'sample') : h('div.src', `as of ${v.as_of || ''}`))); }
    root.append(h('h3', 'Numbers'), grid);
  }

  const kids = children(b.id);
  if (kids.length) {
    const groups = new Map();
    for (const c of kids) { const kk = kindOf(c).plural; if (!groups.has(kk)) groups.set(kk, []); groups.get(kk).push(c); }
    root.append(h('h3', 'In orbit'));
    for (const [name, list] of groups) root.append(h('div.kidgroup', h('div.kicker', name), h('div.chips', ...list.map(c => h('button.chip', { onclick: () => ctx.openBody(c.id) }, h('i.dot', { style: `background:${colorOf(c)}` }), c.name, h('small', statusOf(c).label))))));
    root.append(h('button.ghost.small', { onclick: () => ctx.go(`hq/${b.id}`) }, 'Zoom the orbit here'));
  }
  if (b.links) root.append(h('h3', 'Links'), h('ul.links', ...b.links.map(l => h('li', l.url ? h('a', { href: l.url, target: '_blank', rel: 'noopener' }, l.label) : h('span', l.label), l.note ? h('small', ` · ${l.note}`) : null))));

  const handed = tasksSection(b); if (handed) root.append(handed);
  // Rows from every data set that name this body or its descendants.
  const ops = rowsFor('ops', b.id).sort((x, y) => (y.status === 'Needs human') - (x.status === 'Needs human'));
  if (ops.length) root.append(section('Ops Board', 'ops', ops.slice(0, 12).map(r => h('li', pill(r.status, toneOf(r.status)), ' ', h('b', r.id), ' ', r.title, r.who ? h('small', ` · ${r.who}`) : null)), ops.length > 12 ? `${ops.length - 12} more on the Board tab` : null, () => ctx.go('board')));
  const deals = rowsFor('deals', b.id);
  if (deals.length && b.kind !== 'sun') root.append(section('Deals', 'deals', deals.slice(0, 10).map(r => h('li', h('b', r.org), ` · ${r.stage_name || r.stage}`, r.amount_verified != null ? ` · ${typeof r.amount_verified === 'number' ? usd(r.amount_verified) : r.amount_verified}` : '', r.next ? h('small', ` · ${trunc(r.next, 70)}`) : null)), deals.length > 10 ? `${deals.length - 10} more on the Sales tab` : null, () => ctx.go('sales')));
  const accts = rowsFor('accounts', b.id);
  if (accts.length && b.kind !== 'sun') root.append(section('Accounts', 'accounts', accts.slice(0, 10).map(r => h('li', h('b', r.org), ` · ${r.stage || ''}`, r.last_contact ? ` · last contact ${fmtDate(r.last_contact)}` : '', !r.next_activity ? h('small.t-warn', ' · no next activity') : null)), null, () => ctx.go('success')));
  const lib = rowsFor('library', b.id);
  if (lib.length) root.append(section('Library', 'library', lib.slice(0, 8).map(r => h('li', r.url ? h('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.title) : r.title, h('small', ` · ${[r.kind, r.who, r.time].filter(Boolean).join(' · ')}`))), lib.length > 8 ? `${lib.length - 8} more in the Library` : null, () => ctx.go('library')));
  const drive = rowsFor('drive', b.id, false);
  if (drive.length) root.append(section('Team Drive', 'drive', drive.map(r => h('li', h('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.folder), ` · ${plural(r.files ?? 0, 'file')}`, r.last_filed ? ` · last filed ${fmtDate(r.last_filed)}` : h('small.t-warn', ' · empty'))), null, () => ctx.go('drive')));
}

function section(title, setName, items, more, go) {
  const f = freshness(setName);
  return h('section.rows', h('h3', title, h('small.src', f.sample ? ' sample' : ` as of ${f.as_of}`)), h('ul', ...items), more ? h('p.muted', more) : null, h('button.ghost.small', { onclick: go }, `Open ${title}`));
}
const toneOf = s => s === 'Needs human' ? 'warn' : s === 'Blocked' ? 'crit' : s === 'Done' ? 'good' : 'muted';
