// Team Drive: the 50_TEAMS folders, what each team filed and when, which went quiet. Read-only metadata.
import { h, fmtDate, daysSince, plural } from '../lib/util.js';
import { S, rows, set, freshness, body, colorOf } from '../lib/store.js';

const SUB = ['01_Deliverables', '02_Drafts', '03_Reports', '04_Assets', '05_Archive'];
const state = r => !r.files ? ['empty', 'crit'] : r.last_filed && daysSince(r.last_filed, S.today) > 7 ? ['quiet', 'warn'] : ['active', 'good'];

export default {
  id: 'drive', label: 'Team Drive', order: 5,
  render(root, ctx) {
    const f = freshness('drive'), d = set('drive') || { meta: {} };
    const all = rows('drive');
    const total = all.reduce((a, r) => a + (r.files || 0), 0);
    root.append(h('div.sechead', h('h2', 'Team Drive'), h('span.src', f.sample ? 'Sample folders' : `As of ${f.as_of} · ${f.source}`)));
    root.append(h('p.muted', 'Rule: every deliverable goes into its team folder the day it ships, named YYYY-MM-DD_Owner_Title_vN, with one _CHANGELOG line. ', d.meta && d.meta.root ? h('a', { href: d.meta.root, target: '_blank', rel: 'noopener' }, 'Open 00_BRAIN ↗') : null));
    root.append(h('div.stages', h('div.stage', h('div.val', String(all.length)), h('div.lbl', 'Team folders')), h('div.stage', h('div.val', String(total)), h('div.lbl', 'Files filed')), h('div.stage.choke', h('div.val', String(all.filter(r => !r.files).length)), h('div.lbl', 'Empty folders')), h('div.stage', h('div.val', String(all.filter(r => state(r)[0] === 'quiet').length)), h('div.lbl', 'Quiet over 7 days'))));
    root.append(h('div.cards', ...all.map(r => {
      const [s, tone] = state(r); const b = body(r.body);
      return h('article.card', { style: `--c:${b ? colorOf(b) : 'var(--ink-3)'}` },
        h('header', h('span.swatch'), h('h3', h('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.folder)), h('span.pill.t-' + tone, s)),
        h('p.counts', `${plural(r.files || 0, 'file')}${r.last_filed ? ` · last filed ${fmtDate(r.last_filed)}` : ''}${b ? ` · ${b.name}` : ''}`),
        h('div.subs', ...SUB.map(k => h('span.sub' + ((r.subfolders || {})[k] ? '' : '.zero'), `${k.slice(3).replace(/_/g, ' ')} ${(r.subfolders || {})[k] || 0}`))),
        (r.recent || []).length ? h('ul.recent', ...r.recent.slice(0, 4).map(x => h('li', x.name, h('small', x.when ? ` · ${fmtDate(x.when)}` : '')))) : null,
        r.notes ? h('p.muted', r.notes) : null);
    })));
  },
};
