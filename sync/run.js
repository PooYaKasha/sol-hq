// The nightly sync. Each adapter in ./adapters reads one source with a read-only key and returns
// a data set; this runner writes it to data/snapshots/<set>.json. Adapters whose keys are missing
// are skipped and said so. Nothing here writes to any outside system.
//   npm run sync            run every adapter that has its keys
//   npm run sync -- drive   run one
'use strict';
const fs = require('fs');
const path = require('path');

const SNAP = path.join(__dirname, '..', 'data', 'snapshots');
const only = process.argv.slice(2);
const dir = path.join(__dirname, 'adapters');
const adapters = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => require(path.join(dir, f)));

(async () => {
  let wrote = 0, skipped = 0, failed = 0;
  for (const a of adapters) {
    if (only.length && !only.includes(a.name)) continue;
    const missing = (a.needs || []).filter(k => !process.env[k]);
    if (missing.length) { console.log(`skip ${a.name}: missing ${missing.join(', ')}`); skipped++; continue; }
    try {
      const sets = [].concat(await a.run(process.env));
      for (const s of sets) {
        if (!s || !s.set || !Array.isArray(s.rows)) throw new Error('adapter returned no rows');
        s.as_of = s.as_of || new Date().toISOString().slice(0, 10);
        s.synced = new Date().toISOString();
        fs.mkdirSync(SNAP, { recursive: true });
        fs.writeFileSync(path.join(SNAP, `${s.set}.json`), JSON.stringify(s, null, 1) + '\n');
        console.log(`wrote ${s.set}: ${s.rows.length} rows (${a.name})`);
        wrote++;
      }
    } catch (e) { console.error(`fail ${a.name}: ${e.message}`); failed++; }
  }
  console.log(`done: ${wrote} written, ${skipped} skipped, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
