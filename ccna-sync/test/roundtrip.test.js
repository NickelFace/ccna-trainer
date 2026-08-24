// The client and the server against each other — the real Worker over a real SQLite, and
// the real client from assets/js/shared/sync.js, with `fetch` wired straight from one to
// the other. No mocks in between: what these prove is that two devices holding different
// progress end up holding the same progress, which is the only claim the feature makes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/worker.js';
import { d1 } from './d1.js';
import { syncOnce, pull, newSyncKey, isSyncKey, SyncError } from '../../ccna-exam-simulator/assets/js/shared/sync.js';
import { nextState } from '../../ccna-exam-simulator/assets/js/shared/srs.js';

const BASE = 'https://sync.maks.top';
const KEY = newSyncKey(bytes => bytes.forEach((_, i) => { bytes[i] = i * 7; }));

// The server as the client sees it: one D1, one fetch.
const server = (env = d1()) => Object.assign(
  (url, init) => handle(new Request(url, init), { DB: env }),
  { env },
);

const PHONE = 'and-aaa111';
const WEB = 'web-bbb222';
const DAY = '2026-08-24';

const device = (deviceId, over = {}) => ({
  profile: { deviceId, dailyGoal: 30, updatedAt: 1000 },
  session: null,
  attempts: [],
  bookmarks: [],
  srs: {},
  activity: {},
  book: { read: {}, pos: {}, open: {}, last: null, scale: 1, updatedAt: 1000 },
  ...over,
});

// Dates are relative to an hour ago, so every fixture sits inside the six-month retention
// window without any test having to think about it. `aged` is for the one that does.
const RECENT = Date.now() - 3_600_000;
const DAY_MS = 86_400_000;

const attempt = (id, date) => ({
  id, date: RECENT + date, mode: 'exam', preset: 'full', weighted: true, scaled: 800, pct: 60,
  ok: 60, total: 100, perDomain: {}, durationMs: 1000, answers: { 1: 'A' }, qs: [1],
});

const aged = (id, days) => ({ ...attempt(id, 0), date: RECENT - days * DAY_MS });

test('a generated key is one the server will accept', () => {
  assert.ok(isSyncKey(newSyncKey()));
  assert.equal(newSyncKey().length, 32);
  assert.notEqual(newSyncKey(), newSyncKey());
});

test('an exam passed in the browser shows up on the phone', async () => {
  const fetch = server();
  const web = device(WEB, {
    attempts: [attempt('web-bbb222-100', 100)],
    srs: { 5: nextState(null, true, 100) },
    activity: { [DAY]: { [WEB]: { total: 12, wrong: 2, srs: 0 } } },
  });

  const up = await syncOnce({ fetch, base: BASE, key: KEY, state: web });
  assert.equal(up.rev, 1);
  assert.ok(up.wrote);

  const phone = device(PHONE);
  const down = await syncOnce({ fetch, base: BASE, key: KEY, state: phone });
  assert.deepEqual(down.state.attempts.map(a => a.id), ['web-bbb222-100']);
  assert.deepEqual(Object.keys(down.state.srs), ['5']);
  assert.deepEqual(down.state.activity[DAY], { [WEB]: { total: 12, wrong: 2, srs: 0 } });
  assert.equal(down.state.profile.deviceId, PHONE, 'the phone keeps its own name');
});

test('work done on both devices while apart survives on both', async () => {
  const fetch = server();
  const web = device(WEB, { attempts: [attempt('web-bbb222-100', 100)], bookmarks: [3] });
  const phone = device(PHONE, { attempts: [attempt('and-aaa111-200', 200)], bookmarks: [7] });

  await syncOnce({ fetch, base: BASE, key: KEY, state: web });
  const onPhone = await syncOnce({ fetch, base: BASE, key: KEY, state: phone });
  const onWeb = await syncOnce({ fetch, base: BASE, key: KEY, state: web });

  for (const [who, result] of [['phone', onPhone], ['browser', onWeb]]) {
    assert.deepEqual(result.state.attempts.map(a => a.id), ['web-bbb222-100', 'and-aaa111-200'], who);
    assert.deepEqual(result.state.bookmarks, [3, 7], who);
  }
});

test('a sync with nothing new to say does not write', async () => {
  const fetch = server();
  const web = device(WEB, { attempts: [attempt('web-bbb222-100', 100)] });

  const first = await syncOnce({ fetch, base: BASE, key: KEY, state: web });
  const second = await syncOnce({ fetch, base: BASE, key: KEY, state: first.state });
  assert.equal(second.wrote, false);
  assert.equal(second.rev, first.rev, 'the revision does not climb on an idle sync');
});

test('the device that loses the race still keeps its work', async () => {
  const fetch = server();
  const web = device(WEB, { attempts: [attempt('web-bbb222-100', 100)] });
  const phone = device(PHONE, { attempts: [attempt('and-aaa111-200', 200)] });

  // Both read the empty slot, then both write — the second one is the 409 path.
  const slow = pull({ fetch, base: BASE, key: KEY });
  await slow;
  await syncOnce({ fetch, base: BASE, key: KEY, state: web });

  const late = await syncOnce({ fetch, base: BASE, key: KEY, state: phone });
  assert.deepEqual(late.state.attempts.map(a => a.id), ['web-bbb222-100', 'and-aaa111-200']);
  assert.equal(late.rev, 2);
});

test('an exam in progress never crosses to the other device', async () => {
  const fetch = server();
  const running = { mode: 'exam', startedAt: 5, answers: { 1: 'A' }, endsAt: 9 };
  await syncOnce({ fetch, base: BASE, key: KEY, state: device(WEB, { session: running }) });

  const { remote } = await pull({ fetch, base: BASE, key: KEY });
  assert.equal(remote.session, null, 'it is not even uploaded');

  const phone = await syncOnce({ fetch, base: BASE, key: KEY, state: device(PHONE) });
  assert.equal(phone.state.session, null);
});

test('two keys are two separate lives', async () => {
  const fetch = server();
  const other = newSyncKey(bytes => bytes.forEach((_, i) => { bytes[i] = 255 - i; }));
  await syncOnce({ fetch, base: BASE, key: KEY, state: device(WEB, { attempts: [attempt('a', 1)] }) });
  const { rev, remote } = await pull({ fetch, base: BASE, key: other });
  assert.equal(rev, 0);
  assert.equal(remote, null);
});

test('a malformed key never leaves the device', async () => {
  const fetch = () => { throw new Error('the network must not be touched'); };
  await assert.rejects(
    () => syncOnce({ fetch, base: BASE, key: 'too-short', state: device(WEB) }),
    err => err instanceof SyncError && err.code === 'key',
  );
});

test('a key the server refuses is reported as a key problem, not a failure', async () => {
  const fetch = async () => new Response('{"error":"nope"}', { status: 401 });
  await assert.rejects(
    () => syncOnce({ fetch, base: BASE, key: KEY, state: device(WEB) }),
    err => err.code === 'auth' && err.status === 401,
  );
});

test('no connection is told apart from a broken server', async () => {
  await assert.rejects(
    () => syncOnce({ fetch: async () => { throw new TypeError('Failed to fetch'); }, base: BASE, key: KEY, state: device(WEB) }),
    err => err.code === 'offline',
  );
  await assert.rejects(
    () => syncOnce({ fetch: async () => new Response('down', { status: 502 }), base: BASE, key: KEY, state: device(WEB) }),
    err => err.code === 'server' && err.status === 502,
  );
});

test('stored progress that cannot be read is refused, not merged over', async () => {
  const fetch = server();
  // Something else entirely under this key.
  await fetch(`${BASE}/v1/state`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ rev: 0, blob: 'not json' }),
  });
  await assert.rejects(
    () => syncOnce({ fetch, base: BASE, key: KEY, state: device(PHONE) }),
    err => err.code === 'corrupt',
  );
});

test('a server that keeps saying "someone wrote first" gives up rather than looping', async () => {
  let calls = 0;
  const fetch = async (url, init) => {
    if (init?.method !== 'PUT') return Response.json({ rev: 1, blob: JSON.stringify({ v: 1 }) });
    calls++;
    return Response.json({ rev: calls + 1, blob: JSON.stringify({ v: 1, bookmarks: [calls] }) }, { status: 409 });
  };
  await assert.rejects(
    () => syncOnce({ fetch, base: BASE, key: KEY, state: device(PHONE) }),
    err => err.code === 'conflict',
  );
  assert.equal(calls, 4, 'four tries, then it stops');
});

// ---------------------------------------------------------------- not losing things

test('the counts the client sends describe what it actually holds', async () => {
  const fetch = server();
  const state = device(WEB, {
    attempts: [attempt('a', 500), attempt('b', 900)],
    srs: { 1: nextState(null, true, 100), 2: nextState(null, false, 200) },
    book: { read: { 'ch-1': 1, 'ch-2': 2, 'ch-3': 3 }, pos: {}, open: {}, last: null, scale: 1, updatedAt: 1 },
  });
  await syncOnce({ fetch, base: BASE, key: KEY, state });

  const { stats } = await pull({ fetch, base: BASE, key: KEY });
  assert.deepEqual(stats, { attempts: 2, srs: 2, read: 3, oldest: RECENT + 500 });
});

test('a client that has lost its history cannot push the loss through', async () => {
  const fetch = server();
  const full = device(WEB, { attempts: [attempt('a', 500), attempt('b', 900)] });
  await syncOnce({ fetch, base: BASE, key: KEY, state: full });

  // The same device after its storage was wiped: it would merge with the server and get
  // everything back — so to lose anything it has to be told not to merge. This is that
  // case: a blob that simply holds less, sent by something that is not this client.
  const bare = { rev: 1, blob: JSON.stringify({ v: 1, attempts: [], srs: {}, book: { read: {} } }),
    stats: { attempts: 0, srs: 0, read: 0, oldest: 0 } };
  const res = await fetch(`${BASE}/v1/state`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(bare),
  });
  assert.equal(res.status, 422);

  const { remote } = await pull({ fetch, base: BASE, key: KEY });
  assert.equal(remote.attempts.length, 2, 'the history is still there');
});

test('an attempt older than six months ages out of both sides', async () => {
  const fetch = server();
  // Uploaded while it was still young: the server holds it, and a plain merge would hand
  // it back for ever. The retention rule runs on the merged state, which is what stops it.
  const beforeCutoff = device(WEB, { attempts: [aged('old', 200), attempt('new', 900)] });
  const first = await syncOnce({ fetch, base: BASE, key: KEY, state: beforeCutoff, now: RECENT - 200 * DAY_MS + 1000 });
  assert.equal(first.state.attempts.length, 2, 'nothing is dropped while it is inside the window');

  const later = await syncOnce({ fetch, base: BASE, key: KEY, state: beforeCutoff });
  assert.deepEqual(later.state.attempts.map(a => a.id), ['new'], 'and it is gone once it is not');
  assert.ok(later.wrote);

  const { remote, stats } = await pull({ fetch, base: BASE, key: KEY });
  assert.deepEqual(remote.attempts.map(a => a.id), ['new'], 'the server let the shrink through');
  assert.equal(stats.attempts, 1);

  // And the device that still has it locally does not push it back on the next sync.
  const again = await syncOnce({ fetch, base: BASE, key: KEY, state: beforeCutoff });
  assert.deepEqual(again.state.attempts.map(a => a.id), ['new']);
});

test('the repetition map does not age out with the attempts', async () => {
  const fetch = server();
  const state = device(WEB, { attempts: [aged('old', 300)], srs: { 7: nextState(null, true, 100) } });
  const result = await syncOnce({ fetch, base: BASE, key: KEY, state });
  assert.deepEqual(result.state.attempts, []);
  assert.deepEqual(Object.keys(result.state.srs), ['7'], 'a question learned last year is still learned');
});

test('an error the client must not retry is named apart from a conflict', async () => {
  const fetch = async () => Response.json({ error: 'this write drops attempts' }, { status: 422 });
  await assert.rejects(
    () => syncOnce({ fetch, base: BASE, key: KEY, state: device(WEB) }),
    err => err.code === 'shrink' && err.status === 422,
  );
});
