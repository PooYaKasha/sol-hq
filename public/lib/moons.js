// The moons of a body: the details and next moves around it, built from the registry and the data sets.
// Nothing here names a division or an agent; a new body gets its moons from the fields it has.
import { S, body, rows, kindOf, statusOf } from './store.js';
import { trunc } from './util.js';

export const COLORS = { good: '#3cc46b', warn: '#f5b83d', crit: '#e5534b', muted: '#8a93b8', blue: '#9fc8ff', teal: '#7fe3d6', white: '#c9d2f5' };
const ST = { 'Needs human': COLORS.warn, Blocked: COLORS.crit, Done: COLORS.good, 'In progress': '#3987e5' };
export const stCol = s => ST[s] || COLORS.muted;
export const toneColor = t => COLORS[t] || COLORS.muted;
export const wsId = r => 'ws-' + String(r.id).toLowerCase().replace(/[^a-z0-9]+/g, '-');

const names = ids => ids.map(i => body(i)?.name || i);
const who = r => String(r.who || '').split(/→|->/)[0].trim().toLowerCase();

// Ops Board rows that belong to this body: its own, or (for an agent) the ones where it is the owner.
export function opsFor(b) {
  const me = [b.name, b.short, b.id].filter(Boolean).map(x => x.toLowerCase());
  return rows('ops').filter(r => r.status !== 'Done' && (r.body === b.id || r.agent === b.id || (b.kind === 'agent' && me.includes(who(r)))));
}

const ASK = {
  agent: b => `What is ${b.name} working on?`,
  workflow: b => `Run the ${b.name} workflow`,
  product: b => `What is next for ${b.name}?`,
  project: b => `Where does ${b.name} stand?`,
  human: b => `What is ${b.name} waiting on?`,
  division: b => `What is ${b.name} doing this week?`,
  workstream: b => `What does ${b.short || b.name} need next?`,
};

export function moonsFor(b) {
  const M = [], k = kindOf(b), st = statusOf(b);
  const parent = b.orbits && body(b.orbits);
  if (b.kind === 'workstream') {
    const r = b.row;
    M.push({ l: 'Status', v: r.status, c: stCol(r.status) });
    if (r.who) M.push({ l: 'Owner → approver', v: r.who, c: COLORS.blue });
    if (r.tier && r.tier !== 'open') M.push({ l: 'Tier', v: r.tier, c: COLORS.white });
    if (r.next) M.push({ l: 'Next step', v: r.next, c: COLORS.teal });
    if (parent) M.push({ l: 'Division', v: parent.name, c: COLORS.white, go: { body: parent.id } });
    M.push({ l: 'Ops Board', v: 'Open the Board', c: COLORS.white, go: { view: 'board' } });
    M.push({ l: 'Ask', v: ASK.workstream(b), c: COLORS.teal, q: `What does ${r.title} need next?` });
    return M;
  }
  M.push({ l: 'Status', v: st.label, c: toneColor(st.tone) });
  if (b.role) M.push({ l: b.kind === 'agent' ? 'Seat' : 'Role', v: b.role, c: COLORS.blue });
  const lead = b.lead && body(b.lead);
  if (lead) M.push({ l: 'Lead', v: lead.name, c: COLORS.blue, go: { body: lead.id } });
  const owner = b.owner && body(b.owner);
  if (owner) M.push({ l: 'Owner', v: owner.name, c: COLORS.blue, go: { body: owner.id } });
  const appr = (b.approver && b.approver.length ? b.approver : (parent && parent.approver) || []);
  if (appr.length) M.push({ l: 'Approver', v: names(appr).join(' or '), c: COLORS.blue, go: { body: appr[0] } });
  if (b.kind !== 'division' && parent && parent.kind === 'division') M.push({ l: 'Division', v: parent.name, c: COLORS.white, go: { body: parent.id } });
  if (b.wave) M.push({ l: 'Wave', v: `Wave ${b.wave}`, c: COLORS.muted });
  if (b.due) M.push({ l: 'Due', v: b.due, c: COLORS.warn });
  if (b.tier && b.tier !== 'open') M.push({ l: 'Tier', v: b.tier, c: COLORS.white });
  const about = b.mission || b.why;
  if (about) M.push({ l: 'About', v: trunc(about, 78), c: COLORS.white });
  const led = S.reg.bodies.filter(x => x.lead === b.id).map(x => x.name);
  if (led.length) M.push({ l: 'Leads', v: led.slice(0, 3).join(', ') + (led.length > 3 ? '…' : ''), c: COLORS.blue });
  if (b.kind === 'agent') {
    const flows = new Set((S.reg.routes.rules || []).filter(r => r.agent === b.id && r.workflow).map(r => r.workflow));
    for (const x of S.reg.bodies) if (x.kind === 'workflow' && x.owner === b.id) flows.add(x.id);
    [...flows].slice(0, 2).forEach(id => M.push({ l: 'Runs', v: body(id)?.name || id, c: COLORS.white, go: body(id) ? { body: id } : null }));
  }
  opsFor(b).slice(0, 3).forEach(r => M.push({ l: `${r.id} · ${r.status}`, v: r.title, c: stCol(r.status), go: { body: wsId(r) } }));
  if (b.drive) M.push({ l: 'Drive', v: b.drive.folder, c: COLORS.white, u: `https://drive.google.com/drive/folders/${b.drive.id}` });
  if (b.url) M.push({ l: 'Link', v: b.url.replace(/^https?:\/\//, '').slice(0, 40), c: COLORS.white, u: b.url });
  const out = M.slice(0, 9);
  if (ASK[b.kind]) out.push({ l: 'Ask', v: ASK[b.kind](b), c: COLORS.teal, q: ASK[b.kind](b) });
  return out;
}
