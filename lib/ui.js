// Server side of the page's runtime (public/shim.js) and of its data file.
//   /api/store                 {revs}: one revision number per collection, so pages know what to reload
//   /api/store/<col>           GET {docs:[{id,data}], rev}
//   /api/store/<col>/<id>      PUT a JSON document (replaces it) · DELETE it
//   /api/assets                GET the list · POST a file (raw body, its own Content-Type)
//   /api/assets/<id>           GET the file · DELETE it
//   /api/ui-data               GET {loaded, meta, bytes, at} · PUT the data file (the JavaScript build-ui.js writes)
//   /ui-data.js                the data file, or `window.SOL_DATA=null;` when none is loaded
// Everything lives in data/state and data/snapshots on this server and never goes in git.
// State-changing calls must carry the X-Sol header, which a page on another site cannot send without CORS, so a
// logged-in browser cannot be tricked into writing here from elsewhere.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const STORE = path.join(ROOT, 'data', 'state', 'store');
const ASSETS = path.join(ROOT, 'data', 'state', 'assets');
const UIDATA = path.join(ROOT, 'data', 'snapshots', 'ui-data.js');
const COL = /^[a-z][a-z0-9_-]{0,31}$/;
const ID = /^[^/\\\u0000-\u001f]{1,120}$/, RESERVED = new Set(['__proto__', 'constructor', 'prototype']); // ids are keys in a JSON file, never file names
const MAX_DOC = 64 * 1024, MAX_DOCS = 5000, MAX_ASSET = 20 * 1024 * 1024, MAX_UIDATA = 8 * 1024 * 1024;
const ASSET_TYPES = /^(image\/(png|jpeg|gif|webp|svg\+xml)|application\/pdf|text\/(plain|csv|markdown)|application\/json)$/;

const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const parts = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(Object.assign(new Error('too large'), { code: 'too_large' })); req.destroy(); } else parts.push(c); });
    req.on('end', () => resolve(Buffer.concat(parts))); req.on('error', reject);
  });
}
function writeAtomic(file, buf) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = file + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, buf); fs.renameSync(tmp, file); }

// ---- store: one JSON file per collection, cached in memory
const cache = new Map();
function col(name) {
  if (!cache.has(name)) {
    let v = { rev: 0, docs: Object.create(null) };
    try { const r = JSON.parse(fs.readFileSync(path.join(STORE, name + '.json'), 'utf8')); if (r && typeof r.docs === 'object') v = { rev: r.rev || 0, docs: Object.assign(Object.create(null), r.docs) }; } catch (e) { /* new collection */ }
    cache.set(name, v);
  }
  return cache.get(name);
}
function revs() {
  const out = {};
  if (fs.existsSync(STORE)) for (const f of fs.readdirSync(STORE)) if (f.endsWith('.json')) { const n = f.slice(0, -5); if (COL.test(n)) out[n] = col(n).rev; }
  for (const [n, v] of cache) out[n] = v.rev;
  return out;
}
function save(name) { const c = col(name); c.rev += 1; writeAtomic(path.join(STORE, name + '.json'), JSON.stringify(c)); return c.rev; }

// ---- assets
function assetMeta(id) { try { return JSON.parse(fs.readFileSync(path.join(ASSETS, id + '.json'), 'utf8')); } catch (e) { return null; } }

// ---- data file
function uiStatus() {
  try { const st = fs.statSync(UIDATA); const head = fs.readFileSync(UIDATA, 'utf8').slice(0, 2000); const m = head.match(/meta:(\{[^}]*\})/); return { loaded: true, bytes: st.size, at: st.mtime.toISOString(), meta: m ? JSON.parse(m[1]) : null }; }
  catch (e) { return { loaded: false }; }
}
function checkUiData(text) {
  if (!/^\s*(\/\/[^\n]*\n\s*)*window\.SOL_DATA\s*=\s*\{/.test(text)) return 'This is not a Sol HQ data file (it should start with window.SOL_DATA=).';
  try { new vm.Script(text, { filename: 'ui-data.js' }); } catch (e) { return 'The file does not parse: ' + e.message; } // compiled, never run
  if (!/\bv:\{/.test(text) || !/\bmeta:\{/.test(text)) return 'The file is missing its data or its build stamp.';
  return '';
}

// Content Security Policy hashes for the inline scripts in a page (the build adds two).
function inlineHashes(html) { return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`); }

async function handle(req, res, p) {
  const write = req.method !== 'GET' && req.method !== 'HEAD';
  if (write && req.headers['x-sol'] !== '1') return json(res, 403, { error: 'missing X-Sol header', code: 'forbidden' }), true;

  if (p === '/ui-data.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    fs.readFile(UIDATA, (err, buf) => res.end(err ? 'window.SOL_DATA=null;\n' : buf));
    return true;
  }
  if (p === '/api/ui-data') {
    if (req.method === 'GET') return json(res, 200, uiStatus()), true;
    if (req.method !== 'PUT') return json(res, 405, { error: 'GET or PUT' }), true;
    try {
      const text = (await readRaw(req, MAX_UIDATA)).toString('utf8'), bad = checkUiData(text);
      if (bad) return json(res, 400, { error: bad, code: 'invalid_argument' }), true;
      writeAtomic(UIDATA, text); return json(res, 200, uiStatus()), true;
    } catch (e) { return json(res, e.code === 'too_large' ? 413 : 400, { error: e.code === 'too_large' ? 'The file is over 8 MB.' : 'bad request' }), true; }
  }

  if (p === '/api/store') return json(res, 200, { revs: revs() }), true;
  let m = p.match(/^\/api\/store\/([^/]+)(?:\/([^/]+))?$/);
  if (m) {
    const name = decodeURIComponent(m[1]), id = m[2] === undefined ? null : decodeURIComponent(m[2]);
    if (!COL.test(name) || (id !== null && (!ID.test(id) || RESERVED.has(id)))) return json(res, 400, { error: 'bad collection or id', code: 'invalid_argument' }), true;
    const c = col(name);
    if (id === null) return req.method === 'GET' ? json(res, 200, { rev: c.rev, docs: Object.entries(c.docs).map(([k, v]) => ({ id: k, data: v })) }) : json(res, 405, { error: 'GET' }), true;
    if (req.method === 'PUT') {
      try {
        const body = JSON.parse((await readRaw(req, MAX_DOC)).toString('utf8') || '{}');
        if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'a document is a JSON object', code: 'invalid_argument' }), true;
        if (!(id in c.docs) && Object.keys(c.docs).length >= MAX_DOCS) return json(res, 400, { error: 'collection is full', code: 'resource_exhausted' }), true;
        c.docs[id] = body; return json(res, 200, { rev: save(name) }), true;
      } catch (e) { return json(res, e.code === 'too_large' ? 413 : 400, { error: e.code === 'too_large' ? 'document over 64 KB' : 'bad JSON', code: 'invalid_argument' }), true; }
    }
    if (req.method === 'DELETE') { delete c.docs[id]; return json(res, 200, { rev: save(name) }), true; }
    return json(res, 405, { error: 'PUT or DELETE' }), true;
  }

  if (p === '/api/assets') {
    if (req.method === 'GET') {
      const list = fs.existsSync(ASSETS) ? fs.readdirSync(ASSETS).filter(f => f.endsWith('.json')).map(f => assetMeta(f.slice(0, -5))).filter(Boolean) : [];
      return json(res, 200, { assets: list, usage: { bytes: list.reduce((s, a) => s + a.sizeBytes, 0) } }), true;
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'GET or POST' }), true;
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!ASSET_TYPES.test(type)) return json(res, 415, { error: 'Images, PDF, text, CSV, Markdown or JSON only.', code: 'invalid_argument' }), true;
    try {
      const buf = await readRaw(req, MAX_ASSET), id = crypto.randomBytes(16).toString('hex');
      let name = ''; try { name = decodeURIComponent(String(req.headers['x-name'] || '')).slice(0, 200); } catch (e) { /* keep it blank */ }
      const meta = { id, url: '/api/assets/' + id, sizeBytes: buf.length, contentType: type, name, at: new Date().toISOString() };
      writeAtomic(path.join(ASSETS, id), buf); writeAtomic(path.join(ASSETS, id + '.json'), JSON.stringify(meta));
      return json(res, 200, meta), true;
    } catch (e) { return json(res, e.code === 'too_large' ? 413 : 400, { error: e.code === 'too_large' ? 'The file is over 20 MB.' : 'upload failed', code: 'invalid_argument' }), true; }
  }
  m = p.match(/^\/api\/assets\/([0-9a-f]{32})$/);
  if (m) {
    const meta = assetMeta(m[1]);
    if (!meta) return json(res, 404, { error: 'no such asset', code: 'not_found' }), true;
    if (req.method === 'DELETE') { for (const f of [m[1], m[1] + '.json']) fs.rmSync(path.join(ASSETS, f), { force: true }); return json(res, 200, { deleted: m[1] }), true; }
    if (req.method !== 'GET') return json(res, 405, { error: 'GET or DELETE' }), true;
    const inline = /^image\/(png|jpeg|gif|webp)$/.test(meta.contentType) || meta.contentType === 'application/pdf';
    res.writeHead(200, { 'Content-Type': meta.contentType, 'Content-Security-Policy': 'sandbox', 'Cache-Control': 'private, max-age=86400',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${(meta.name || m[1]).replace(/[^\w.-]/g, '_')}"` });
    fs.createReadStream(path.join(ASSETS, m[1])).pipe(res);
    return true;
  }
  return false;
}

module.exports = { handle, inlineHashes, uiStatus, checkUiData };
