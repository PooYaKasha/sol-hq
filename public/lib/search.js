// Search across the registry and every loaded data set. Grouped, ranked, no dependencies.
import { S, rows, canSee, bodyLine, body } from './store.js';

let index = null;
const norm = s => String(s ?? '').toLowerCase();

export function buildIndex() {
  const out = [];
  for (const b of S.reg.bodies) if (canSee(b)) out.push({ group: 'bodies', id: b.id, title: b.name, sub: bodyLine(b), text: norm(`${b.name} ${b.short || ''} ${b.role || ''} ${b.mission || ''} ${b.kind}`), go: { body: b.id } });
  const add = (set, view, title, sub, extra) => out.push({ group: set, title, sub, text: norm(`${title} ${sub} ${extra || ''}`), go: { view } });
  for (const r of rows('deals')) add('deals', 'sales', r.org, `${r.stage_name || r.stage} · ${r.owner || ''}`, r.next);
  for (const r of rows('accounts')) add('accounts', 'success', r.org, `${r.stage || ''} · ${r.relationship || ''}`, r.next);
  for (const r of rows('ops')) add('ops', 'board', `${r.id} ${r.title}`, `${r.status} · ${r.who || ''}`, body(r.body)?.name);
  for (const r of rows('library')) add('library', 'library', r.title, `${r.kind || ''} · ${r.who || ''}`, body(r.body)?.name);
  for (const r of rows('drive')) add('drive', 'drive', r.folder, `${r.files ?? 0} files · ${body(r.body)?.name || ''}`, (r.recent || []).map(f => f.name).join(' '));
  index = out;
  return out;
}
export const invalidate = () => { index = null; };

export function search(q, limit = 24) {
  if (!index) buildIndex();
  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored = [];
  for (const it of index) {
    let score = 0;
    for (const t of terms) {
      const i = it.text.indexOf(t);
      if (i < 0) { score = -1; break; }
      score += norm(it.title).startsWith(t) ? 6 : norm(it.title).includes(t) ? 4 : 1;
    }
    if (score >= 0) scored.push({ it, score: score + (it.group === 'bodies' ? 2 : 0) });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map(s => s.it);
}

export const GROUPS = { bodies: 'In orbit', deals: 'Deals', accounts: 'Accounts', ops: 'Ops Board', library: 'Library', drive: 'Team Drive' };
