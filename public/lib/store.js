// One store: the registry (every body), the data sets, the viewer's role, and the derivations views share.
// Views never read JSON themselves; they ask the store.
import { daysSince } from './util.js';

export const S = {
  reg: null,          // { kinds, bodies, routes, generated }
  byId: new Map(),
  kids: new Map(),    // parent id -> [bodies]
  data: {},           // set name -> { set, as_of, sample, source, meta, rows }
  sets: [],           // freshness list from /api/data
  role: 'founder',
  config: window.SOL_CONFIG || {},
  today: new Date(),
};

const getJson = async u => { const r = await fetch(u, { credentials: 'same-origin' }); if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); };

export async function loadAll() {
  const [reg, list] = await Promise.all([getJson('/api/registry'), getJson('/api/data')]);
  S.reg = reg;
  S.byId = new Map(reg.bodies.map(b => [b.id, b]));
  S.kids = new Map();
  for (const b of reg.bodies) if (b.orbits) { if (!S.kids.has(b.orbits)) S.kids.set(b.orbits, []); S.kids.get(b.orbits).push(b); }
  S.sets = list.sets;
  const loaded = await Promise.all(list.sets.map(s => getJson(`/api/data/${s.set}`).catch(() => null)));
  for (const d of loaded) if (d) S.data[d.set] = d;
  try { S.role = localStorage.getItem('sol.role') || 'founder'; } catch (e) {}
  return S;
}

export const body = id => S.byId.get(id) || null;
export const sun = () => S.reg.bodies.find(b => b.kind === 'sun');
export const kindOf = b => S.reg.kinds.kinds[b.kind] || {};
export const statusOf = b => S.reg.kinds.statuses[b.status] || { label: b.status || '', tone: 'muted' };
export const children = id => (S.kids.get(id) || []).filter(canSee);
export const ancestors = id => { const out = []; let cur = body(id); while (cur && cur.orbits) { cur = body(cur.orbits); if (cur) out.unshift(cur); } return out; };
export const descendants = id => { const out = []; const walk = p => { for (const c of S.kids.get(p) || []) { out.push(c); walk(c.id); } }; walk(id); return out; };
export const isUnder = (id, root) => id === root || ancestors(id).some(a => a.id === root);
export const division = b => { let cur = b; while (cur && cur.kind !== 'division' && cur.orbits) cur = body(cur.orbits); return cur && cur.kind === 'division' ? cur : null; };
export const colorOf = b => b.color || (b.orbits && body(b.orbits) ? colorOf(body(b.orbits)) : '') || 'var(--ink-3)';
export const ringOf = b => b.ring ?? (S.reg.kinds.rings[b.orbits === sun().id ? 'sol' : 'other'][b.kind] ?? 2);

// Roles and tiers. A body is visible when its tier is in the role's tiers; investors also need the investor tag.
export function canSee(b) {
  if (!b) return false;
  const role = S.reg.kinds.roles[S.role] || S.reg.kinds.roles.founder;
  if (!role.tiers.includes(b.tier || 'open')) return false;
  if (role.tag && !(b.tags || []).includes(role.tag) && b.kind !== 'sun' && b.kind !== 'division') return false;
  return true;
}
export function canSeeRow(row) {
  const role = S.reg.kinds.roles[S.role] || S.reg.kinds.roles.founder;
  if (row.tier && !role.tiers.includes(String(row.tier).toLowerCase())) return false;
  if (row.body && body(row.body) && !canSee(body(row.body))) return false;
  return true;
}
export function setRole(r) { S.role = r; try { localStorage.setItem('sol.role', r); } catch (e) {} }

// Data access with the viewer's role applied.
export const set = name => S.data[name] || null;
export const rows = name => ((S.data[name] || {}).rows || []).filter(canSeeRow);
export const freshness = name => { const d = S.data[name]; return d ? { as_of: d.as_of, sample: d.sample, source: d.source || '', origin: d.origin } : { as_of: null, sample: true, source: 'not loaded' }; };

// Rows that belong to a body: any row whose body, agent or owner is this body or one of its descendants.
export function rowsFor(name, id, deep = true) {
  const ids = new Set([id, ...(deep ? descendants(id).map(d => d.id) : [])]);
  return rows(name).filter(r => ids.has(r.body) || ids.has(r.agent) || ids.has(r.owner) || (r.bodies || []).some(x => ids.has(x)));
}
export const needsHuman = id => rowsFor('ops', id).filter(r => r.status === 'Needs human').length;

// Metric sources named in registry bodies ("pulse.cash", "deals.waiting_on_matcher") resolve here.
const DERIVED = {
  'deals.waiting_on_matcher': () => ({ value: rows('deals').filter(r => r.stage === 'matcher').length, sub: 'deals' }),
  'deals.legacy': () => ({ value: rows('deals').filter(r => r.terms === 'legacy').length, sub: 'honor' }),
  'accounts.no_next': () => ({ value: rows('accounts').filter(r => !r.next_activity).length, sub: 'accounts' }),
  'ops.needs_human': () => ({ value: rows('ops').filter(r => r.status === 'Needs human').length, sub: 'waiting' }),
  'ops.oldest_days': () => { const d = rows('ops').filter(r => r.status === 'Needs human' && r.since).map(r => daysSince(r.since, S.today)); return { value: d.length ? Math.max(...d) + ' d' : '0 d', sub: 'oldest' }; },
  'ops.stale': () => ({ value: rows('ops').filter(r => r.updated && daysSince(r.updated, S.today) > 7 && !/Done/.test(r.status)).length, sub: 'rows > 7 d' }),
  'tracker.open': () => ({ value: rows('tracker').filter(r => !/Complete/.test(r.status || '')).length, sub: 'items' }),
};
export function metric(src) {
  if (!src) return { value: '', sub: '', sample: true };
  const [setName, key] = src.split('.');
  if (DERIVED[src]) { const d = S.data[setName]; return Object.assign({ sample: !d || d.sample, as_of: d && d.as_of }, DERIVED[src]()); }
  const d = S.data[setName];
  const tile = d && (d.rows || []).find(r => r.k === key);
  if (!tile) return { value: 'n/a', sub: 'no source yet', sample: true };
  return { value: tile.value, sub: tile.sub || '', tone: tile.tone, sample: d.sample || !!tile.sample, as_of: d.as_of, source: tile.source };
}

// Compact facts for search and answer cards.
export const bodyLine = b => [kindOf(b).label, b.role || b.mission || '', statusOf(b).label].filter(Boolean).join(' · ');
