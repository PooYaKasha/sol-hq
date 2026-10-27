// Tests for the Google Chat module and the digest. No network: a fake transport records what would be sent.
//   npm run test:gchat
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const gchat = require('../lib/gchat');
const digest = require('../lib/digest');
const registry = require('../lib/registry');
const data = require('../lib/data');

const HOOK = 'https://chat.googleapis.com/v1/spaces/AAAAtest123/messages?key=KEYKEY&token=TOKTOK';
let n = 0;
const t = async (name, fn) => { try { await fn(); console.log('ok   ' + name); n++; } catch (e) { console.error('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; } };

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gchat-'));
  const box = gchat.outbox(path.join(dir, 'outbox.json'));
  const sent = [];
  const fake = (url, body) => { sent.push({ url, body: JSON.parse(body) }); return Promise.resolve({ status: 200, json: { name: 'spaces/AAAAtest123/messages/m1', thread: { name: 'spaces/AAAAtest123/threads/t1' } } }); };
  const on = { GCHAT_WEBHOOK_URL: HOOK, GCHAT_SENDING: 'on', GCHAT_PEOPLE: '{"pooya":"111111111111111111111","bad":"x"}' };

  await t('only Google Chat webhook URLs are accepted', () => {
    assert(gchat.parseWebhook(HOOK));
    for (const u of ['http://chat.googleapis.com/v1/spaces/A/messages?key=k&token=t', 'https://evil.example/v1/spaces/A/messages?key=k&token=t',
      'https://chat.googleapis.com/v1/spaces/A/messages?key=k', 'https://chat.googleapis.com.evil.example/v1/spaces/A/messages?key=k&token=t',
      'https://chat.googleapis.com/v1/spaces/A/members?key=k&token=t', 'not a url', ''])
      assert.strictEqual(gchat.parseWebhook(u), null, u);
  });

  await t('spaces come from GCHAT_WEBHOOK_URL and GCHAT_WEBHOOK_<NAME>; bad ones are listed, not used', () => {
    const s = gchat.spaces({ GCHAT_WEBHOOK_URL: HOOK, GCHAT_WEBHOOK_OPS: HOOK, GCHAT_WEBHOOK_SALES: 'https://example.com/x' });
    assert.deepStrictEqual(Object.keys(s.spaces).sort(), ['main', 'ops']);
    assert.deepStrictEqual(s.bad, ['sales']);
  });

  await t('status never shows a URL, key or token', () => {
    const s = JSON.stringify(gchat.status(on));
    assert(!/KEYKEY|TOKTOK|googleapis/.test(s), s);
    assert.strictEqual(gchat.status({}).ready, false);
  });

  await t('@names become Chat mentions; unknown names and emails stay text', () => {
    const who = gchat.people(on);
    assert.deepStrictEqual(Object.keys(who), ['pooya']);
    assert.strictEqual(gchat.mentionize('@pooya and @all, see @ib or me@x.org', who), '<users/111111111111111111111> and <users/all>, see @ib or me@x.org');
  });

  await t('a thread key adds threadKey and the reply option', () => {
    const r = gchat.request(gchat.parseWebhook(HOOK), 'hi', 'sol-daily-digest');
    assert.strictEqual(r.url.searchParams.get('threadKey'), 'sol-daily-digest');
    assert.strictEqual(r.url.searchParams.get('messageReplyOption'), 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD');
    assert.strictEqual(r.url.searchParams.get('token'), 'TOKTOK');
    assert.deepStrictEqual(JSON.parse(r.body), { text: 'hi' });
  });

  await t('drafts are clipped and cleaned; bad thread keys and spaces fall back', () => {
    const d = box.add({ text: 'x'.repeat(5000) + '\u0007', thread: 'no spaces allowed', space: '../etc' });
    assert.strictEqual(d.text.length, gchat.MAX_TEXT);
    assert.strictEqual(d.thread, '');
    assert.strictEqual(d.space, 'main');
    assert.strictEqual(box.add({ text: '   ' }), null);
  });

  await t('nothing sends without a webhook, without GCHAT_SENDING=on, or with sample data', async () => {
    const d = box.add({ text: 'Hello @pooya', thread: 'ops' });
    for (const env of [{}, { GCHAT_WEBHOOK_URL: HOOK }, { GCHAT_SENDING: 'on' }, { GCHAT_WEBHOOK_URL: HOOK, GCHAT_SENDING: 'yes' }]) {
      const r = await gchat.send(box, d.id, { env, transport: fake });
      assert.strictEqual(r.ok, false); assert(r.why);
    }
    const s = box.add({ text: 'numbers', sample: true });
    assert.match((await gchat.send(box, s.id, { env: on, transport: fake })).why, /sample/);
    const other = box.add({ text: 'to ops', space: 'ops' });
    assert.match((await gchat.send(box, other.id, { env: on, transport: fake })).why, /no webhook/);
    assert.strictEqual(sent.length, 0);
  });

  await t('with the gate open a draft sends once, with mentions resolved and the outbox updated', async () => {
    const d = box.add({ text: 'Hello @pooya', thread: 'ops' });
    const r = await gchat.send(box, d.id, { env: on, transport: fake, by: 'matchnice' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].body.text, 'Hello <users/111111111111111111111>');
    assert.strictEqual(sent[0].url.searchParams.get('threadKey'), 'ops');
    const saved = box.get(d.id);
    assert.strictEqual(saved.status, 'sent'); assert.strictEqual(saved.text, 'Hello @pooya'); assert(saved.chatThread);
    assert.match((await gchat.send(box, d.id, { env: on, transport: fake })).why, /already sent/);
    assert.strictEqual(sent.length, 1);
  });

  await t('a failed send is recorded without the key or token, and can be discarded', async () => {
    const d = box.add({ text: 'will fail' });
    const r = await gchat.send(box, d.id, { env: on, transport: () => Promise.resolve({ status: 400, json: { error: { message: 'bad thing at ?key=KEYKEY&token=TOKTOK' } } }) });
    assert.strictEqual(r.ok, false);
    assert(!/KEYKEY|TOKTOK/.test(JSON.stringify(box.list())));
    assert.strictEqual(box.discard(d.id).status, 'discarded');
    assert.match((await gchat.send(box, d.id, { env: on, transport: fake })).why, /discarded/);
  });

  const reg = registry.load();
  await t('the digest from sample data is marked sample and leaves restricted rows out for leads', () => {
    const d = digest.build({ data, kinds: reg.kinds, role: 'lead', now: new Date('2026-10-27T13:00:00Z') });
    assert.strictEqual(d.sample, true);
    assert.strictEqual(d.day, '2026-10-27');
    assert.match(d.text, /^_SAMPLE/);
    assert.match(d.text, /Sol daily digest · Tue, Oct 27/);
    assert(!/Cash collected|Runway/.test(d.text), 'restricted pulse tiles leaked');
    const restrictedOps = data.get('ops').rows.filter(r => r.tier === 'restricted').map(r => r.id);
    for (const id of restrictedOps) assert(!d.text.includes(id + ' '), id + ' leaked');
  });

  await t('the founder view includes restricted numbers; staff sees only open rows', () => {
    const f = digest.build({ data, kinds: reg.kinds, role: 'founder', now: new Date('2026-10-27T13:00:00Z') });
    assert.match(f.text, /Cash collected/);
    const s = digest.build({ data, kinds: reg.kinds, role: 'staff', now: new Date('2026-10-27T13:00:00Z') });
    const studio = data.get('ops').rows.filter(r => r.tier === 'studio').map(r => r.id);
    for (const id of studio) assert(!s.text.includes(id + ' '), id + ' leaked to staff');
  });

  await t('the digest counts yesterday\'s hand-offs and strips angle brackets from data', () => {
    const fakeData = { get: set => set === 'ops' ? { set, as_of: '2026-10-27', rows: [{ id: 'WS-9', title: 'Fix <users/all> thing', status: 'Needs human', who: 'Sol', since: '2026-10-20' }] } : null };
    const d = digest.build({ data: fakeData, kinds: reg.kinds, tasks: [{ kind: 'task', at: '2026-10-26T15:00:00Z' }, { kind: 'hire', at: '2026-10-27T01:00:00Z' }, { kind: 'task', at: '2026-10-01T00:00:00Z' }], now: new Date('2026-10-27T13:00:00Z'), hqUrl: 'https://hq.example.org' });
    assert.strictEqual(d.sample, false);
    assert(!d.text.includes('<users/all>'));
    assert.match(d.text, /WS-9 Fix users\/all thing · Sol · 7 d/);
    assert.match(d.text, /1 task, 1 hire draft/);
    assert.match(d.text, /<https:\/\/hq\.example\.org\|Open Sol HQ>/);
  });

  await t('Eastern time is used for the digest day', () => {
    assert.deepStrictEqual(digest.eastern(new Date('2026-10-27T03:30:00Z')), { day: '2026-10-26', hour: 23 });
  });

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(process.exitCode ? 'some tests failed' : `all ${n} passed`);
})();
