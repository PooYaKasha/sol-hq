// Customer Success: every account, when we last spoke, how long it has sat in its stage, what is booked next.
import { h, fmtDate, daysSince, trunc } from '../lib/util.js';
import { S, rows, freshness } from '../lib/store.js';

const rank = r => !r.next_activity && (r.days_in_stage ?? 0) > 60 ? 'P1' : !r.next_activity ? 'P2' : (r.days_in_stage ?? 0) > 60 ? 'P3' : 'P4';
const rtone = p => p === 'P1' ? 'crit' : p === 'P2' ? 'warn' : 'muted';

export default {
  id: 'success', label: 'Customers', order: 4,
  render(root, ctx) {
    const f = freshness('accounts');
    const all = rows('accounts').map(r => Object.assign({}, r, { days: r.days_in_stage ?? daysSince(r.stage_entered, S.today), p: rank(r) })).sort((a, b) => a.p.localeCompare(b.p) || (b.days ?? 0) - (a.days ?? 0));
    const noNext = all.filter(r => !r.next_activity).length;
    root.append(h('div.sechead', h('h2', 'Customer Success'), h('span.src', f.sample ? 'Sample accounts' : `As of ${f.as_of} · ${f.source}`)));
    root.append(h('div.stages', h('div.stage', h('div.val', String(all.length)), h('div.lbl', 'Accounts')), h('div.stage.choke', h('div.val', String(noNext)), h('div.lbl', 'No next activity booked'), h('div.sub', 'P1 when also over 60 days in stage')), h('div.stage', h('div.val', String(all.filter(r => (r.days ?? 0) > 60).length)), h('div.lbl', 'Over 60 days in stage')), h('div.stage', h('div.val', 'Not tracked'), h('div.lbl', 'Last login'), h('div.sub', 'comes from the platform, not HubSpot'))));
    const table = h('table.grid', h('thead', h('tr', h('th', 'Rank'), h('th', 'Organization'), h('th', 'Stage'), h('th', 'Last contact'), h('th', 'Days in stage'), h('th', 'Next activity'), h('th', 'Relationship'), h('th', 'Next step'), h('th', 'Owner'))), h('tbody',
      ...all.map(r => h('tr', h('td', h('span.pill.t-' + rtone(r.p), r.p)), h('td', h('b', r.org), r.hs_id ? h('a.hs', { href: `https://app.hubspot.com/contacts/8883555/record/0-3/${r.hs_id}`, target: '_blank', rel: 'noopener' }, ' ↗') : h('small.muted', ' · no HubSpot record')), h('td', r.stage || ''), h('td.mono', r.last_contact ? `${fmtDate(r.last_contact)} · ${daysSince(r.last_contact, S.today)} d` : '—'), h('td.mono', r.days != null ? `${r.days} d` : '—'), h('td', r.next_activity ? fmtDate(r.next_activity) : h('span.t-warn', 'none booked')), h('td', trunc(r.relationship || '', 60)), h('td', trunc(r.next || '', 90)), h('td', r.owner || '')))));
    root.append(h('div.tablewrap', table));
  },
};
