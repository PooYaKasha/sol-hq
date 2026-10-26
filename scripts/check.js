// Run before every push: the registry is valid, the data files parse, the browser code parses,
// and nothing that looks like a secret or a customer snapshot is about to be committed.
'use strict';
const fs = require('fs');
const path = require('path');
const registry = require('../lib/registry');

const root = path.join(__dirname, '..');
let bad = 0;
const fail = m => { console.error('FAIL ' + m); bad++; };
const ok = m => console.log('ok   ' + m);

// 1. registry
try {
  const reg = registry.load();
  const problems = registry.validate(reg);
  problems.forEach(fail);
  if (!problems.length) ok(`registry: ${reg.bodies.length} bodies in ${reg.files.length} files, ${reg.routes.rules.length} routes`);
} catch (e) { fail('registry: ' + e.message); }

// 2. data files parse and carry the contract
const walk = d => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name === 'node_modules' || e.name === '.git' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : [];
for (const f of walk(path.join(root, 'data'))) {
  if (!f.endsWith('.json')) continue;
  try {
    const v = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!v.set) fail(`${path.relative(root, f)}: missing "set"`);
    if (!v.as_of) fail(`${path.relative(root, f)}: missing "as_of"`);
    if (f.includes(`${path.sep}samples${path.sep}`) && v.sample !== true) fail(`${path.relative(root, f)}: samples must say "sample": true`);
  } catch (e) { fail(`${path.relative(root, f)}: ${e.message}`); }
}
ok('data files parse');

// 3. browser modules parse (node --check on a .mjs copy, so import/export syntax is checked as a module)
const os = require('os');
const { execFileSync } = require('child_process');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'solhq-'));
for (const f of walk(path.join(root, 'public'))) {
  if (!f.endsWith('.js')) continue;
  const copy = path.join(tmp, path.basename(f, '.js') + '.mjs');
  fs.copyFileSync(f, copy);
  try { execFileSync(process.execPath, ['--check', copy], { stdio: 'pipe' }); }
  catch (e) { fail(`${path.relative(root, f)} does not parse: ${String(e.stderr || e.message).split('\n').slice(0, 3).join(' ')}`); }
}
fs.rmSync(tmp, { recursive: true, force: true });
ok('browser code parses');

// 4. secrets and snapshots never in the tree that gets committed
const SECRET = /(sk_live_[0-9a-zA-Z]{10,}|sk-ant-[0-9A-Za-z_-]{20,}|service_role|eyJhbGciOi[0-9A-Za-z_-]{20,}\.[0-9A-Za-z_-]{20,}\.[0-9A-Za-z_-]{10,}|ghp_[0-9A-Za-z]{20,}|AKIA[0-9A-Z]{16}|"private_key"\s*:\s*"-----BEGIN)/;
for (const f of walk(root)) {
  if (/\.(png|jpg|ico|webp|woff2)$/.test(f) || f.endsWith('check.js') || f.includes(`${path.sep}data${path.sep}snapshots${path.sep}`)) continue;
  const m = fs.readFileSync(f, 'utf8').match(SECRET);
  if (m) fail(`possible secret in ${path.relative(root, f)}: ${m[0].slice(0, 12)}…`);
}
try {
  const ignored = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  if (!/^data\/snapshots\/$/m.test(ignored)) fail('.gitignore must ignore data/snapshots/');
} catch (e) { fail('.gitignore missing'); }
ok('no secrets, snapshots ignored');

console.log(bad ? `${bad} problem(s)` : 'all good');
process.exit(bad ? 1 : 0);
