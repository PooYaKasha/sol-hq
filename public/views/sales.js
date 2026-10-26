// Sales funnel: every deal by stage, with the terms quoted and the verified amount next to HubSpot's.
import { h, usd, trunc } from '../lib/util.js';
import { rows, set, freshness, body } from '../lib/store.js';

const amt = r => r.amount_verified != null && r.amount_verified !== '' ? (typeof r.amount_verified === 'number' ? usd(r.amount_verified) : r.amount_verified) : (r.amount_hubspot != null ? usd(r.amount_hubspot) + ' (HubSpot)' : '');
const termPill = r => r.terms === 'legacy' ? h('span.pill.t-warn', { title: r.terms_quoted || '' }, 'Legacy 5% · honor') : r.terms === 'plan' ? h('span.pill.t-good', { title: r.terms_quoted || '' }, 'Plan') : r.terms === 'image' ? h('span.pill.t-muted', { title: r.terms_quoted || '' }, 'Only as images') : h('span.pill.t-muted', 'Not quoted');
const hs = r => r.hs_id ? h('a', { href: `https://app.hubspot.com/contacts/8883555/record/0-3/${r.hs_id}`, target: '_blank', rel: 'noopener', title: 'Open in HubSpot' }, '↗') : h('span.muted', { title: 'No HubSpot record' }, '·');

export default {
  id: 'sales', label: 'Sales funnel', order: 3,
  render(root, ctx) {
    const f = freshness('deals'), d = set('deals') || { meta: {} };
    const stages = (d.meta && d.meta.stages) || [];
    const all = rows('deals');
    root.append(h('div.sechead', h('h2', 'Sales funnel'), h('span.src', f.sample ? 'Sample deals' : `As of ${f.as_of} · ${f.source}`)));
    root.append(h('div.stages', ...stages.map(s => { const list = all.filter(r => r.stage === s.k); return h('div.stage' + (s.choke ? '.choke' : '') + (s.won ? '.won' : ''), h('div.val', String(list.length)), h('div.lbl', s.name), h('div.sub', s.about || ''), s.choke ? h('div.src.t-crit', 'the choke point: match money') : null); })));
    const table = h('table.grid', h('thead', h('tr', h('th', 'Organization'), h('th', 'Stage'), h('th', 'Owner'), h('th', 'Terms quoted'), h('th', 'Amount'), h('th', 'Next step'), h('th', ''))), h('tbody',
      ...stages.flatMap(s => all.filter(r => r.stage === s.k).map(r => h('tr' + (r.blocked ? '.blocked' : ''), h('td', h('b', r.org), r.note ? h('small.muted', ` · ${r.note}`) : null), h('td', s.name), h('td', r.owner || ''), h('td', termPill(r)), h('td.mono', amt(r)), h('td', trunc(r.next || '', 110)), h('td', hs(r)))))));
    root.append(h('div.tablewrap', table));
    const legacy = all.filter(r => r.terms === 'legacy').length, blocked = all.filter(r => r.blocked).length;
    root.append(h('p.muted', `${all.length} deals · ${blocked} waiting on a matcher · ${legacy} legacy 5% deals to honor. Amounts: verified from Stripe or the quoted cap where known, else HubSpot's entry.`));
  },
};
