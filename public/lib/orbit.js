// The orbit engine. Any body can sit at the center; its children spread over rings by kind.
// Nothing here knows about divisions or agents in particular: a hire, a project or a new kind
// gets a glyph from kinds.json and a ring from the registry, and shows up.
import { S, body, children, kindOf, statusOf, colorOf, ringOf, needsHuman, sun } from './store.js';
import { esc } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 1200, H = 640, CX = 600, CY = 320;
const RX = [140, 265, 385, 495];
const EY = 0.52;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

const el = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const k in a) if (a[k] != null) e.setAttribute(k, a[k]); return e; };
const clover = () => { const p = el('path', { d: S.cloverPath || '', fill: '#fff' }); return p; };

export function mountOrbit(svg, opts) {
  const state = { focus: opts.focus || sun().id, items: [], t0: performance.now(), paused: false, trace: [], raf: 0 };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '';
  const gStars = el('g', { class: 'stars' }), gRings = el('g', { class: 'rings' }), gTrace = el('g', { class: 'trace' }), gBodies = el('g', { class: 'bodies' }), gCenter = el('g', { class: 'center' });
  svg.append(gStars, gRings, gTrace, gBodies, gCenter);
  stars(gStars);

  function build() {
    gRings.innerHTML = ''; gBodies.innerHTML = ''; gCenter.innerHTML = ''; gTrace.innerHTML = '';
    const f = body(state.focus) || sun();
    const kids = children(f.id).filter(b => b.kind !== 'tool' || b.orbits);
    const rings = new Map();
    for (const b of kids) { const r = Math.min(ringOf(b), RX.length - 1); if (!rings.has(r)) rings.set(r, []); rings.get(r).push(b); }
    state.items = [];
    const used = [...rings.keys()].sort();
    used.forEach((r, i) => {
      const rx = RX[Math.min(i, RX.length - 1)] * (used.length === 1 ? 1.5 : 1), ry = rx * EY;
      gRings.append(el('ellipse', { cx: CX, cy: CY, rx, ry, class: 'ring' }));
      const list = rings.get(r);
      list.forEach((b, j) => {
        const a0 = (b.angle ?? (360 / list.length) * j + (i * 37)) * Math.PI / 180;
        const g = glyph(b, f);
        gBodies.append(g.node);
        state.items.push({ b, rx, ry, a0, speed: (reduce ? 0 : (1 / (160 + i * 110))) * (i % 2 ? -1 : 1), node: g.node, label: g.label });
      });
    });
    center(f);
    step(performance.now(), true);
  }

  function center(f) {
    const g = el('g', { class: 'sun', tabindex: 0, role: 'button', 'aria-label': `${f.name}: open` });
    if (f.kind === 'sun') {
      g.append(el('circle', { cx: CX, cy: CY, r: 84, class: 'sun-halo' }));
      g.append(el('circle', { cx: CX, cy: CY, r: 64, class: 'sun-core' }));
      const m = el('g', { transform: `translate(${CX - 22} ${CY - 34}) scale(0.0229)` }); m.append(clover()); g.append(m);
      const t = el('text', { x: CX, y: CY + 26, class: 'sun-name', 'text-anchor': 'middle' }); t.textContent = f.name; g.append(t);
      const s = el('text', { x: CX, y: CY + 46, class: 'sun-sub', 'text-anchor': 'middle' }); s.textContent = 'Click to ask'; g.append(s);
    } else {
      const c = colorOf(f);
      g.append(el('circle', { cx: CX, cy: CY, r: 58, fill: c, class: 'planet-core big' }));
      if (f.icon) { const ic = el('g', { transform: `translate(${CX - 20} ${CY - 20}) scale(2.5)` }); ic.append(el('path', { d: f.icon, fill: 'none', stroke: '#fff', 'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })); g.append(ic); }
      else if (f.initials || f.kind === 'human') { const t = el('text', { x: CX, y: CY + 8, class: 'initials big', 'text-anchor': 'middle' }); t.textContent = f.initials || f.name[0]; g.append(t); }
      const t = el('text', { x: CX, y: CY + 84, class: 'sun-name', 'text-anchor': 'middle' }); t.textContent = f.name; g.append(t);
      const s = el('text', { x: CX, y: CY + 104, class: 'sun-sub', 'text-anchor': 'middle' }); s.textContent = `${kindOf(f).label} · ${statusOf(f).label}${f.lead && body(f.lead) ? ' · lead ' + body(f.lead).name : ''}`; g.append(s);
    }
    g.addEventListener('click', () => opts.onPick && opts.onPick(f.id, 'center'));
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onPick && opts.onPick(f.id, 'center'); } });
    gCenter.append(g);
  }

  function glyph(b, parent) {
    const kind = kindOf(b), k = kind.glyph || 'moon', c = colorOf(b);
    const g = el('g', { class: `body k-${b.kind} s-${b.status || 'none'}`, tabindex: 0, role: 'button', 'aria-label': `${b.name}, ${kind.label}` });
    const hasKids = children(b.id).length > 0;
    const planned = ['planned', 'proposed', 'parked'].includes(b.status);
    if (k === 'planet') {
      g.append(el('circle', { r: 30, class: 'planet-core', fill: c }));
      if (b.icon) { const ic = el('g', { transform: 'translate(-11 -11) scale(1.4)' }); ic.append(el('path', { d: b.icon, fill: 'none', stroke: '#fff', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })); g.append(ic); }
    } else if (k === 'person') {
      g.append(el('circle', { r: 13, class: 'person', stroke: c }));
      const t = el('text', { class: 'initials', 'text-anchor': 'middle', y: 4 }); t.textContent = b.initials || b.name[0]; g.append(t);
    } else if (k === 'hex') {
      g.append(el('polygon', { points: poly(6, 13), fill: c, class: 'hex' + (planned ? ' planned' : '') }));
    } else if (k === 'square') {
      g.append(el('rect', { x: -7, y: -7, width: 14, height: 14, rx: 3, fill: c, class: 'square' + (planned ? ' planned' : '') }));
    } else if (k === 'diamond') {
      g.append(el('polygon', { points: poly(4, 11), fill: c, class: 'diamond' + (planned ? ' planned' : '') }));
    } else if (k === 'ring') {
      g.append(el('circle', { r: 7, class: 'ringdot', stroke: c }));
    } else {
      g.append(el('circle', { r: 8, class: 'moon' + (planned ? ' planned' : ''), fill: c }));
    }
    if (hasKids) g.append(el('circle', { r: k === 'planet' ? 36 : 17, class: 'has-kids' }));
    const need = needsHuman(b.id);
    if (need) {
      const bg = el('g', { class: 'badge', transform: k === 'planet' ? 'translate(22 -22)' : 'translate(11 -11)' });
      bg.append(el('circle', { r: 9 })); const t = el('text', { 'text-anchor': 'middle', y: 3.5 }); t.textContent = need; bg.append(t); g.append(bg);
    }
    const dy = k === 'planet' ? 48 : 26;
    const label = el('text', { class: 'label', 'text-anchor': 'middle', y: dy }); label.textContent = b.short || b.name; g.append(label);
    if (k === 'planet' || b.kind === 'project') { const sub = el('text', { class: 'sublabel', 'text-anchor': 'middle', y: dy + 14 }); sub.textContent = b.kind === 'project' ? (b.due ? 'due ' + b.due.slice(5) : statusOf(b).label) : (b.lead && body(b.lead) ? 'Lead: ' + body(b.lead).name : ''); g.append(sub); }
    g.addEventListener('click', () => (hasKids && opts.onZoom) ? opts.onZoom(b.id) : opts.onPick && opts.onPick(b.id));
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); g.dispatchEvent(new Event('click')); } });
    g.addEventListener('mouseenter', e => { state.paused = true; opts.onHover && opts.onHover(b, e); });
    g.addEventListener('mouseleave', () => { state.paused = false; opts.onHover && opts.onHover(null); });
    return { node: g, label };
  }

  function step(now, force) {
    const dt = state.paused && !force ? 0 : (now - state.t0);
    state.t0 = now;
    for (const it of state.items) {
      if (!state.paused || force) it.a0 += it.speed * dt / 16.7 * 0.01;
      const x = CX + Math.cos(it.a0) * it.rx, y = CY + Math.sin(it.a0) * it.ry;
      it.x = x; it.y = y;
      it.node.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      it.node.style.zIndex = Math.round(y);
    }
    // bodies in front draw last
    [...state.items].sort((a, b) => a.y - b.y).forEach(it => gBodies.append(it.node));
    if (state.trace.length) drawTrace();
    state.raf = requestAnimationFrame(step);
  }

  function drawTrace() {
    gTrace.innerHTML = '';
    for (const id of state.trace) {
      const it = state.items.find(i => i.b.id === id);
      if (!it) continue;
      gTrace.append(el('line', { x1: CX, y1: CY, x2: it.x, y2: it.y, class: 'trace-line' }));
    }
  }

  build();
  if (!state.raf) state.raf = requestAnimationFrame(step);
  return {
    focus(id) { state.focus = id; state.trace = []; build(); },
    setTrace(ids) { state.trace = ids || []; if (!ids || !ids.length) gTrace.innerHTML = ''; },
    refresh() { build(); },
    destroy() { cancelAnimationFrame(state.raf); state.raf = 0; },
    get focused() { return state.focus; },
  };
}

function poly(n, r) { return Array.from({ length: n }, (_, i) => { const a = (Math.PI * 2 * i) / n - Math.PI / 2; return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`; }).join(' '); }

function stars(g) {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 160; i++) g.append(el('circle', { cx: (rnd() * W).toFixed(0), cy: (rnd() * H).toFixed(0), r: (rnd() * 1.3 + 0.3).toFixed(1), class: 'star', style: `opacity:${(rnd() * .6 + .2).toFixed(2)}` }));
}

export const tooltipHtml = b => `<b>${esc(b.name)}</b><br><span>${esc(kindOf(b).label)} · ${esc(statusOf(b).label)}${b.role ? ' · ' + esc(b.role) : ''}</span>${children(b.id).length ? '<br><i>Click to zoom in</i>' : ''}`;
