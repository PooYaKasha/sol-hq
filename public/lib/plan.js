// Delegation. When someone asks Sol, Sol answers with a plan of who does what: each task goes to the agent whose seat owns it,
// with its approver, what "done" looks like, the sources it will use, and whether it needs a go.
// Handing off saves the tasks on the server. Agents do not run from this page, and nothing here sends, buys or changes anything.
import { h, esc, trunc, fmtDate } from './util.js';
import { S, body, children, rowsFor, colorOf, kindOf } from './store.js';
import { GROUPS } from './search.js';

const GO = /\b(send|email|invoice|refund|pay|purchase|buy|publish|post|submit|change|update|create|offer|follow up|book|schedule)\b/i;
const nameOf = id => (id && body(id) ? body(id).name : '');
const approverOf = b => (b && (b.approver || []).map(nameOf).filter(Boolean)[0]) || '';
const agentsAll = () => S.reg.bodies.filter(b => b.kind === 'agent');

export async function loadTasks() {
  try { const r = await fetch('/api/tasks', { credentials: 'same-origin' }); S.tasks = r.ok ? (await r.json()).tasks || [] : []; }
  catch (e) { S.tasks = []; }
}
async function save(items) {
  const r = await fetch('/api/tasks', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: items.map(i => Object.assign({ role: S.role }, i)) }) });
  if (!r.ok) throw new Error(String(r.status));
  const out = await r.json(); S.tasks = (S.tasks || []).concat(out.items || []); return out;
}

function task(agent, home, what, go) {
  const ap = approverOf(agent) || approverOf(home) || nameOf(home && home.lead) || 'Pooya';
  const src = home ? ['ops', 'deals', 'accounts', 'library', 'drive'].filter(s => rowsFor(s, home.id).length).map(s => GROUPS[s] || s).slice(0, 4) : [];
  return { agent: agent ? agent.id : '', body: home ? home.id : '', what, approver: ap, go: !!go, src, done: agent ? `${agent.name}’s draft is ready for ${ap} to approve` : `${ap} picks this up; no agent holds this seat yet`, off: false };
}

export function planCard(a, text) {
  const owner = body(a.body), agent = a.agent && body(a.agent);
  const T = [task(agent, owner, a.next || text, GO.test(text + ' ' + (a.next || '')))];
  for (const c of a.checks || []) {
    if (!body(c.body) || c.body === a.body) continue;
    T.push(task(children(c.body).find(x => x.kind === 'agent') || null, body(c.body), 'Cross-check: ' + c.what, false));
  }
  const roster = agentsAll();
  const box = h('div.plan', { role: 'group', 'aria-label': 'Plan: who does what' },
    h('h4', 'Plan · who does what'),
    h('p.pl-n', 'Each task goes to the agent whose seat owns it. Edit, reassign or cancel before you hand off.'));
  const ol = h('ol.tks'); box.append(ol);
  const paint = (li, t) => {
    const ag = t.agent && body(t.agent), home = body(t.body), who = ag ? ag.name : (home ? home.name : 'A person');
    li.className = 'ptk' + (t.off ? ' off' : '');
    li.replaceChildren(
      h('span.ptk-av', { style: `background:${colorOf(home || {})}`, 'aria-hidden': 'true' }, who[0]),
      h('div.ptk-m',
        h('div.ptk-h', h('b', who), h('small', `${home ? home.short || home.name : ''} · approver ${t.approver}`), h(`span.pill.t-${t.go ? 'warn' : 'good'}`, t.go ? 'Needs a go' : 'Read-only'),
          ag && ag.status === 'planned' ? h('span.pill.t-muted', 'Seat not staffed yet') : null, !ag ? h('span.pill.t-muted', 'No agent seat') : null),
        h('textarea', { rows: 2, 'aria-label': `Task for ${who}`, oninput: e => { t.what = e.target.value; } }, t.what),
        h('div.ptk-d', h('span', `Done when: ${t.done}`), t.src.length ? h('span', `Sources: ${t.src.join(', ')}`) : null),
        h('div.ptk-a',
          h('label', 'Reassign ', h('select', { 'aria-label': 'Reassign the task', onchange: e => { const v = e.target.value, n = v && body(v); t.agent = v; if (n) { t.body = n.orbits || t.body; t.approver = approverOf(n) || approverOf(body(t.body)) || t.approver; t.done = `${n.name}’s draft is ready for ${t.approver} to approve`; } paint(li, t); li.querySelector('select').focus(); } },
            h('option', { value: '', selected: !t.agent }, 'No agent (a person does it)'),
            ...roster.map(r => h('option', { value: r.id, selected: r.id === t.agent }, `${r.name} · ${body(r.orbits) ? body(r.orbits).short || body(r.orbits).name : ''}`)))),
          h('button.ghost.small', { type: 'button', onclick: () => { t.off = !t.off; paint(li, t); li.querySelector('.ptk-a button').focus(); } }, t.off ? 'Restore task' : 'Cancel task'))));
    li.querySelector('textarea').value = t.what;
  };
  T.forEach((t, i) => { const li = h('li'); li.style.animationDelay = (matchMedia('(prefers-reduced-motion:reduce)').matches ? 0 : i * 0.45) + 's'; paint(li, t); ol.append(li); });
  const status = h('span.pl-s', { role: 'status' });
  const btn = h('button.cta', { type: 'button' }, 'Hand off');
  btn.onclick = async () => {
    const L = T.filter(t => !t.off);
    if (!L.length) { status.textContent = 'Every task is cancelled, so there is nothing to hand off.'; return; }
    btn.disabled = true; status.textContent = 'Saving…';
    try {
      await save(L.map(t => ({ kind: 'task', ask: text, agent: t.agent, body: t.body, what: t.what, approver: t.approver, done: t.done, src: t.src, go: t.go })));
      status.textContent = `Handed off ${L.length} task${L.length > 1 ? 's' : ''}. Each shows on its agent’s Info. Nothing was sent or changed.`; btn.textContent = 'Handed off';
    } catch (e) { btn.disabled = false; status.textContent = 'Could not save the hand-off. Try again.'; }
  };
  box.append(h('div.pl-f', btn, status), h('p.muted.pl-note', 'Agents don’t run from this page. Handing off saves the tasks for their threads. Anything that sends, buys or changes a shared system also waits for its approver and gets a log line.'));
  return box;
}

// No seat fits: draft a hire for Pooya to approve. Nothing is created.
export function hireCard(text) {
  const seat = h('input', { name: 'seat', placeholder: 'e.g. Grant writer', required: true, 'aria-label': 'Seat' });
  const scope = h('textarea', { rows: 2, 'aria-label': 'What it owns' }, text); scope.value = text;
  const tools = h('input', { placeholder: 'e.g. HubSpot read, Drive read', 'aria-label': 'Tools it needs' });
  const appr = h('select', { 'aria-label': 'Approver' }, ...['Pooya', 'Dickson', 'ib'].map(n => h('option', n)));
  const status = h('span.pl-s', { role: 'status' });
  const btn = h('button.cta', { type: 'button' }, 'Save the hire draft');
  const first = [`Write the SOP for: ${trunc(text, 80)}`, 'Run it once on a real example, read-only', 'Report what it needed and what it got wrong'];
  btn.onclick = async () => {
    if (!seat.value.trim()) { status.textContent = 'Give the seat a name first.'; seat.focus(); return; }
    btn.disabled = true;
    try { await save([{ kind: 'hire', ask: text, seat: seat.value.trim(), what: scope.value.trim(), tools: tools.value.trim(), approver: appr.value, first, go: true }]); status.textContent = 'Saved as a draft for Pooya to approve. No agent was created.'; btn.textContent = 'Saved'; }
    catch (e) { btn.disabled = false; status.textContent = 'Could not save the draft. Try again.'; }
  };
  const box = h('div.plan.hire-card', h('h4', 'Hire draft · a new agent'), h('p.pl-n', 'A draft only. Nothing is created until Pooya approves it.'),
    h('label', 'Seat', seat), h('label', 'What it owns', scope), h('label', 'Tools it needs (read-only first)', tools), h('label', 'Approver', appr),
    h('div.kicker', 'First three tasks'), h('ol.pl-3', ...first.map(f => h('li', f))), h('div.pl-f', btn, status));
  setTimeout(() => seat.focus(), 0);
  return box;
}

// Tasks already handed off to an agent, shown in its Info.
export function tasksSection(b) {
  if (b.kind !== 'agent') return null;
  const L = (S.tasks || []).filter(t => t.kind === 'task' && t.agent === b.id && t.status === 'handed-off').sort((x, y) => String(y.at).localeCompare(String(x.at)));
  if (!L.length) return null;
  return h('section.rows', h('h3', 'Handed-off tasks', h('small.src', ` ${L.length}`)),
    h('ul', ...L.slice(0, 6).map(t => h('li', h('b', trunc(t.what, 90)), h('small', ` · from “${trunc(t.ask, 50)}” · approver ${t.approver}${t.go ? ' · needs a go' : ''} · ${fmtDate(t.at)}`)))),
    h('p.muted', `Saved for ${b.name}’s thread. Agents don’t run from this page.`));
}
