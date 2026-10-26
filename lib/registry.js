// The registry: every body that orbits Sol, loaded from registry/bodies/*.json and checked.
// Used by the server (/api/registry), by scripts/check.js and by scripts/add-body.js.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'registry');
const BODIES = path.join(ROOT, 'bodies');

const ID = /^[a-z][a-z0-9-]{0,47}$/;

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { throw new Error(`${path.relative(process.cwd(), file)}: ${e.message}`); }
}

// Returns { kinds, bodies, routes, files } with bodies as a flat array in file order.
function load() {
  const kinds = readJson(path.join(ROOT, 'kinds.json'));
  const routes = readJson(path.join(ROOT, 'routes.json'));
  const files = fs.readdirSync(BODIES).filter(f => f.endsWith('.json')).sort();
  const bodies = [];
  for (const f of files) {
    const v = readJson(path.join(BODIES, f));
    const list = Array.isArray(v) ? v : v && Array.isArray(v.bodies) ? v.bodies : [v];
    for (const b of list) {
      if (!b || typeof b !== 'object' || b._about) continue;
      bodies.push(Object.assign({}, b, { _file: f }));
    }
  }
  return { kinds, bodies, routes, files };
}

// Every problem a registry can have, as plain sentences. Empty list = valid.
function validate(reg) {
  const problems = [];
  const { kinds, bodies, routes } = reg;
  const byId = new Map();
  const say = (b, msg) => problems.push(`${b._file} · ${b.id || '(no id)'}: ${msg}`);

  for (const b of bodies) {
    if (!b.id || !ID.test(b.id)) say(b, 'id must be lowercase letters, digits and dashes');
    else if (byId.has(b.id)) say(b, `duplicate id (also in ${byId.get(b.id)._file})`);
    else byId.set(b.id, b);
    if (!kinds.kinds[b.kind]) say(b, `unknown kind "${b.kind}"`);
    if (!b.name) say(b, 'needs a name');
    if (b.status && !kinds.statuses[b.status]) say(b, `unknown status "${b.status}"`);
    if (b.tier && !(b.tier in kinds.tiers)) say(b, `unknown tier "${b.tier}"`);
    if (b.kind === 'sun' && b.orbits) say(b, 'the sun orbits nothing');
    if (b.kind !== 'sun' && b.kind !== 'tool' && !b.orbits) say(b, 'needs orbits (the body it circles)');
  }
  const suns = bodies.filter(b => b.kind === 'sun');
  if (suns.length !== 1) problems.push(`there must be exactly one sun, found ${suns.length}`);

  for (const b of bodies) {
    if (b.orbits && !byId.has(b.orbits)) say(b, `orbits "${b.orbits}", which does not exist`);
    for (const k of ['lead', 'owner']) if (b[k] && !byId.has(b[k])) say(b, `${k} "${b[k]}" is not a body`);
    if (b.lead && byId.get(b.lead) && byId.get(b.lead).kind !== 'human') say(b, `lead "${b.lead}" must be a human`);
    for (const a of b.approver || []) if (!byId.has(a)) say(b, `approver "${a}" is not a body`);
    for (const f of b.for || []) if (!byId.has(f)) say(b, `for "${f}" is not a body`);
    // no cycles: walk up to the sun
    const seen = new Set([b.id]); let cur = b;
    while (cur && cur.orbits) {
      if (seen.has(cur.orbits)) { say(b, 'orbit chain loops'); break; }
      seen.add(cur.orbits); cur = byId.get(cur.orbits);
    }
  }
  for (const r of routes.rules || []) {
    try { new RegExp(r.match, 'i'); } catch (e) { problems.push(`routes.json: bad pattern "${r.match}"`); }
    for (const k of ['body', 'workflow', 'agent']) if (r[k] && !byId.has(r[k])) problems.push(`routes.json: ${k} "${r[k]}" is not a body`);
    for (const [id] of r.checks || []) if (!byId.has(id)) problems.push(`routes.json: check body "${id}" is not a body`);
  }
  return problems;
}

// Public shape for the browser: strips file names, adds counts.
function publish(reg) {
  const bodies = reg.bodies.map(b => { const o = Object.assign({}, b); delete o._file; return o; });
  return { generated: new Date().toISOString(), kinds: reg.kinds, routes: reg.routes, bodies };
}

module.exports = { load, validate, publish, BODIES, ID };
