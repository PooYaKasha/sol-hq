// HQ: the solar system. Zoom into any body that has children; everything comes from the registry.
import { h, $, esc } from '../lib/util.js';
import { S, body, sun, ancestors, children, kindOf, statusOf, needsHuman } from '../lib/store.js';
import { mountOrbit, tooltipHtml } from '../lib/orbit.js';

export default {
  id: 'hq', label: 'HQ', order: 0,
  render(root, ctx) {
    const focus = ctx.params.focus && body(ctx.params.focus) ? ctx.params.focus : sun().id;
    const crumbs = h('nav.crumbs', { 'aria-label': 'Orbit path' });
    const legend = h('div.legend');
    const stage = h('div.stage');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'orbit'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Sol and the bodies in orbit');
    const tip = h('div.tip', { hidden: true });
    const hint = h('p.hint', 'Click a body with a halo to zoom in, any other to open it. Drag nothing: the orbit keeps turning.');
    stage.append(svg, tip, crumbs, legend);
    root.append(stage, hint);

    const orbit = mountOrbit(svg, {
      focus,
      onZoom: id => { ctx.go(`hq/${id}`); },
      onPick: (id, where) => { if (where === 'center' && id === sun().id) ctx.ask(); else ctx.openBody(id); },
      onHover: (b, e) => { if (!b) { tip.hidden = true; return; } tip.innerHTML = tooltipHtml(b); tip.hidden = false; const r = stage.getBoundingClientRect(); tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 220) + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px'; },
    });
    ctx.orbit = orbit;

    const paintCrumbs = () => {
      crumbs.innerHTML = '';
      const f = body(orbit.focused);
      const chain = [...ancestors(f.id), f];
      chain.forEach((b, i) => {
        if (i) crumbs.append(h('span.sep', '›'));
        crumbs.append(i === chain.length - 1 ? h('b', b.name) : h('button.link', { onclick: () => ctx.go(`hq/${b.id}`) }, b.name));
      });
      if (chain.length > 1) crumbs.append(h('button.ghost.small', { onclick: () => ctx.go('hq') }, 'Back to Sol'));
    };
    paintCrumbs();

    const kinds = S.reg.kinds.kinds;
    const present = new Set(children(orbit.focused).map(b => b.kind));
    legend.append(...Object.entries(kinds).filter(([k]) => present.has(k)).map(([k, v]) => h('span.lg', h('i', { class: `g-${v.glyph}` }), v.plural)));
    const n = needsHuman(orbit.focused);
    if (n) legend.append(h('span.lg', h('i.g-badge', n), 'waiting on a human'));

    ctx.onCleanup(() => orbit.destroy());
  },
};
