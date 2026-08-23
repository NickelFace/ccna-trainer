// When the app syncs on its own — and, more to the point, when it does not. The policy is
// shared by both clients (assets/js/shared/sync.js), so it is tested once, here, against a
// store stub; the second half of the file drives the real web store to check the one piece
// of bookkeeping the policy depends on: whether anything has changed since the last sync.
import test from 'node:test';
import assert from 'node:assert/strict';
import { autoSyncer } from '../../ccna-exam-simulator/assets/js/shared/sync.js';

const KEY = 'k'.repeat(32);

const fakeStore = (over = {}) => ({
  sync: { key: KEY, syncedAt: 0, rev: 0 },
  changedSinceSync: false,
  calls: 0,
  async syncNow() { this.calls++; return { wrote: true, rev: this.calls }; },
  ...over,
});

test('without a key nothing ever goes out', async () => {
  const store = fakeStore({ sync: { key: null, syncedAt: 0, rev: 0 }, changedSinceSync: true });
  const tick = autoSyncer(store, { minMs: 0, leaveMs: 0 });
  assert.equal(tick('start'), null);
  assert.equal(tick('leave'), null);
  assert.equal(store.calls, 0);
});

test('starting up syncs, and starting up again straight after does not', async () => {
  const store = fakeStore();
  const tick = autoSyncer(store, { minMs: 60_000 });
  await tick('start');
  assert.equal(store.calls, 1);
  assert.equal(tick('start'), null, 'inside the window');
  assert.equal(store.calls, 1);

  // The same launch a window later.
  await autoSyncer(store, { minMs: 0 })('start');
  assert.equal(store.calls, 2);
});

test('leaving with nothing new does not spend a request', async () => {
  const store = fakeStore({ changedSinceSync: false });
  const tick = autoSyncer(store, { minMs: 0, leaveMs: 0 });
  assert.equal(tick('leave'), null);
  assert.equal(store.calls, 0);
});

test('leaving with work in hand syncs, but not once per flip', async () => {
  const store = fakeStore({ changedSinceSync: true });
  const tick = autoSyncer(store, { minMs: 0, leaveMs: 60_000 });
  await tick('leave');
  assert.equal(store.calls, 1);
  assert.equal(tick('leave'), null, 'flipping straight back out again');
  assert.equal(store.calls, 1);
});

test('two triggers at once are one exchange', async () => {
  let release;
  const store = fakeStore({
    async syncNow() { this.calls++; await new Promise(r => { release = r; }); return { wrote: true, rev: 1 }; },
  });
  const tick = autoSyncer(store, { minMs: 0, leaveMs: 0, });
  const first = tick('start');
  const second = tick('start');
  assert.equal(first, second, 'the second caller waits on the first');
  release();
  await first;
  assert.equal(store.calls, 1);
});

test('a failure is swallowed, reported once, and does not wedge the next attempt', async () => {
  const seen = [];
  const store = fakeStore({
    async syncNow() { this.calls++; if (this.calls === 1) throw Object.assign(new Error('nope'), { code: 'offline' }); return { wrote: false, rev: 1 }; },
  });
  const tick = autoSyncer(store, { minMs: 0, leaveMs: 0, onError: err => seen.push(err.code) });
  assert.equal(await tick('start'), null, 'a failed sync resolves rather than rejecting');
  assert.deepEqual(seen, ['offline']);
  const after = await tick('start');
  assert.equal(after.rev, 1);
});

test('onDone hears what happened, so a screen can redraw itself', async () => {
  const seen = [];
  const store = fakeStore();
  await autoSyncer(store, { minMs: 0, onDone: r => seen.push(r.wrote) })('start');
  assert.deepEqual(seen, [true]);
});

// ---------------------------------------------------------------- the real store's bookkeeping

const shim = () => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
};
globalThis.window = { localStorage: shim() };
globalThis.localStorage = shim();
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => {};

await import('../../ccna-exam-simulator/assets/js/store.js');
const web = globalThis.window.Store;

// A server that answers the protocol and can be held open mid-write.
let held = null;
globalThis.fetch = async (url, init) => {
  if (init?.method !== 'PUT') return Response.json({ rev: 0, blob: null });
  if (held) await held;
  return Response.json({ rev: 1 });
};

test('a first run has something to say — it just invented its device id', () => {
  assert.equal(web.changedSinceSync, true);
});

test('answering a question is something to say; syncing settles it', async () => {
  web.setSync({ key: KEY });
  await web.syncNow();
  assert.equal(web.changedSinceSync, false, 'and adopting the merged state does not re-arm it');

  web.recordAnswer(1, true, 'practice');
  assert.equal(web.changedSinceSync, true);
  await web.syncNow();
  assert.equal(web.changedSinceSync, false);
});

test('writing the key or the last-synced time is not progress', () => {
  web.setSync({ syncedAt: 1 });
  assert.equal(web.changedSinceSync, false);
});

test('a question answered while the exchange is in flight is still unsynced after it', async () => {
  let release;
  held = new Promise(r => { release = r; });

  const inFlight = web.syncNow();
  web.recordAnswer(2, false, 'practice');   // typed while the request is on the wire
  release();
  await inFlight;

  assert.equal(web.changedSinceSync, true, 'it was not in the blob that went up');
  held = null;
  await web.syncNow();
  assert.equal(web.changedSinceSync, false);
});
