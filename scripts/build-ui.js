// Turns a Sol HQ prototype (the Claude artifact's source file) into the app's page and its data file.
//
//   node scripts/build-ui.js <path to sol-hq-prototype.html>
//
// Writes:
//   public/index.html             the page, committed. Company data is cut out and replaced by __D('NAME', <empty shape>).
//   data/snapshots/ui-data.js     the data that was cut out, never committed (.gitignore). The server serves it at /ui-data.js
//                                 behind the password; without it the page still works and shows empty states.
//
// What counts as company data: the constants in DATA below, and any HTML wrapped in <!--@data:key--> … <!--@/data--> in the prototype.
// Everything else in the prototype is design and copy, and is committed as is, so the app matches the prototype screen for screen.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DATA = ['TRK_SEED', 'DEALS', 'AMT', 'CSA', 'CUSTOMERS', 'CASES', 'PB', 'PBSUM', 'MONEY', 'OPS', 'OPSX', 'INBOX', 'ART', 'GO_LIST', 'JOUR_ORGS', 'SALES_NOTES'];
const root = path.join(__dirname, '..');
const src = process.argv[2];
if (!src) { console.error('usage: node scripts/build-ui.js <sol-hq-prototype.html>'); process.exit(2); }
let page = fs.readFileSync(src, 'utf8');

// End of the expression that starts at i: brackets balanced, outside strings, template literals and comments.
function exprEnd(s, i) {
  let depth = 0; const tpl = [];
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '"' || c === "'") { for (k++; k < s.length && s[k] !== c; k++) if (s[k] === '\\') k++; continue; }
    if (c === '`' || (c === '}' && tpl.length && tpl[tpl.length - 1] === depth)) {
      if (c === '}') tpl.pop();
      for (k++; k < s.length && s[k] !== '`'; k++) { if (s[k] === '\\') { k++; continue; } if (s[k] === '$' && s[k + 1] === '{') { tpl.push(depth); k++; break; } }
      continue;
    }
    if (c === '/' && s[k + 1] === '/') { k = s.indexOf('\n', k); if (k < 0) return s.length; k--; continue; }
    if (c === '/' && s[k + 1] === '*') { k = s.indexOf('*/', k) + 1; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (depth === 0 && (c === ';' || c === ',' || c === '\n') && s.slice(i, k).trim()) return k;
  }
  throw new Error('unterminated expression at ' + i);
}

// Empty value with the same shape, so the page renders without the data file. Maps keyed by names become {}.
function empty(v) {
  if (Array.isArray(v)) return [];
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.some(k => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k))) return {};
    return Object.fromEntries(keys.map(k => [k, empty(v[k])]));
  }
  if (typeof v === 'string') return '—';
  if (typeof v === 'number') return 0;
  if (typeof v === 'boolean') return false;
  return null;
}

// 1. constants
const cut = {};
for (const name of DATA) {
  const re = new RegExp(`\\n(const|let)\\s+${name}\\s*=\\s*`, 'g');
  const hits = [...page.matchAll(re)];
  if (hits.length !== 1) throw new Error(`${name}: expected one declaration, found ${hits.length}`);
  const start = hits[0].index + hits[0][0].length, end = exprEnd(page, start);
  cut[name] = page.slice(start, end).trim();
  page = page.slice(0, start) + `__D('${name}')` + page.slice(end);
}
// 2. HTML fragments
const frag = {};
page = page.replace(/<!--@data:([a-z0-9-]+)-->([\s\S]*?)<!--@\/data-->/g, (m, key, html) => { frag[key] = html; return `<div data-uifrag="${key}"></div>`; });

// 3. the data file, checked by running it
const meta = { built: new Date().toISOString(), source: path.basename(src), constants: DATA.length, fragments: Object.keys(frag).length };
const dataJs = `// Sol HQ data file. Company data: never commit. Load it in Admin Settings, or place it at data/snapshots/ui-data.js.\n`
  + `window.SOL_DATA={meta:${JSON.stringify(meta)},\nfrag:${JSON.stringify(frag)},\nv:{\n${DATA.map(n => `${n}:${cut[n]}`).join(',\n')}\n}};\n`;
const box = { window: {} };
vm.runInNewContext(dataJs, box, { timeout: 2000 });
const values = box.window.SOL_DATA.v;

// 4. the page: empty shapes inline, the shim and the data file first
for (const n of DATA) page = page.replace(`__D('${n}')`, `__D('${n}',${JSON.stringify(empty(values[n]))})`);
const firstScript = page.indexOf('\n<script>');
if (firstScript < 0) throw new Error('no inline <script> found');
const fill = `\n<script>document.querySelectorAll('[data-uifrag]').forEach(function(el){var d=window.SOL_DATA,h=d&&d.frag&&d.frag[el.dataset.uifrag];if(h)el.outerHTML=h;else el.innerHTML='<div class="note">Not loaded yet. A founder loads the data file in Admin Settings.</div>';});</script>`;
page = page.slice(0, firstScript) + fill + page.slice(firstScript);
const title = (page.match(/<title>[^<]*<\/title>/) || ['<title>Sol HQ</title>'])[0];
page = page.replace(title + '\n', '');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
${title}
<link rel="icon" type="image/svg+xml" href="/assets/app-icon.svg">
<link rel="apple-touch-icon" href="/assets/app-icon.svg">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
<script src="/shim.js"></script>
<script src="/ui-data.js"></script>
</head>
<body>
<!-- Built by scripts/build-ui.js from ${path.basename(src)}. Do not edit by hand: change the prototype, then rebuild. -->
${page.trim()}
</body>
</html>
`;
fs.writeFileSync(path.join(root, 'public', 'index.html'), html);
fs.mkdirSync(path.join(root, 'data', 'snapshots'), { recursive: true });
fs.writeFileSync(path.join(root, 'data', 'snapshots', 'ui-data.js'), dataJs);
console.log(`public/index.html ${(html.length / 1024).toFixed(0)} KB · data/snapshots/ui-data.js ${(dataJs.length / 1024).toFixed(0)} KB · ${DATA.length} constants, ${Object.keys(frag).length} fragment(s) cut out`);
