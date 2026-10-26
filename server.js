// Sol HQ server. Node 18+, no dependencies.
// - Serves ./public
// - Requires a password (HTTP Basic auth) when HQ_PASSWORD is set; refuses to start in production without one
// - /api/registry   every body that orbits Sol, validated at startup
// - /api/data       the data sets and their freshness; /api/data/<set> one set
// - /api/ask        rule-based routing of a question (the model comes in v1.5)
// - /config.js      public settings from environment variables; no key ever lives in the repo
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const registry = require('./lib/registry');
const data = require('./lib/data');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, 'public');
const USER = process.env.HQ_USER || 'matchnice';
const PASS = process.env.HQ_PASSWORD || '';
const PROD = process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === '1';

if (PROD && !PASS) {
  console.error('HQ_PASSWORD is not set. Sol HQ holds company data and will not start in production without a password.');
  process.exit(1);
}

const REG = registry.load();
const problems = registry.validate(REG);
if (problems.length) {
  console.error(`The registry has ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
const REG_JSON = JSON.stringify(registry.publish(REG));

const CONFIG = {
  app: 'Sol HQ',
  version: require('./package.json').version,
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  askModel: process.env.ANTHROPIC_API_KEY ? 'model' : 'rules',
  env: PROD ? 'production' : 'dev',
};

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};
const SECURITY = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
};

const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function authorized(req) {
  if (!PASS) return true;
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const [u, ...rest] = Buffer.from(h.slice(6), 'base64').toString().split(':');
  return same(u, USER) && same(rest.join(':'), PASS);
}

const json = (res, code, body, extra = {}) => { res.writeHead(code, Object.assign({ 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' }, extra)); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };

function readBody(req, limit = 8192) {
  return new Promise((resolve, reject) => {
    let s = ''; req.on('data', c => { s += c; if (s.length > limit) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => resolve(s)); req.on('error', reject);
  });
}

// Rule-based ask: first matching rule wins. Scope narrows to rules whose body is the scoped body or its descendants.
function route(q, scope) {
  const bodies = REG.bodies, byId = new Map(bodies.map(b => [b.id, b]));
  const under = id => { let cur = byId.get(id); while (cur) { if (cur.id === scope) return true; cur = byId.get(cur.orbits); } return false; };
  const rules = (REG.routes.rules || []).filter(r => !scope || under(r.body));
  const hit = rules.find(r => new RegExp(r.match, 'i').test(q)) || null;
  const fb = REG.routes.fallback || {};
  const r = hit || Object.assign({}, fb, scope ? { body: scope, agent: null } : {});
  const name = id => (byId.get(id) || {}).name || id;
  return {
    q, scope: scope || null, matched: !!hit, mode: 'rules',
    body: r.body, bodyName: name(r.body), agent: r.agent || null, agentName: r.agent ? name(r.agent) : null,
    workflow: r.workflow || null, workflowName: r.workflow ? name(r.workflow) : null,
    next: r.next || '', checks: (r.checks || []).map(([id, what]) => ({ body: id, bodyName: name(id), what })),
    confidence: hit ? 'rule' : 'fallback',
  };
}

http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY)) res.setHeader(k, v);
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (p === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (!authorized(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Sol HQ", charset="UTF-8"', 'Content-Type': TYPES['.txt'] });
    return res.end('Sol HQ is private.');
  }
  if (p === '/config.js') { res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' }); return res.end(`window.SOL_CONFIG=${JSON.stringify(CONFIG)};`); }
  if (p === '/robots.txt') { res.writeHead(200, { 'Content-Type': TYPES['.txt'] }); return res.end('User-agent: *\nDisallow: /\n'); }
  if (p === '/api/registry') return json(res, 200, REG_JSON);
  if (p === '/api/data') return json(res, 200, { sets: data.list() });
  if (p.startsWith('/api/data/')) { const d = data.get(p.slice(10)); return d ? json(res, 200, d) : json(res, 404, { error: 'no such data set' }); }
  if (p === '/api/ask') {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST a JSON body {q, scope}' });
    try { const b = JSON.parse(await readBody(req) || '{}'); const q = String(b.q || '').slice(0, 500); if (!q.trim()) return json(res, 400, { error: 'q is empty' }); return json(res, 200, route(q, b.scope ? String(b.scope) : null)); }
    catch (e) { return json(res, 400, { error: 'bad request' }); }
  }
  if (p.startsWith('/api/')) return json(res, 404, { error: 'not found' });

  let file = decodeURIComponent(p);
  if (file.endsWith('/')) file += 'index.html';
  const abs = path.normalize(path.join(ROOT, file));
  if (!abs.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(abs, (err, buf) => {
    if (err) {
      if (!path.extname(file)) return fs.readFile(path.join(ROOT, 'index.html'), (e2, idx) => { res.writeHead(e2 ? 404 : 200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' }); res.end(e2 ? 'Not found' : idx); });
      res.writeHead(404); return res.end('Not found');
    }
    const ext = path.extname(abs);
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-store' : 'private, max-age=300' });
    res.end(buf);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Sol HQ ${CONFIG.version} on :${PORT} · ${PASS ? 'password on' : 'NO PASSWORD (local dev only)'} · ${REG.bodies.length} bodies · data: ${data.list().map(s => `${s.set}${s.sample ? ' (sample)' : ''}`).join(', ') || 'none'}`);
});
