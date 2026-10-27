// Sol HQ shell: routing, tabs, the ask bar, search, the detail panel and the role switch.
// Views live in ./views and register themselves in VIEWS; the registry and data come from the store.
import { h, $, $$, esc, debounce } from './lib/util.js';
import { S, loadAll, body, sun, setRole, freshness, isUnder } from './lib/store.js';
import { search, invalidate, GROUPS } from './lib/search.js';
import { ctxData } from './lib/context.js';
import { initPanel, setMode, showPanel, setTitle, swapThread, toBottom, scrollTo, sheetTo } from './lib/panel.js';
import { planCard, hireCard, loadTasks } from './lib/plan.js';
import { renderBody } from './views/body.js';
import hq from './views/hq.js';
import exec from './views/exec.js';
import board from './views/board.js';
import sales from './views/sales.js';
import success from './views/success.js';
import drive from './views/drive.js';
import library from './views/library.js';
import settings from './views/settings.js';

const VIEWS = [hq, exec, board, sales, success, drive, library, settings].sort((a, b) => a.order - b.order);
const app = { view: null, cleanups: [], orbit: null, scope: null, key: '', closed: false, asked: false };

function parse() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const [view, ...rest] = path.split('/');
  const q = new URLSearchParams(qs || '');
  return { view: VIEWS.find(v => v.id === view) ? view : 'hq', params: { focus: rest[0] || null }, body: q.get('body') };
}
const go = (path, keepBody) => { const cur = parse(); location.hash = '#/' + path + (keepBody && cur.body ? `?body=${cur.body}` : ''); };
const openBody = id => { const cur = parse(); location.hash = `#/${cur.view}${cur.params.focus ? '/' + cur.params.focus : ''}?body=${id}`; };
const dropBody = () => { const cur = parse(); location.hash = `#/${cur.view}${cur.params.focus ? '/' + cur.params.focus : ''}`; };
// The ✕ closes the whole panel; the Thread button in the header brings it back.
const closePanel = () => { app.closed = true; app.asked = false; app.orbit && app.orbit.setTrace([]); $('#p-open').setAttribute('aria-pressed', 'false'); showPanel(false); if (parse().body) dropBody(); };

function render() {
  const r = parse();
  const view = VIEWS.find(v => v.id === r.view);
  const root = $('#view');
  for (const fn of app.cleanups) try { fn(); } catch (e) {}
  app.cleanups = []; app.orbit = null;
  root.innerHTML = '';
  $$('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.view === view.id));
  const ctx = { params: r.params, go, openBody, closePanel, rerender: render, focusBody: id => { location.hash = `#/hq/${id}?body=${id}`; }, ask: q => openAsk(q), onCleanup: fn => app.cleanups.push(fn), get orbit() { return app.orbit; }, set orbit(o) { app.orbit = o; } };
  try { view.render(root, ctx); } catch (e) { root.append(h('p.err', `This view hit an error: ${e.message}`)); console.error(e); }
  app.scope = view.id === 'hq' && r.params.focus && r.params.focus !== sun().id ? r.params.focus : null;
  paintScope();
  syncPanel(r, view, ctx);
  document.title = view.id === 'hq' ? 'Sol HQ' : `${view.label} · Sol HQ`;
}

// One panel, two views. Thread is Sol's conversation for the level you are on; Info is the body you picked.
// Clicking a planet or opening a star switches to Info; going back to the galaxy switches to Thread.
function syncPanel(r, view, ctx) {
  const onHq = view.id === 'hq';
  const focus = onHq ? (r.params.focus && body(r.params.focus) ? r.params.focus : sun().id) : null;
  const infoId = r.body || focus;
  const key = `${view.id}|${r.params.focus || ''}|${r.body || ''}`, changed = key !== app.key;
  app.key = key;
  if (r.body) app.closed = false;
  const info = $('#panel-body');
  if (infoId && body(infoId)) renderBody(info, infoId, ctx); else info.replaceChildren(h('p.muted', 'Pick a planet on the HQ map to see its info here.'));
  if (!infoId) setMode('thread'); else if (changed) setMode(r.body || focus !== sun().id ? 'info' : 'thread');
  swapThread(app.scope, greet);
  const sc = app.scope && body(app.scope);
  setTitle(sc ? sc.name : 'Sol · whole company', sc ? (sc.short || sc.name) : '');
  const show = (onHq && !app.closed) || !!r.body || app.asked;
  showPanel(show); $('#p-open').setAttribute('aria-pressed', String(show));
}

// What Sol says first in a thread: what needs attention at this level, and questions worth asking. (These used to be rails beside the map.)
function greet(log) {
  const d = ctxData(app.scope || sun().id), know = d.know.slice(0, 3);
  log.append(h('div.msg.sol', h('span.av', { 'aria-hidden': 'true' }), h('div.tx',
    h('p', d.name ? `You’re in ${d.name}. ` : '', know.length ? 'Here is what needs attention.' : 'Nothing needs attention here right now.'),
    h('div.kcl', ...know.map(k => h(k.go ? 'button.kc' : 'div.kc', { type: k.go ? 'button' : null, style: `--kc:${k.c}`, onclick: k.go ? () => (k.go.body ? openBody(k.go.body) : go(k.go.view)) : null }, h('b', k.t), h('small', k.s), k.go ? h('span.go', 'Open →') : null))),
    h('div.kicker', 'What do you want to do?'),
    h('div.qcl', ...d.ask.map(([q, why]) => h('button.qc', { type: 'button', onclick: () => openAsk(q) }, q, h('small', why)))))));
}

function paintScope() {
  const chip = $('#scope');
  if (app.scope && body(app.scope)) { chip.hidden = false; $('b', chip).textContent = body(app.scope).short || body(app.scope).name; $('#q').placeholder = `Ask ${body(app.scope).short || body(app.scope).name}, or find anything`; }
  else { chip.hidden = true; $('#q').placeholder = 'Ask Sol anything, or find a deal, agent, project, file or folder'; }
}

// Ask Sol: rule-based today, the model later. The question and the answer go into the thread for this level.
async function openAsk(q) {
  const input = $('#q');
  if (q) input.value = q;
  const text = input.value.trim();
  if (!text) { input.focus(); return; }
  input.value = '';
  app.closed = false; app.asked = true; showPanel(true); $('#p-open').setAttribute('aria-pressed', 'true'); setMode('thread'); sheetTo('half');
  const log = $('#log');
  log.append(h('div.msg.me', text));
  const wait = h('div.msg.sol', h('span.av', { 'aria-hidden': 'true' }), h('div.tx', h('p.muted', 'Sol is routing that…')));
  log.append(wait); toBottom();
  let a;
  try { const r = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: text, scope: app.scope }) }); a = await r.json(); }
  catch (e) { a = { error: e.message }; }
  if (!a || a.error) { wait.querySelector('.tx').replaceChildren(h('p.err', 'Ask Sol is not reachable right now.')); return; }
  const owner = body(a.body), agent = a.agent && body(a.agent), wf = a.workflow && body(a.workflow);
  const srcs = ['ops', 'deals', 'accounts', 'drive'].map(s => ({ s, f: freshness(s) }));
  const card = h('div.ans', { role: 'region', 'aria-label': 'Sol’s answer' },
    h('div.kicker', `Answer · ${a.mode === 'rules' ? 'routed by rule' : 'model'} · ${a.matched ? 'confident' : 'no rule matched'}`),
    h('p.big', ...(owner ? [h('b', owner.name), ' owns this', agent ? [' · ', h('button.link', { onclick: () => openBody(agent.id) }, agent.name), ' runs it'] : null, wf ? [' through ', h('i', wf.name)] : null, '.'] : ['No owner found.'])),
    a.next ? h('p', a.next) : null,
    a.checks && a.checks.length ? h('div', h('div.kicker', 'Checks before anything moves'), h('ul.checks', ...a.checks.map(c => h('li', h('button.link', { onclick: () => openBody(c.body) }, c.bodyName), `: ${c.what}`)))) : null,
    h('div.kicker', 'Human gate'), h('p', owner && owner.approver ? `${owner.approver.map(x => body(x)?.name || x).join(' or ')} approves anything that leaves the company.` : 'A founder approves anything that leaves the company.'),
    h('div.kicker', 'Sources'), h('ul.srcs', ...srcs.map(({ s, f }) => h('li', `${GROUPS[s] || s}: ${f.sample ? 'sample until the sync runs' : `as of ${f.as_of} · ${f.source}`}`))),
    S.config.askModel === 'rules' ? h('p.muted', 'Rule-based routing. Connect ANTHROPIC_API_KEY on the server to let the model answer from the same data.') : null,
    a.matched ? planCard(a, text) : h('div.hire', 'No agent’s seat fits this yet. ', h('button.ghost.small', { type: 'button', onclick: e => { e.target.disabled = true; card.append(hireCard(text)); } }, 'Draft a hire')),
    h('div.actions', owner ? h('button.ghost.small', { onclick: () => openBody(owner.id) }, `Open ${owner.name}`) : null, owner ? h('button.ghost.small', { onclick: () => go(`hq/${owner.id}`) }, 'Zoom there') : null));
  wait.querySelector('.tx').replaceChildren(card);
  scrollTo(wait);
  if (app.orbit) app.orbit.setTrace([a.body, ...(a.checks || []).map(c => c.body)].filter(id => body(id) && body(id).orbits === app.orbit.focused));
}

// Search dialog: Cmd-K or /, grouped results across the registry and the data sets.
function setupSearch() {
  const dlg = $('#search'), inp = $('#s-q'), res = $('#s-res');
  let hits = [], sel = 0;
  const paint = () => {
    res.innerHTML = '';
    if (!hits.length) { res.append(h('p.muted', inp.value ? 'Nothing matched.' : 'Type to search bodies, deals, accounts, Ops rows, files and folders.')); return; }
    let last = null;
    hits.forEach((it, i) => {
      if (it.group !== last) { res.append(h('div.kicker', GROUPS[it.group] || it.group)); last = it.group; }
      res.append(h('button.hit', { 'aria-selected': i === sel, onclick: () => pick(i), onmousemove: () => { sel = i; } }, h('b', it.title), h('small', it.sub)));
    });
  };
  const run = debounce(() => { hits = search(inp.value); sel = 0; paint(); }, 60);
  const pick = i => { const it = hits[i]; if (!it) return; dlg.close(); if (it.go.body) openBody(it.go.body); else go(it.go.view); };
  inp.addEventListener('input', run);
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, hits.length - 1); paint(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); paint(); e.preventDefault(); }
    else if (e.key === 'Enter') { pick(sel); e.preventDefault(); }
  });
  const open = () => { if (dlg.open) return; dlg.showModal(); inp.value = ''; hits = []; paint(); inp.focus(); };
  $('#s-open').addEventListener('click', open);
  document.addEventListener('keydown', e => {
    const typing = /input|textarea|select/i.test(document.activeElement?.tagName || '');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
    else if (e.key === '/' && !typing) { e.preventDefault(); open(); }
    else if (e.key === 'Escape' && !dlg.open && parse().body) dropBody();
    else if (e.key === 'Escape' && !dlg.open && !typing) {
      const cur = parse(), b = cur.view === 'hq' && cur.params.focus && body(cur.params.focus);
      if (b) go(b.orbits && b.orbits !== sun().id ? `hq/${b.orbits}` : 'hq');
    }
  });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
}

async function boot() {
  const root = $('#view');
  try {
    await loadAll();
    const svg = await fetch('/assets/clover-white.svg').then(r => r.text()).catch(() => '');
    S.cloverPath = (svg.match(/ d="([^"]+)"/) || [])[1] || '';
  } catch (e) { root.innerHTML = `<p class="err">Sol HQ could not load its registry: ${esc(e.message)}</p>`; return; }
  const tabs = $('#tabs');
  for (const v of VIEWS) tabs.append(h('button', { role: 'tab', dataset: { view: v.id }, onclick: () => go(v.id) }, v.label));
  const role = $('#role');
  for (const [k, v] of Object.entries(S.reg.kinds.roles)) role.append(h('option', { value: k }, v.label));
  role.value = S.role;
  role.addEventListener('change', () => { setRole(role.value); invalidate(); render(); });
  initPanel(); await loadTasks();
  $('#p-open').addEventListener('click', () => { if ($('#panel').hidden) { app.closed = false; showPanel(true); $('#p-open').setAttribute('aria-pressed', 'true'); sheetTo('half'); } else closePanel(); });
  $('#panel-x').addEventListener('click', closePanel);
  $('#ask').addEventListener('submit', e => { e.preventDefault(); openAsk(); });
  $('#scope button').addEventListener('click', () => go('hq'));
  $('#version').textContent = `v${S.config.version || ''} · ${S.config.env || ''}`;
  const sets = S.sets.map(s => `${s.set}: ${s.sample ? 'sample' : s.as_of}`).join(' · ');
  $('#fresh').textContent = sets ? `Data · ${sets}` : 'No data sets loaded';
  $('#bodies').textContent = `${S.reg.bodies.length} bodies in the registry`;
  setupSearch();
  window.addEventListener('hashchange', render);
  render();
}
boot();
