// The daily digest Sol drafts for Google Chat: headline numbers, what needs a human, yesterday's hand-offs.
// It shows only what the space's role may see (GCHAT_DIGEST_ROLE, default "lead": open and studio rows;
// restricted finance rows never go to Chat unless the role is "founder"). A digest built from any sample
// data set is marked sample, so it can be previewed but never sent.
'use strict';

const TZ = 'America/New_York';
const DAY = 86400000;

// Today's date in Eastern time as YYYY-MM-DD, plus the hour, for the scheduler and the heading.
function eastern(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
const label = day => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const age = (since, day) => since ? Math.max(0, Math.round((Date.parse(day) - Date.parse(since)) / DAY)) : null;
const esc = s => String(s == null ? '' : s).replace(/[<>]/g, '');   // Chat reads <...> as links and mentions

// data: { get(set) } as lib/data.js; tasks: the hand-off list; kinds: registry kinds (for the role's tiers).
function build({ data, tasks = [], kinds = {}, role = 'lead', now = new Date(), hqUrl = '' }) {
  const { day } = eastern(now);
  const tiers = new Set(((kinds.roles || {})[role] || { tiers: ['open'] }).tiers);
  const seen = r => tiers.has(r.tier || 'open');
  const used = [];
  const take = set => { const d = data.get(set); if (d) used.push(d); return d; };
  const lines = [`*Sol daily digest · ${label(day)}*`];

  const pulse = take('pulse');
  const tiles = pulse ? pulse.rows.filter(seen).filter(r => r.value && r.value !== '—') : [];
  const order = ['match', 'cash', 'runway', 'pipe', 'need'];
  tiles.sort((a, b) => (order.indexOf(a.k) + 1 || 99) - (order.indexOf(b.k) + 1 || 99));
  if (tiles.length) {
    lines.push('', '*Numbers*');
    for (const r of tiles.slice(0, 5)) lines.push(`• ${esc(r.label)}: *${esc(r.value)}*${r.sub ? ` (${esc(r.sub)})` : ''}${r.source ? ` · ${esc(r.source)}` : ''}`);
  }

  const ops = take('ops');
  const rows = ops ? ops.rows.filter(seen) : [];
  const need = rows.filter(r => /needs human|blocked/i.test(r.status || '')).sort((a, b) => String(a.since || a.updated || '').localeCompare(String(b.since || b.updated || '')));
  lines.push('', need.length ? `*Needs a human (${need.length})*` : '*Needs a human:* nothing waiting');
  for (const r of need.slice(0, 8)) { const d = age(r.since || r.updated, day); lines.push(`• ${esc(r.id)} ${esc(r.title)} · ${esc(r.who || r.status)}${d != null ? ` · ${d} d` : ''}${/blocked/i.test(r.status) ? ' · blocked' : ''}`); }
  if (need.length > 8) lines.push(`• and ${need.length - 8} more in Sol HQ`);

  const since = Date.parse(day) - DAY;
  const fresh = tasks.filter(t => Date.parse(t.at) >= since);
  const handed = fresh.filter(t => t.kind !== 'hire').length, hires = fresh.filter(t => t.kind === 'hire').length;
  if (handed || hires) lines.push('', `*Handed off since yesterday:* ${handed} task${handed === 1 ? '' : 's'}${hires ? `, ${hires} hire draft${hires === 1 ? '' : 's'}` : ''}`);

  const sample = used.some(d => d.sample);
  const asOf = used.map(d => `${d.set} ${d.as_of || '?'}${d.sample ? ' (sample)' : ''}`).join(', ');
  lines.push('', `_As of ${asOf || 'no data'}. Drafted by Sol; ${role} view._`);
  if (hqUrl) lines.push(`<${hqUrl}|Open Sol HQ>`);
  if (sample) lines.unshift('_SAMPLE: preview only, built from sample data; it will not send._');
  return { text: lines.join('\n'), sample, day };
}

module.exports = { build, eastern };
