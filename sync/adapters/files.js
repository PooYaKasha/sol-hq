// Import snapshot files placed on the server by hand (for example the reads Pip did on Oct 26).
// Point SNAPSHOT_IMPORT_DIR at a folder of <set>.json files; each one is copied in as a snapshot.
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'files',
  needs: ['SNAPSHOT_IMPORT_DIR'],
  async run(env) {
    const dir = env.SNAPSHOT_IMPORT_DIR;
    const out = [];
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const v = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (v.set && Array.isArray(v.rows)) out.push(Object.assign(v, { source: v.source || `imported from ${f}` }));
    }
    return out;
  },
};
