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

const attempt = (id, date) => ({
  id, date, mode: 'exam', preset: 'full', weighted: true, scaled: 800, pct: 60,
  ok: 60, total: 100, perDomain: {}, durationMs: 1000, answers: { 1: 'A' }, qs: [1],
});

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
