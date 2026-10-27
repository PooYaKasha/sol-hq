// Settings: what Sol can reach, who sees what, and how sign-in works today. View only: connectors are added in Claude,
// roles and two-step sign-in arrive with per-person accounts (Supabase auth, waiting on ib). Nothing here changes anything.
import { h } from '../lib/util.js';
import { S } from '../lib/store.js';

// An audit snapshot (Oct 26, 7:44 pm ET), not a live read. Statuses: on, off, none (no connector exists).
const APPS = [
  ['Gmail', 'on', 'Drafts and reads. Sending always needs a person.', 'Mail, replies, recap emails'],
  ['Google Calendar', 'on', 'Reads and books with a person’s OK.', 'Cal’s week plan'],
  ['Google Drive', 'on', 'The Brain and the team folders.', 'Files, the Team Drive'],
  ['Google Docs and Slides', 'on', 'Create and edit; sharing is a person’s click.', 'Docs and decks'],
  ['Miro', 'on', 'Process maps and the org map.', 'Wave 1 SOP boards'],
  ['QuickBooks', 'on', 'Read-only reports. No invoices, payroll or lending.', 'Runway, P&L, aging'],
  ['Stripe', 'on', 'Source of truth for invoices and payments. Changes ask first.', 'Billed and collected'],
  ['HubSpot', 'on', 'Reads and searches are open; changes ask first.', 'Pipeline and account activity'],
  ['Replit', 'on', 'Lists and reads; publishing needs Pooya’s go.', 'Sol HQ hosting'],
  ['GitHub', 'on', 'PooYaKasha/TheNonprofitLab and PooYaKasha/sol-hq.', 'App code'],
  ['Google Sheets', 'off', 'Not connected, so the Tracker Sheet is read through Drive.', 'Ops Board and Tracker writes'],
  ['Zoom', 'off', 'Not connected: Minnie cannot join the founder call.', 'Meeting notes'],
  ['BILL', 'off', 'Not connected.', 'Bills and payables'],
  ['NotebookLM', 'none', 'No connector exists. Needs a link in the Toolbelt.', 'Research notebooks'],
];
const pill = s => s === 'on' ? h('span.pill.t-good', 'Connected') : s === 'off' ? h('span.pill.t-warn', 'Not connected') : h('span.pill.t-muted', 'No connector');

export default {
  id: 'settings', label: 'Settings', order: 90,
  render(root) {
    const roles = S.reg.kinds.roles, tiers = Object.keys(S.reg.kinds.tiers || {}).filter(k => !k.startsWith('_'));
    root.append(
      h('div.sechead', h('h2', 'Settings'), h('span.chip', 'View only')),
      h('p.muted', 'Connected apps, who sees what, and how sign-in works. Nothing on this page changes anything yet.'),
      h('section.card', h('h3', 'Connected apps'), h('small', 'From the Oct 26 audit, not a live read.'),
        h('div.tablewrap', h('table.grid', h('thead', h('tr', ...['App', 'Status', 'Rule', 'Used for', ''].map(t => h('th', t)))),
          h('tbody', ...APPS.map(([n, s, r, u]) => h('tr', h('td', h('b', n)), h('td', pill(s)), h('td', r), h('td', h('small', u)),
            h('td', s === 'on' ? '' : h('a.ghost.small', { href: 'https://claude.ai/settings/connectors', target: '_blank', rel: 'noopener' }, s === 'off' ? 'Connect' : 'Add a link'))))))),
        h('p.muted', 'Connectors are added in Claude, not here. A connector shows to a thread only if it was connected before that thread started.')),
      h('section.card', h('h3', 'Who sees what'), h('small', 'Read from the registry: the “Viewing as” menu applies exactly this.'),
        h('div.tablewrap', h('table.grid', h('thead', h('tr', h('th', 'Role'), ...tiers.map(t => h('th', t[0].toUpperCase() + t.slice(1))), h('th', 'Also needs'))),
          h('tbody', ...Object.entries(roles).map(([k, r]) => h('tr', h('td', h('b', r.label || k)), ...tiers.map(t => h('td', r.tiers.includes(t) ? h('span.t-good', { 'aria-label': 'Yes' }, '✓') : h('span.t-muted', { 'aria-label': 'No' }, '—'))), h('td', h('small', r.tag ? `the “${r.tag}” tag` : ''))))))),
        h('p.muted', 'Naming people, inviting them and changing a role needs real sign-in, so those controls arrive with per-person accounts. This page does not invent a user list.')),
      h('section.card', h('h3', 'Security'),
        h('ul.rules',
          h('li', h('b', 'Sign-in today: '), 'one shared password (HTTP Basic) set as HQ_PASSWORD on the server. The app refuses to start in production without it.'),
          h('li', h('b', 'Two-step sign-in: '), 'not enabled. Planned for founders and leads with per-person accounts.'),
          h('li', h('b', 'Investors: '), 'planned as a one-time email link with no password that expires in 15 minutes; they never see cash, pipeline names, contract values, the Ops Board or the agents.'),
          h('li', h('b', 'Sessions and access log: '), 'not tracked yet (sign-ins, role changes, hand-offs).'),
          h('li', h('b', 'Hand-offs: '), 'tasks and hire drafts are saved on the server only (data/state/tasks.json, never in git) and never run an agent or send anything.'))),
    );
  },
};
