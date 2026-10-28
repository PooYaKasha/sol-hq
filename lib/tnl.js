// TNL.ai search, read-only. Sol HQ asks TheNonprofitLab's public org_search view (the same one the TNL.ai search page reads)
// with its anon / publishable key. Nothing is written, and the key never reaches the browser.
//   TNL_SUPABASE_URL       TNL.ai's Supabase project URL
//   TNL_SUPABASE_ANON_KEY  its anon or publishable key (a service-role or secret key is refused)
//   TNL_APP_URL            optional: where TNL.ai runs, so results link to its profile page
'use strict';
const BASE = (process.env.TNL_SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.TNL_SUPABASE_ANON_KEY || '';
const APP = (process.env.TNL_APP_URL || '').replace(/\/+$/, '');

function keyRole(key) {
  if (key.startsWith('sb_publishable_')) return 'anon';
  try { return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role || null; } catch (e) { return null; }
}
const PROBLEM = !BASE && !KEY ? 'not set up' : !BASE || !KEY ? 'needs both TNL_SUPABASE_URL and TNL_SUPABASE_ANON_KEY' : keyRole(KEY) !== 'anon' ? 'TNL_SUPABASE_ANON_KEY is not an anon / publishable key, so Sol HQ will not use it' : '';
if (PROBLEM && (BASE || KEY)) console.error('TNL.ai search off: ' + PROBLEM);
const enabled = () => !PROBLEM;

// Words people use to say "search the nonprofits" are not search terms.
const SKIP = new Set('a an the and or of to in on for with is are what who which how find show list me my our any all about near that this top tnl tnl.ai nonprofit nonprofits charity charities organization organizations organisation organisations org orgs search look up lookup'.split(' '));
function terms(q) {
  const ein = (q.match(/\b\d{2}-?\d{7}\b/) || [''])[0].replace('-', '');
  const state = (q.match(/\b(?:in|,)\s*([A-Z]{2})\b/) || [])[1] || '';
  const words = (q.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 1 && !SKIP.has(w) && w !== state.toLowerCase() && !/^\d{9}$/.test(w)).slice(0, 4);
  return { ein, state, words };
}

async function rest(params, timeoutMs = 6000) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}/rest/v1/org_search?${new URLSearchParams(params)}`, { signal: ctl.signal, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'count=estimated', Accept: 'application/json' } });
    if (!r.ok) throw new Error(`TNL.ai answered ${r.status}`);
    const total = Number(((r.headers.get('content-range') || '').split('/')[1]) || 0);
    return { rows: await r.json(), total };
  } finally { clearTimeout(timer); }
}

async function search(q) {
  if (!enabled()) return { enabled: false, why: PROBLEM };
  const t = terms(String(q || '').slice(0, 200));
  if (!t.ein && !t.words.length) return { enabled: true, q, total: 0, rows: [], note: 'Name an organization, a cause or an EIN.' };
  const params = { select: 'id,legal_name,ein,ntee_title,city,state', order: 'legal_name', limit: '8' };
  if (t.ein) params.ein = `eq.${t.ein}`;
  if (t.state) params.state = `eq.${t.state}`;
  // every word in the name or the cause title; with no match, any of them (as the TNL.ai search page does)
  const per = t.words.map(w => `legal_name.ilike.*${w}*,ntee_title.ilike.*${w}*`);
  let loose = false, out;
  if (per.length) params.and = `(${per.map(x => `or(${x})`).join(',')})`;
  out = await rest(params);
  if (!out.total && per.length > 1) { delete params.and; params.or = `(${per.join(',')})`; loose = true; out = await rest(params); }
  return {
    enabled: true, q, total: out.total, loose, words: t.words,
    rows: out.rows.map(o => ({ name: o.legal_name, ein: o.ein, cause: o.ntee_title || '', city: o.city || '', state: o.state || '', url: APP ? `${APP}/org.html?id=${encodeURIComponent(o.id)}` : '' })),
  };
}

module.exports = { enabled, search, terms };
