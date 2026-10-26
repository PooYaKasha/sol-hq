// Exec summary: the money row, one card per division, projects around Sol, and the Toolbelt.
import { h, esc, plural } from '../lib/util.js';
import { S, rows, freshness, children, sun, body, kindOf, statusOf, colorOf, metric, needsHuman, canSee } from '../lib/store.js';

export default {
  id: 'exec', label: 'Exec summary', order: 1,
  render(root, ctx) {
    const pf = freshness('pulse');
    const tiles = rows('pulse');
    root.append(h('div.sechead', h('h2', 'Pulse'), h('span.src', pf.sample ? 'Sample numbers until the sync runs' : `As of ${pf.as_of} · ${pf.source}`)));
    root.append(h('div.pulse', ...tiles.map(t => h('div.tile' + (t.hero ? '.hero' : ''), h('div.lbl', t.label), h('div.val' + (t.tone ? `.t-${t.tone}` : ''), String(t.value)), h('div.sub', t.sub || ''), h('div.foot', h('span.src', (t.sample || pf.sample) ? 'sample' : (t.source || pf.source || '')), t.tone ? h('span.chip.t-' + t.tone, t.tone === 'good' ? 'On track' : t.tone === 'warn' ? 'Watch' : 'Behind') : null)))));

    const solId = sun().id;
    const divs = children(solId).filter(b => b.kind === 'division');
    root.append(h('div.sechead', h('h2', 'Divisions'), h('span.src', `${divs.length} in orbit`)));
    root.append(h('div.cards', ...divs.map(d => {
      const kids = children(d.id); const need = needsHuman(d.id);
      const counts = ['agent', 'human', 'workflow', 'product', 'project'].map(k => [k, kids.filter(c => c.kind === k).length]).filter(([, n]) => n);
      return h('article.card', { style: `--c:${colorOf(d)}` },
        h('header', h('span.swatch'), h('h3', h('button.link', { onclick: () => ctx.openBody(d.id) }, d.name)), need ? h('span.badge', need) : null),
        h('p.lead', `Lead: ${body(d.lead)?.name || ''}`),
        h('p', d.mission || ''),
        h('div.mrow', ...(d.metrics || []).slice(0, 2).map(m => { const v = metric(m.source); return h('div.mt', h('div.lbl', m.label), h('div.val', String(v.value ?? '')), h('div.src', v.sample ? 'sample' : `as of ${v.as_of}`)); })),
        h('p.counts', counts.map(([k, n]) => plural(n, S.reg.kinds.kinds[k].label.toLowerCase(), S.reg.kinds.kinds[k].plural.toLowerCase())).join(' · ')),
        h('div.actions', h('button.ghost.small', { onclick: () => ctx.go(`hq/${d.id}`) }, 'Zoom'), h('button.ghost.small', { onclick: () => ctx.openBody(d.id) }, 'Open')));
    })));

    const projects = children(solId).filter(b => b.kind === 'project');
    if (projects.length) {
      root.append(h('div.sechead', h('h2', 'Projects around Sol'), h('span.src', 'cross-division work with a date')));
      root.append(h('div.cards.small', ...projects.map(p => h('article.card', { style: `--c:${colorOf(p)}` }, h('header', h('span.swatch'), h('h3', h('button.link', { onclick: () => ctx.openBody(p.id) }, p.name)), h('span.pill.t-' + statusOf(p).tone, statusOf(p).label)), h('p', p.mission || ''), h('p.counts', [p.lead && `Lead: ${body(p.lead)?.name}`, p.due && `Due ${p.due}`].filter(Boolean).join(' · '))))));
    }

    const tools = S.reg.bodies.filter(b => b.kind === 'tool' && canSee(b));
    const groups = [...new Set(tools.map(t => t.group || 'Other'))];
    root.append(h('div.sechead', h('h2', 'Toolbelt'), h('span.src', 'the systems the company runs on')));
    for (const g of groups) root.append(h('div.kicker', g), h('div.tools', ...tools.filter(t => (t.group || 'Other') === g).map(t => h(t.url ? 'a.tool' : 'div.tool.ph', t.url ? { href: t.url, target: '_blank', rel: 'noopener' } : {}, h('b', t.name, t.money ? h('span.lock', { title: 'Moves money: founders only' }, ' $') : null), h('span', t.why || ''), h('small', [t.who, t.status !== 'live' && statusOf(t).label].filter(Boolean).join(' · '))))));
  },
};
