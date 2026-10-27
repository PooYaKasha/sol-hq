// Google Chat: posts Sol's updates into Chat spaces through incoming webhooks. No dependencies.
// Draft first, always: every message is saved as a draft in data/state/gchat-outbox.json (server only,
// never in git), and a draft is sent only when all of these hold:
//   1. the space has a webhook in Replit Secrets (GCHAT_WEBHOOK_URL, or GCHAT_WEBHOOK_<NAME> for more spaces)
//   2. GCHAT_SENDING=on (Pooya's go, set as a secret; off by default)
//   3. the draft holds no sample data
//   4. someone presses send on that draft (POST /api/gchat/send), or GCHAT_DIGEST_AUTOSEND=on for the daily digest
// Webhook URLs carry a key and token, so they never leave the server: not in /config.js, logs, errors or the outbox.
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const HOST = 'chat.googleapis.com';
const MAX_TEXT = 4000;                       // Chat allows more; long posts get skimmed, so we stop here
const THREAD = /^[A-Za-z0-9._-]{1,64}$/;
const SPACE = /^[a-z][a-z0-9_-]{0,31}$/;
const GAP_MS = 1100;                         // incoming webhooks allow about one post a second per space
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n);

// A webhook URL is accepted only if it is a Google Chat space webhook: https, chat.googleapis.com, /v1/spaces/<id>/messages, key and token.
function parseWebhook(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch (e) { return null; }
  if (u.protocol !== 'https:' || u.hostname !== HOST || u.port || u.username || u.password) return null;
  if (!/^\/v1\/spaces\/[A-Za-z0-9_-]+\/messages$/.test(u.pathname)) return null;
  if (!u.searchParams.get('key') || !u.searchParams.get('token')) return null;
  return u;
}

// Spaces from the environment: GCHAT_WEBHOOK_URL is "main"; GCHAT_WEBHOOK_OPS is "ops", and so on. Bad URLs are listed, never used.
function spaces(env = process.env) {
  const out = {}, bad = [];
  for (const [k, v] of Object.entries(env)) {
    const m = k === 'GCHAT_WEBHOOK_URL' ? ['', 'main'] : k.match(/^GCHAT_WEBHOOK_([A-Z][A-Z0-9_]{0,31})$/);
    if (!m || !v) continue;
    const name = m[1].toLowerCase();
    const u = parseWebhook(v);
    if (u) out[name] = u; else bad.push(name);
  }
  return { spaces: out, bad };
}

// People who can be @-mentioned: GCHAT_PEOPLE='{"pooya":"123456789012345678901","dickson":"..."}' (Chat user ids).
// In a message, "@pooya" becomes <users/ID>; "@all" mentions everyone in the space. Unknown names stay plain text.
function people(env = process.env) {
  try {
    const v = JSON.parse(env.GCHAT_PEOPLE || '{}');
    const out = {};
    for (const [name, id] of Object.entries(v || {})) if (/^[a-z][a-z0-9_-]{0,31}$/.test(name) && /^\d{5,30}$/.test(String(id))) out[name] = String(id);
    return out;
  } catch (e) { return {}; }
}

function mentionize(text, who) {
  return String(text).replace(/(^|[\s(])@([a-z][a-z0-9_-]{0,31})\b/gi, (all, pre, name) => {
    const n = name.toLowerCase();
    if (n === 'all') return `${pre}<users/all>`;
    return who[n] ? `${pre}<users/${who[n]}>` : all;
  });
}

// The request for one post. A thread key keeps related updates in one Chat thread; the first post with a key starts it.
function request(webhook, text, thread) {
  const u = new URL(webhook.href);
  if (thread) { u.searchParams.set('threadKey', thread); u.searchParams.set('messageReplyOption', 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD'); }
  return { url: u, body: JSON.stringify({ text }) };
}

// Sends over https. Resolves { ok, status, name, thread } and never includes the URL. transport(url, body) can be swapped in tests.
function httpsPost(url, body) {
  return new Promise(resolve => {
    const req = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Content-Length': Buffer.byteLength(body) }, timeout: 10000 }, res => {
      let s = ''; res.on('data', c => { if (s.length < 65536) s += c; });
      res.on('end', () => { let j = {}; try { j = JSON.parse(s); } catch (e) {} resolve({ status: res.statusCode, json: j }); });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', e => resolve({ status: 0, json: { error: { message: e.message === 'timeout' ? 'timed out' : 'network error' } } }));
    req.end(body);
  });
}

// What the page and the API may see: names of spaces and people, whether sending is on, never a URL or id.
function status(env = process.env) {
  const s = spaces(env);
  const names = Object.keys(s.spaces);
  const sending = env.GCHAT_SENDING === 'on';
  return {
    configured: names.length > 0, sending, spaces: names, badSpaces: s.bad, people: Object.keys(people(env)),
    digest: { hour: digestHour(env), space: env.GCHAT_DIGEST_SPACE || 'main', autosend: env.GCHAT_DIGEST_AUTOSEND === 'on', off: env.GCHAT_DIGEST === 'off' },
    ready: names.length > 0 && sending,
    why: !names.length ? 'No webhook yet: add GCHAT_WEBHOOK_URL in Replit Secrets.' : !sending ? 'Drafts only: sending waits for GCHAT_SENDING=on (Pooya\'s go).' : 'Sending is on. Each draft still needs its own send.',
  };
}
const digestHour = env => { const h = Number(env.GCHAT_DIGEST_HOUR); return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 8; };

// The outbox: drafts and what happened to them. One file, written atomically, last 500 kept.
function outbox(file) {
  const read = () => { try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const write = list => { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(list.slice(-500), null, 1)); fs.renameSync(tmp, file); };
  const update = (id, fn) => { const list = read(); const d = list.find(x => x.id === id); if (!d) return null; fn(d); write(list); return d; };
  return {
    list: () => read(),
    get: id => read().find(x => x.id === id) || null,
    add(d) {
      const o = {
        id: crypto.randomBytes(6).toString('hex'), status: 'draft', at: new Date().toISOString(),
        kind: d.kind === 'digest' ? 'digest' : 'update', space: SPACE.test(String(d.space || '')) ? d.space : 'main',
        thread: THREAD.test(String(d.thread || '')) ? d.thread : '', text: clip(d.text, MAX_TEXT), sample: !!d.sample,
        by: clip(d.by, 40), day: d.day ? clip(d.day, 10) : undefined,
      };
      if (!o.text.trim()) return null;
      const list = read(); list.push(o); write(list); return o;
    },
    update,
    discard: id => update(id, d => { if (d.status === 'draft' || d.status === 'failed') { d.status = 'discarded'; d.discarded = new Date().toISOString(); } }),
  };
}

// The gate. Returns null when this draft may go, else the reason it may not.
function blocked(draft, env = process.env) {
  if (!draft) return 'no such draft';
  if (draft.status === 'sent') return 'already sent';
  if (draft.status === 'discarded') return 'discarded';
  if (draft.status === 'sending') return 'already sending';
  if (draft.sample) return 'holds sample data; it can be previewed, not sent';
  if (!spaces(env).spaces[draft.space]) return `no webhook for space "${draft.space}"`;
  if (env.GCHAT_SENDING !== 'on') return 'sending is off (GCHAT_SENDING is not "on")';
  return null;
}

// Sends one draft if the gate allows. Mentions are resolved at send time, so the outbox keeps @names, not ids.
let last = 0;
async function send(box, id, { env = process.env, transport = httpsPost, by = '' } = {}) {
  const draft = box.get(id);
  const why = blocked(draft, env);
  if (why) return { ok: false, why };
  box.update(id, d => { d.status = 'sending'; });
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  last = Date.now();
  const { url, body } = request(spaces(env).spaces[draft.space], mentionize(draft.text, people(env)), draft.thread);
  const r = await Promise.resolve().then(() => transport(url, body)).catch(() => ({ status: 0, json: {} }));
  const ok = r.status >= 200 && r.status < 300;
  const d = box.update(id, x => {
    x.status = ok ? 'sent' : 'failed'; x.tried = new Date().toISOString(); x.sentBy = clip(by, 40);
    if (ok) { x.sent = x.tried; x.chatName = clip(r.json && r.json.name, 200); x.chatThread = clip(r.json && r.json.thread && r.json.thread.name, 200); }
    else x.error = `${r.status || 'no response'}: ${clip(r.json && r.json.error && r.json.error.message, 200).replace(/key=[^&\s]+|token=[^&\s]+/g, '[redacted]')}`;
  });
  return { ok, why: ok ? null : d.error, draft: d };
}

module.exports = { parseWebhook, spaces, people, mentionize, request, status, outbox, blocked, send, digestHour, MAX_TEXT, THREAD };
