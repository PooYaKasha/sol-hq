#!/usr/bin/env node
// Put a new body in orbit from the command line, then run the checks.
//   npm run add -- --kind project --name "Nonprofit POWER 2027" --orbits sol --lead pooya --status planned
//   npm run add -- --kind human --name "Jamie" --orbits cs --role "Customer success lead"
// Writes to registry/bodies/<kind plural>.json (creating it if needed) and prints the record.
'use strict';
const fs = require('fs');
const path = require('path');
const registry = require('../lib/registry');

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; }

const { kind, name } = args;
if (!kind || !name) { console.error('usage: npm run add -- --kind <kind> --name "<name>" --orbits <body id> [--id x] [--lead pooya] [--owner pip] [--status live] [--tier open] [--role "..."] [--mission "..."] [--due 2027-01-31]'); process.exit(2); }

const reg = registry.load();
if (!reg.kinds.kinds[kind]) { console.error(`unknown kind "${kind}". Kinds: ${Object.keys(reg.kinds.kinds).join(', ')}`); process.exit(2); }
const slug = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const prefix = { project: 'proj-', product: 'p-', workflow: 'wf-', tool: 't-' }[kind] || '';
const body = { id: args.id || prefix + slug(name), kind, name };
if (args.short) body.short = args.short;
if (kind !== 'sun' && kind !== 'tool') body.orbits = args.orbits || 'sol';
else if (args.orbits) body.orbits = args.orbits;
for (const k of ['role', 'mission', 'lead', 'owner', 'tier', 'since', 'due', 'color', 'initials', 'url', 'group', 'why', 'who']) if (typeof args[k] === 'string') body[k] = args[k];
body.status = args.status || (kind === 'human' || kind === 'tool' ? 'live' : 'planned');
if (args.approver) body.approver = String(args.approver).split(',');
if (!body.tier) body.tier = 'open';
if (kind === 'human' && !body.initials) body.initials = name.split(/\s+/).map(w => w[0]).join('').slice(0, 2);

const fileByKind = { sun: 'sun.json', human: 'humans.json', division: 'divisions.json', project: 'projects.json', agent: 'agents.json', workflow: 'workflows.json', product: 'products.json', tool: 'tools.json' };
const file = path.join(registry.BODIES, fileByKind[kind] || `${kind}s.json`);
const list = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
list.push(body);
const next = registry.load();
next.bodies.push(Object.assign({}, body, { _file: path.basename(file) }));
const problems = registry.validate(next);
if (problems.length) { console.error('Not written. Problems:\n  ' + problems.join('\n  ')); process.exit(1); }
fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n');
console.log(`Added to ${path.relative(process.cwd(), file)}:\n` + JSON.stringify(body, null, 2));
