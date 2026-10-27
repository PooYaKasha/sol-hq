// The orbit engine, three levels deep. The galaxy (focus on Sol): Sol is a black hole, divisions are stars.
// A star system (focus on a body with children): the body is the star, its children are planets with tiny moons.
// A planet (focus on a body with none): its moons are the details and next moves around it.
// Nothing here knows about divisions or agents in particular: a kind gets its glyph and ring from kinds.json.
import { S, body, children, kindOf, statusOf, colorOf, ringOf, needsHuman, sun } from './store.js';
import { esc, trunc } from './util.js';
import { moonsFor, stCol } from './moons.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 1200, H = 700, CX = 600, CY = 360;
const EY = 0.52;
const RX = { galaxy: [235, 350, 480], system: [190, 320, 460] };
const SPEED = { galaxy: 0.045, system: 0.07 };
const PR = 30;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

const el = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const k in a) if (a[k] != null) e.setAttribute(k, a[k]); return e; };
const clover = () => el('path', { d: S.cloverPath || '', fill: '#fff' });
const gid = id => 'x-' + String(id).replace(/[^a-z0-9_-]/gi, '_');
const hex = b => { const c = colorOf(b); return /^#[0-9a-f]{3,8}$/i.test(c) ? c : '#7a86b6'; };
const poly = (n, r) => Array.from({ length: n }, (_, i) => { const a = (Math.PI * 2 * i) / n - Math.PI / 2; return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`; }).join(' ');
const wrap = (t, n) => { const w = String(t).split(' '); const L = []; let cur = ''; for (const x of w) { if ((cur + ' ' + x).trim().length > n && cur) { L.push(cur); cur = x; } else cur = (cur + ' ' + x).trim(); } if (cur) L.push(cur); return L.length > 3 ? [L[0], L[1], trunc(L.slice(2).join(' '), n)] : L; };

export function mountOrbit(svg, opts) {
  const state = { focus: opts.focus || sun().id, mode: 'galaxy', items: [], moons: [], t: 0, t0: performance.now(), paused: false, trace: [], raf: 0, order: [] };
  const defs = el('defs');
  const gStars = el('g', { class: 'stars' }), gArms = el('g', { class: 'arms' }), gRings = el('g', { class: 'rings' }), gTrace = el('g', { class: 'trace' }), gBodies = el('g', { class: 'bodies' }), gCenter = el('g', { class: 'center' });
  const ph = () => innerWidth < 700;

  function setup() {
    svg.innerHTML = '';
    svg.append(defs, gStars, gArms, gRings, gTrace, gBodies, gCenter);
    stars(gStars);
  }

  function build() {
    defs.innerHTML = '';
    for (const g of [gArms, gRings, gBodies, gCenter, gTrace]) g.innerHTML = '';
    state.items = []; state.moons = []; state.order = [];
    const f = body(state.focus) || sun();
    const kids = children(f.id).filter(b => b.kind !== 'tool' || b.orbits);
    const mode = f.kind === 'sun' ? 'galaxy' : kids.length ? 'system' : 'moons';
    state.mode = mode; svg.dataset.mode = mode; state.paused = false;
    const phoneMoons = mode === 'moons' && ph();
    svg.setAttribute('viewBox', phoneMoons ? `${CX - 300} 0 600 800` : `0 0 ${W} ${H}`);
    svg.style.aspectRatio = phoneMoons ? '600/800' : '';
    gArms.style.display = mode === 'galaxy' ? '' : 'none';
    if (mode === 'galaxy') arms(gArms);
    defs.insertAdjacentHTML('beforeend', '<linearGradient id="bhG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#007DFD"/><stop offset=".5" stop-color="#06A3CC"/><stop offset="1" stop-color="#0CCA98"/></linearGradient><radialGradient id="bhLens"><stop offset=".55" stop-color="#06A3CC" stop-opacity="0"/><stop offset=".7" stop-color="#06A3CC" stop-opacity=".22"/><stop offset="1" stop-color="#007DFD" stop-opacity="0"/></radialGradient><filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter><filter id="softS" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>');

    if (mode === 'moons') { buildMoons(f); return; }

    const rings = new Map();
    for (const b of kids) { const r = Math.min(ringOf(b), 3); if (!rings.has(r)) rings.set(r, []); rings.get(r).push(b); }
    const used = [...rings.keys()].sort((a, b) => a - b);
    used.forEach((r, i) => {
      const rx = RX[mode][Math.min(i, RX[mode].length - 1)], ry = rx * EY;
      gRings.append(el('ellipse', { cx: CX, cy: CY, rx, ry, class: 'ring' }));
      const list = rings.get(r);
      list.forEach((b, j) => {
        const a0 = (b.angle ?? (360 / list.length) * j + (i * 37)) * Math.PI / 180;
        const g = glyph(b);
        gBodies.append(g.node);
        state.items.push({ b, rx, ry, a0, speed: (reduce ? 0 : SPEED[mode] / (1 + i * 0.55)) * (i % 2 ? -1 : 1), node: g.node, dots: g.dots, rr: g.rr });
      });
    });
    center(f, mode);
    step(performance.now(), true);
  }

  // The thing at the middle of a galaxy or a star system: a black hole, or the star the planets circle.
  function center(f, mode) {
    const g = el('g', { class: 'sun', tabindex: 0, role: 'button', 'aria-label': `${f.name}: ${f.kind === 'sun' ? 'ask Sol' : 'open'}` });
    const at = el('g', { transform: `translate(${CX} ${CY})` });
    g.append(at);
    if (f.kind === 'sun') {
      at.append(el('circle', { r: 150, fill: 'url(#bhLens)' }));
      const disk = el('g', { class: 'disk', transform: 'rotate(-14)' });
      disk.append(el('ellipse', { rx: 168, ry: 44, fill: 'none', stroke: 'url(#bhG)', 'stroke-width': 22, opacity: 0.55, filter: 'url(#soft)' }));
      disk.append(el('ellipse', { rx: 160, ry: 40, fill: 'none', stroke: 'url(#bhG)', 'stroke-width': 3.5, 'stroke-dasharray': '40 14 8 14', class: 'diskline' }));
      at.append(disk);
      at.append(el('circle', { r: 82, fill: 'none', stroke: 'url(#bhG)', 'stroke-width': 9, opacity: 0.75, filter: 'url(#softS)' }));
      at.append(el('circle', { r: 78, fill: '#000', stroke: 'url(#bhG)', 'stroke-width': 2.5 }));
      const front = el('g', { class: 'disk front', transform: 'rotate(-14)' });
      front.append(el('path', { d: 'M-160 0 A160 40 0 0 0 160 0', fill: 'none', stroke: 'url(#bhG)', 'stroke-width': 3.5, 'stroke-dasharray': '40 14 8 14', class: 'diskline' }));
      at.append(front);
      // Only the MatchNice heart at the center; clicking it (or Enter) opens the ask bar.
      const m = el('g', { transform: 'translate(-34 -34) scale(0.0355)', class: 'sun-heart' }); m.append(clover()); at.append(m);
    } else {
      const c = hex(f), big = bigShape(f, c);
      at.append(...big.nodes);
      const t = el('text', { y: big.r + 36, class: 'sun-name', 'text-anchor': 'middle' }); t.textContent = f.name; at.append(t);
      const s = el('text', { y: big.r + 58, class: 'sun-sub', 'text-anchor': 'middle' });
      s.textContent = mode === 'system' ? `${kindOf(f).label} · lead ${f.lead && body(f.lead) ? body(f.lead).name : '—'} · click a planet to see its moons` : `${kindOf(f).label} · ${statusOf(f).label}`;
      at.append(s);
    }
    g.addEventListener('click', () => opts.onPick && opts.onPick(f.id, 'center'));
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onPick && opts.onPick(f.id, 'center'); } });
    gCenter.append(g);
  }

  // A big stand-in for the focused body: a star for planet-glyph kinds, else a large version of its own shape.
  function bigShape(b, c) {
    const g = kindOf(b).glyph || 'moon';
    if (g === 'planet') {
      const id = gid(b.id);
      defs.insertAdjacentHTML('beforeend', `<radialGradient id="g-${id}"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#fff" stop-opacity=".9"/><stop offset=".75" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity=".9"/></radialGradient><radialGradient id="k-${id}"><stop offset="0" stop-color="${c}" stop-opacity=".75"/><stop offset=".45" stop-color="${c}" stop-opacity=".28"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`);
      const n = [el('circle', { r: 170, fill: `url(#k-${id})` }), el('path', { d: 'M-190 0H190M0 -150V150', class: 'spike' }), el('circle', { r: 74, class: 'planet-core big', fill: `url(#g-${id})` })];
      if (b.icon) n.push(el('path', { d: b.icon, transform: 'translate(-45 -45) scale(3.75)', fill: 'none', stroke: c, 'stroke-width': 1.3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      return { nodes: n, r: 74 };
    }
    const st = statusOf(b);
    if (b.kind === 'workstream') return { nodes: [el('circle', { r: 56, fill: '#0b1230', stroke: stCol(b.row.status), 'stroke-width': 8 }), el('circle', { r: 18, fill: stCol(b.row.status) })], r: 56 };
    if (g === 'person') { const t = el('text', { y: 17, class: 'initials big', 'text-anchor': 'middle' }); t.textContent = b.initials || b.name[0]; return { nodes: [el('circle', { r: 60, class: 'person', stroke: c, 'stroke-width': 4 }), t], r: 60 }; }
    if (g === 'hex') return { nodes: [el('polygon', { points: poly(6, 64), fill: c, class: 'hex' })], r: 64 };
    if (g === 'square') return { nodes: [el('circle', { r: 50, fill: 'none', stroke: '#c9d2f5', 'stroke-width': 3, 'stroke-dasharray': '10 6' })], r: 50 };
    if (g === 'diamond') return { nodes: [el('circle', { r: 46, fill: '#c9d2f5' }), el('ellipse', { rx: 94, ry: 24, fill: 'none', stroke: '#c9d2f5', 'stroke-width': 4, transform: 'rotate(-18)' })], r: 56 };
    if (g === 'ring') return { nodes: [el('circle', { r: 46, fill: 'none', stroke: c, 'stroke-width': 6 })], r: 46 };
    const planned = ['planned', 'proposed', 'parked'].includes(b.status) || b.wave === 2;
    const t = el('text', { y: 17, class: 'initials big', 'text-anchor': 'middle' }); t.textContent = (b.initials || b.name[0]);
    t.setAttribute('style', 'font-size:48px');
    return { nodes: [el('circle', { r: 64, fill: planned ? '#0b1230' : c, stroke: planned ? c : '#e6ecff', 'stroke-width': 3, 'stroke-dasharray': planned ? '8 6' : 'none' }), t], r: 64, st };
  }

  // One planet (or star, person, hex...) in orbit, with its tiny moons and its label.
  function glyph(b) {
    const kind = kindOf(b), k = kind.glyph || 'moon', c = hex(b);
    const g = el('g', { class: `body k-${b.kind} s-${b.status || 'none'}`, tabindex: 0, role: 'button', 'aria-label': `${b.name}, ${kind.label}` });
    const kids = children(b.id).length;
    const planned = ['planned', 'proposed', 'parked'].includes(b.status);
    let rr = 24, dy = 34, sub = '', moonN = 0;
    const dots = el('g', { class: 'pmoons' });
    g.append(dots);
    if (k === 'planet') {
      const id = gid(b.id);
      defs.insertAdjacentHTML('beforeend', `<radialGradient id="g-${id}"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#fff" stop-opacity=".9"/><stop offset=".75" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity=".9"/></radialGradient><radialGradient id="k-${id}"><stop offset="0" stop-color="${c}" stop-opacity=".75"/><stop offset=".45" stop-color="${c}" stop-opacity=".28"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`);
      g.append(el('circle', { r: PR * 2.1, fill: `url(#k-${id})`, class: 'corona' }), el('path', { d: `M${-PR * 2} 0H${PR * 2}M0 ${-PR * 2}V${PR * 2}`, class: 'spike' }), el('circle', { r: PR * 0.92, class: 'planet-core', fill: `url(#g-${id})` }));
      if (b.icon) g.append(el('path', { d: b.icon, transform: 'translate(-18.6 -18.6) scale(1.55)', fill: 'none', stroke: c, 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'pointer-events': 'none' }));
      rr = PR + 18; dy = PR + 40; sub = b.lead && body(b.lead) ? 'Lead: ' + body(b.lead).name : '';
      moonN = Math.min(8, kids);
    } else if (k === 'person') {
      g.append(el('circle', { r: 13, class: 'person', stroke: c }));
      const t = el('text', { class: 'initials', 'text-anchor': 'middle', y: 4 }); t.textContent = b.initials || b.name[0]; g.append(t);
      rr = 24; dy = 28; moonN = Math.min(6, moonsFor(b).length);
    } else if (k === 'hex') {
      g.append(el('polygon', { points: poly(6, 13), fill: c, class: 'hex' + (planned ? ' planned' : '') }));
      rr = 24; dy = 28; sub = b.due ? 'due ' + b.due.slice(5) : statusOf(b).label; moonN = Math.min(6, moonsFor(b).length);
    } else if (k === 'square') {
      g.append(el('circle', { r: 10, class: 'wf' + (planned ? ' planned' : '') }));
      rr = 22; dy = 28; sub = 'workflow'; moonN = Math.min(6, moonsFor(b).length);
    } else if (k === 'diamond') {
      g.append(el('rect', { x: -9, y: -9, width: 18, height: 18, rx: 2, transform: 'rotate(45)', fill: c, class: 'diamond' + (planned ? ' planned' : '') }));
      g.append(el('ellipse', { rx: 17, ry: 5, fill: 'none', class: 'prodring', transform: 'rotate(-18)' }));
      rr = 26; dy = 30; sub = statusOf(b).label; moonN = Math.min(6, moonsFor(b).length);
    } else if (k === 'ring') {
      g.append(el('circle', { r: 7, class: 'ringdot', stroke: c }));
      rr = 20; dy = 24; moonN = Math.min(6, moonsFor(b).length);
    } else if (k === 'status') {
      const sc = b.row ? stCol(b.row.status) : c;
      g.append(el('circle', { r: 12, fill: '#0b1230', stroke: sc, 'stroke-width': 3 }), el('circle', { r: 4.5, fill: sc }));
      rr = 22; dy = 28; sub = trunc(b.name, 26); moonN = Math.min(6, moonsFor(b).length);
    } else {
      g.append(el('circle', { r: 16, class: 'agentdot' + (planned || b.wave === 2 ? ' planned' : ''), fill: planned || b.wave === 2 ? '#0b1230' : c, stroke: planned || b.wave === 2 ? c : '#e6ecff' }));
      const t = el('text', { class: 'initials', 'text-anchor': 'middle', y: 5 }); t.textContent = b.initials || b.name[0]; g.append(t);
      rr = 28; dy = 34; sub = b.wave === 2 ? 'Wave 2' : trunc(String(b.role || '').split(',')[0], 24); moonN = Math.min(6, moonsFor(b).length);
    }
    for (let i = 0; i < moonN; i++) dots.append(el('circle', { r: 2.4, class: 'tinymoon' }));
    if (kids && k !== 'planet') g.append(el('circle', { r: rr - 6, class: 'has-kids' }));
    if (kids && k === 'planet') g.append(el('circle', { r: PR + 8, class: 'has-kids' }));
    const need = needsHuman(b.id);
    if (need) {
      const bg = el('g', { class: 'badge', transform: k === 'planet' ? `translate(${PR * 0.78} ${-PR * 0.78})` : 'translate(11 -11)' });
      bg.append(el('circle', { r: 9 })); const t = el('text', { 'text-anchor': 'middle', y: 3.5 }); t.textContent = need; bg.append(t); g.append(bg);
    }
    const label = el('text', { class: 'label', 'text-anchor': 'middle', y: dy }); label.textContent = b.short || b.name; g.append(label);
    if (sub) { const s = el('text', { class: 'sublabel', 'text-anchor': 'middle', y: dy + 14 }); s.textContent = sub; g.append(s); }
    g.addEventListener('click', () => kids ? (opts.onZoom && opts.onZoom(b.id)) : (opts.onLeaf ? opts.onLeaf(b.id) : opts.onPick && opts.onPick(b.id)));
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); g.dispatchEvent(new Event('click')); } });
    g.addEventListener('mouseenter', e => { state.paused = true; opts.onHover && opts.onHover(b, e); });
    g.addEventListener('mouseleave', () => { state.paused = false; opts.onHover && opts.onHover(null); });
    return { node: g, dots: [...dots.childNodes], rr };
  }

  // Planet level: the body in the middle, its moons (details and next moves) around it.
  function buildMoons(f) {
    const compact = ph(), fs = compact ? 1.35 : 1, R = compact ? [205, 290] : [330, 200];
    gRings.append(el('ellipse', { cx: CX, cy: CY, rx: R[0], ry: R[1], class: 'ring' }));
    center(f, 'moons');
    const list = moonsFor(f);
    list.forEach((m, i) => {
      const g = el('g', { class: 'mm' + (m.u || m.q || m.go ? ' act' : ''), tabindex: m.u || m.q || m.go ? 0 : -1, role: m.u || m.q || m.go ? 'button' : 'group', 'aria-label': `${m.l}: ${m.v}` });
      g.append(el('circle', { r: 34, fill: 'transparent' }), el('circle', { class: 'mb', r: 13, fill: '#0b1230', stroke: m.c, 'stroke-width': 2.5 }), el('circle', { r: 5, fill: m.c }));
      const lab = el('text', { y: -22 * fs, class: 'mlab', 'text-anchor': 'middle', style: `font-size:${(11.5 * fs).toFixed(1)}px` }); lab.textContent = String(m.l).toUpperCase(); g.append(lab);
      wrap(m.v, compact ? 14 : 26).forEach((line, k) => { const t = el('text', { y: (32 + k * 17) * fs, class: 'mval', 'text-anchor': 'middle', style: `font-size:${(14.5 * fs).toFixed(1)}px;font-weight:${k ? 400 : 600}` }); t.textContent = line; g.append(t); });
      if (m.u || m.q || m.go) {
        const act = () => opts.onMoon && opts.onMoon(m);
        g.addEventListener('click', act);
        g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
      }
      g.addEventListener('mouseenter', () => { state.paused = true; });
      g.addEventListener('mouseleave', () => { state.paused = false; });
      gBodies.append(g);
      state.moons.push({ node: g, i, n: list.length, R });
    });
    step(performance.now(), true);
  }

  // Speeds are radians per second: the inner ring takes about 90 s per lap, outer rings are slower.
  // Draw order is only touched when it actually changes; moving a node under the pointer eats its click.
  function step(now, force) {
    const dt = state.paused && !force ? 0 : Math.min(now - state.t0, 100);
    state.t0 = now;
    state.t += dt / 1000;
    for (const it of state.items) {
      it.a0 += it.speed * dt / 1000;
      const x = CX + Math.cos(it.a0) * it.rx, y = CY + Math.sin(it.a0) * it.ry;
      it.x = x; it.y = y;
      it.node.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      const n = it.dots.length;
      for (let k = 0; k < n; k++) { const a = (reduce ? 0 : state.t * 1.6) + k * 2 * Math.PI / n + it.a0; it.dots[k].setAttribute('cx', (it.rr * Math.cos(a)).toFixed(1)); it.dots[k].setAttribute('cy', (it.rr * 0.55 * Math.sin(a)).toFixed(1)); }
    }
    for (const m of state.moons) {
      const a = -Math.PI / 2 + m.i * 2 * Math.PI / m.n + (reduce ? 0 : state.t * 0.05);
      m.node.setAttribute('transform', `translate(${(CX + m.R[0] * Math.cos(a)).toFixed(1)} ${(CY + m.R[1] * Math.sin(a)).toFixed(1)})`);
    }
    if (state.mode === 'galaxy' && !reduce) gArms.setAttribute('transform', `rotate(${((state.t * 1.2) % 360).toFixed(2)} ${CX} ${CY})`);
    if (!state.paused || force) {
      const order = [...state.items].sort((a, b) => a.y - b.y);
      if (force || order.some((it, i) => it !== state.order[i])) { order.forEach(it => gBodies.append(it.node)); state.order = order; }
    }
    if (state.trace.length) drawTrace();
    state.raf = requestAnimationFrame(step);
  }

  // The person who approves this work shows at the end of the line to it (initials until a photo exists; nothing is invented).
  function approverAvatar(it) {
    const p = (it.b.approver || []).map(id => body(id)).find(Boolean);
    if (!p) return null;
    const dx = it.x - CX, dy = it.y - CY, len = Math.hypot(dx, dy) || 1, d = (it.rr || 16) + 16;
    const g = el('g', { class: 'apv', transform: `translate(${(it.x - dx / len * d).toFixed(1)} ${(it.y - dy / len * d).toFixed(1)})` });
    const t = el('title', {}); t.textContent = `${p.name} approves ${it.b.name}`; g.append(t);
    g.append(el('circle', { r: 12, fill: colorOf(p) || '#6f7fb8', stroke: '#e6ecff', 'stroke-width': 1.5 }));
    const i = el('text', { y: 4, 'text-anchor': 'middle' }); i.textContent = p.initials || p.name.slice(0, 1); g.append(i);
    return g;
  }

  function drawTrace() {
    gTrace.innerHTML = '';
    for (const id of state.trace) {
      const it = state.items.find(i => i.b.id === id);
      if (!it) continue;
      gTrace.append(el('line', { x1: CX, y1: CY, x2: it.x, y2: it.y, class: 'trace-line' }));
      const ap = approverAvatar(it);
      if (ap) gTrace.append(ap);
    }
  }

  setup();
  build();
  if (!state.raf) state.raf = requestAnimationFrame(step);
  return {
    focus(id) { state.focus = id; state.trace = []; build(); },
    setTrace(ids) { state.trace = ids || []; if (!ids || !ids.length) gTrace.innerHTML = ''; },
    refresh() { build(); },
    destroy() { cancelAnimationFrame(state.raf); state.raf = 0; },
    get focused() { return state.focus; },
    get mode() { return state.mode; },
  };
}

function stars(g) {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 160; i++) g.append(el('circle', { cx: (rnd() * W).toFixed(0), cy: (rnd() * 780).toFixed(0), r: (rnd() * 1.3 + 0.3).toFixed(1), class: 'star', style: `opacity:${(rnd() * .6 + .2).toFixed(2)}` }));
}

// Two slow spiral arms of dust behind the black hole.
function arms(g) {
  let s = 11; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 150; i++) {
    const k = i / 150, th = arm * Math.PI + k * 3.4 * Math.PI + (rnd() - 0.5) * 0.35, r = 95 + k * 470 + (rnd() - 0.5) * 38;
    g.append(el('circle', { cx: (CX + r * Math.cos(th)).toFixed(1), cy: (CY + r * Math.sin(th) * 0.56).toFixed(1), r: (rnd() * 1.5 + 0.4).toFixed(2), fill: rnd() < 0.5 ? '#7fb8ff' : '#7fe3d6', 'fill-opacity': ((1 - k) * 0.35 + rnd() * 0.25).toFixed(2) }));
  }
}

export const tooltipHtml = b => `<b>${esc(b.name)}</b><br><span>${esc(kindOf(b).label)} · ${esc(statusOf(b).label)}${b.role ? ' · ' + esc(trunc(b.role, 60)) : ''}</span><br><i>${children(b.id).length ? 'Click to open its system' : 'Click to see its moons'}</i>`;
