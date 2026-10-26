// Data sets the views read: data/snapshots/<set>.json when a sync has written one,
// else data/samples/<set>.json, which is always marked sample. Snapshots never go in git.
'use strict';
const fs = require('fs');
const path = require('path');

const SNAP = path.join(__dirname, '..', 'data', 'snapshots');
const SAMPLE = path.join(__dirname, '..', 'data', 'samples');
const NAME = /^[a-z][a-z0-9_-]{0,31}$/;

function read(dir, set) {
  const f = path.join(dir, `${set}.json`);
  if (!fs.existsSync(f)) return null;
  const v = JSON.parse(fs.readFileSync(f, 'utf8'));
  return Object.assign({ set, rows: [], meta: {} }, v, { file: path.relative(path.join(__dirname, '..'), f) });
}

function get(set) {
  if (!NAME.test(set)) return null;
  const snap = read(SNAP, set);
  if (snap) return Object.assign(snap, { sample: !!snap.sample, origin: 'snapshot' });
  const sample = read(SAMPLE, set);
  if (sample) return Object.assign(sample, { sample: true, origin: 'sample' });
  return null;
}

function list() {
  const names = new Set();
  for (const d of [SNAP, SAMPLE]) if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (f.endsWith('.json')) names.add(f.slice(0, -5));
  return [...names].sort().map(set => { const d = get(set); return { set, as_of: d.as_of || null, sample: d.sample, origin: d.origin, source: d.source || null, rows: Array.isArray(d.rows) ? d.rows.length : null }; });
}

module.exports = { get, list, SNAP, SAMPLE };
