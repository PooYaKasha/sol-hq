// HQ: the galaxy. Sol is the black hole, divisions are stars, a star opens its system, a planet shows its moons.
// The ask bar sits inside the map on wide screens. What to know and what to ask now open every thread (see app.js).
import { h, $ } from '../lib/util.js';
import { S, body, sun, ancestors, children } from '../lib/store.js';
import { mountOrbit, tooltipHtml } from '../lib/orbit.js';
import { kindOf, needsHuman } from '../lib/store.js';

const wide = matchMedia('(min-width:1100px)');
const HINTS = {
  galaxy: 'Click a star to open its system. Esc steps back one level.',
  system: 'Click a planet to see its moons, or the star to open its details. Esc steps back to the galaxy.',
  moons: 'Each moon is a detail or a next move: click one to open it, follow the link or ask Sol. Esc steps back.',
};

export default {
  id: 'hq', label: 'HQ', order: 0,
  render(root, ctx) {
    const focus = ctx.params.focus && body(ctx.params.focus) ? ctx.params.focus : sun().id;
    const form = $('#ask'), home = $('#ask-home');
    const inStage = wide.matches && form && home;
    const stage = h('div.stage' + (inStage ? '.has-bar' : ''));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'orbit'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Sol and the bodies in orbit');
    const crumbs = h('nav.crumbs', { 'aria-label': 'Orbit path' });
    const legend = h('div.legend');
    const tip = h('div.tip', { hidden: true });
    const hint = h('p.hint');
    if (inStage) { form.classList.add('in-stage'); stage.append(svg, form); } else stage.append(svg);
    stage.append(tip, crumbs, legend);
    root.append(stage, hint);

    const orbit = mountOrbit(svg, {
      focus,
      onZoom: id => ctx.go(`hq/${id}`),
      onLeaf: id => ctx.focusBody(id),
      onPick: (id, where) => { if (where === 'center' && id === sun().id) ctx.ask(); else ctx.openBody(id); },
      onMoon: m => {
        if (m.u) window.open(m.u, '_blank', 'noopener');
        else if (m.q) ctx.ask(m.q);
        else if (m.go && m.go.body) ctx.openBody(m.go.body);
        else if (m.go && m.go.view) ctx.go(m.go.view);
      },
      onHover: (b, e) => { if (!b) { tip.hidden = true; return; } tip.innerHTML = tooltipHtml(b); tip.hidden = false; const r = stage.getBoundingClientRect(); tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 230) + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px'; },
    });
    ctx.orbit = orbit;

    const f = body(orbit.focused);
    const up = f.orbits && f.orbits !== sun().id ? `hq/${f.orbits}` : 'hq';
    const chain = [...ancestors(f.id), f];
    chain.forEach((b, i) => {
      if (i) crumbs.append(h('span.sep', '›'));
      const name = b.kind === 'sun' ? 'Galaxy' : b.name;
      crumbs.append(i === chain.length - 1 ? h('b', name) : h('button.link', { onclick: () => ctx.go(b.kind === 'sun' ? 'hq' : `hq/${b.id}`) }, name));
    });
    if (chain.length > 1) crumbs.append(h('button.ghost.small', { onclick: () => ctx.go(up) }, `← ${up === 'hq' ? 'Galaxy' : body(f.orbits).name}`));
    hint.textContent = HINTS[orbit.mode];

    const kinds = S.reg.kinds.kinds;
    const present = new Set(children(orbit.focused).map(b => b.kind));
    legend.append(...Object.entries(kinds).filter(([k]) => present.has(k)).map(([k, v]) => h('span.lg', h('i', { class: `g-${v.glyph}` }), v.plural)));
    const n = needsHuman(orbit.focused);
    if (n) legend.append(h('span.lg', h('i.g-badge', n), 'waiting on a human'));

    if (inStage) {
      ctx.onCleanup(() => { form.classList.remove('in-stage'); home.append(form); });
    }
    wide.addEventListener('change', ctx.rerender, { once: true });
    ctx.onCleanup(() => { orbit.destroy(); wide.removeEventListener('change', ctx.rerender); });
  },
};
