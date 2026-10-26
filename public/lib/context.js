// What to know and what to ask, from the activity in the data sets. Scoped to a body when one is zoomed.
import { S, rows, rowsFor, body, sun, freshness, children } from './store.js';
import { daysSince, fmtDate, trunc } from './util.js';
import { COLORS } from './moons.js';

const LABEL = { ops: 'Ops Board', deals: 'HubSpot deals', accounts: 'HubSpot accounts', drive: 'Team Drive' };
const src = set => { const f = freshness(set); return `${LABEL[set] || set} · ${f.sample ? 'sample' : fmtDate(f.as_of)}`; };
const list = (xs, n = 3) => xs.slice(0, n).join(', ') + (xs.length > n ? '…' : '');

export function ctxData(scope) {
  const id = scope && scope !== sun().id ? scope : null;
  const b = id && body(id);
  const get = set => id ? rowsFor(set, id) : rows(set);
  const ops = get('ops'), accts = get('accounts'), deals = get('deals'), drive = get('drive');
  const now = S.today;
  const need = ops.filter(r => r.status === 'Needs human');
  const blocked = ops.filter(r => r.status === 'Blocked');
  const cold = accts.filter(a => a.last_contact && daysSince(a.last_contact, now) >= 14);
  const noNext = accts.filter(a => a.hs_id && !a.next_activity);
  const matcher = deals.filter(d => d.stage === 'matcher');
  const legacy = deals.filter(d => d.terms === 'legacy');
  const quiet = drive.filter(r => !r.files || (r.last_filed && daysSince(r.last_filed, now) > 7));
  const next = accts.filter(a => a.next_activity).sort((x, y) => String(x.next_activity).localeCompare(y.next_activity));

  const know = [
    need.length && { t: `${need.length} item${need.length === 1 ? '' : 's'} wait on a person`, s: `${src('ops')} · ${list(need.map(r => trunc(r.title, 36)), 2)}`, c: COLORS.warn, go: { view: 'board' } },
    blocked.length && { t: `${blocked.length} blocked on the Board`, s: `${src('ops')} · ${list(blocked.map(r => r.id))}`, c: COLORS.crit, go: { view: 'board' } },
    matcher.length && { t: `${matcher.length} deal${matcher.length === 1 ? '' : 's'} wait on a matcher`, s: `${src('deals')} · the choke point · ${list(matcher.map(d => d.org))}`, c: COLORS.crit, go: { view: 'sales' } },
    cold.length && { t: `${cold.length} account${cold.length === 1 ? '' : 's'} not contacted in 14+ days`, s: `${src('accounts')} · ${list(cold.map(a => a.org))}`, c: COLORS.warn, go: { view: 'success' } },
    noNext.length && { t: `${noNext.length} account${noNext.length === 1 ? '' : 's'} with no next activity booked`, s: src('accounts'), c: COLORS.warn, go: { view: 'success' } },
    legacy.length && { t: `${legacy.length} deal${legacy.length === 1 ? '' : 's'} keep legacy 5% terms`, s: `${src('deals')} · honor them · ${list(legacy.map(d => d.org))}`, c: COLORS.blue, go: { view: 'sales' } },
    next.length && { t: `Next booked: ${list(next.map(a => `${a.org} ${fmtDate(a.next_activity)}`), 2)}`, s: src('accounts'), c: COLORS.teal, go: { view: 'success' } },
    quiet.length && { t: `${quiet.length} team folder${quiet.length === 1 ? '' : 's'} empty or quiet over 7 days`, s: `${src('drive')} · ${list(quiet.map(r => r.folder))}`, c: COLORS.muted, go: { view: 'drive' } },
  ].filter(Boolean).slice(0, 5);

  const ask = [];
  if (need.length) ask.push([b ? `What is waiting on a human in ${b.short || b.name}?` : 'What should I decide this week?', `${need.length} decision${need.length === 1 ? '' : 's'} waiting`]);
  if (cold.length) ask.push(['Follow up on the accounts we haven’t contacted in 14 days', `${cold.length} account${cold.length === 1 ? '' : 's'} gone quiet`]);
  if (matcher.length) ask.push(['Offer matcher sourcing to blocked deals', `${matcher.length} deal${matcher.length === 1 ? '' : 's'} stuck`]);
  if (legacy.length) ask.push(['What did we quote these deals?', `${legacy.length} legacy 5% deals`]);
  if (b) {
    for (const a of children(b.id).filter(x => x.kind === 'agent').slice(0, 2)) ask.push([`What is ${a.name} working on?`, a.role || 'agent']);
    for (const r of need.slice(0, 1)) ask.push([`What does ${r.title} need next?`, r.id]);
  } else {
    ask.push(['Check runway', 'cash and bridge'], ['What needs an invoice or refund this week?', 'billing']);
  }
  return { know, ask: ask.slice(0, 6), name: b ? (b.short || b.name) : null };
}
