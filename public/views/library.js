// Library: every page and document the teams have shipped, by division.
import { h } from '../lib/util.js';
import { rows, freshness, body, children, sun, colorOf } from '../lib/store.js';

export default {
  id: 'library', label: 'Library', order: 6,
  render(root, ctx) {
    const f = freshness('library');
    const all = rows('library');
    root.append(h('div.sechead', h('h2', 'Library'), h('span.src', f.sample ? 'Sample rows' : `${all.length} items · as of ${f.as_of}`)));
    const groups = [sun(), ...children(sun().id).filter(b => b.kind === 'division')];
    for (const g of groups) {
      const list = all.filter(r => r.body === g.id);
      if (!list.length) continue;
      root.append(h('div.kicker', { style: `color:${colorOf(g)}` }, g.name, h('small.muted', ` · ${list.length}`)));
      root.append(h('ul.lib', ...list.map(r => h('li', r.url ? h('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.title) : h('span', r.title), h('small', [r.kind, r.who, r.time].filter(Boolean).join(' · ')), r.tier && r.tier !== 'open' ? h('span.pill.t-crit', r.tier) : null))));
    }
    const orphan = all.filter(r => !body(r.body));
    if (orphan.length) root.append(h('div.kicker', 'Unfiled'), h('ul.lib', ...orphan.map(r => h('li', r.title))));
  },
};
