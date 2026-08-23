// The two clients have to be able to read each other's save file. This is the readiness
// criterion for the shared v:1 format, run for real rather than by inspection: the WEB
// store (ccna-exam-simulator/assets/js/store.js) records answers and files an attempt, the
// PHONE store restores the file it exports, and the phone's statistics engine reads what
// came out of it — and then the same trip in the other direction.
//
// Both stores are driven here in node, so each gets its own storage shim: Capacitor
// Preferences falls back to window.localStorage off-device, the web store speaks to the
// bare `localStorage` global, and mixing the two would hide a bug where one reads the
// other's keys instead of the file.
import test from 'node:test';
import assert from 'node:assert/strict';

const shim = () => {
  const m = new Map();
  return {
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
  };
};

globalThis.window = { localStorage: shim() };
globalThis.localStorage = shim();
globalThis.addEventListener = () => {};

const { store } = await import('../src/app/store.js');
await import('../../ccna-exam-simulator/assets/js/store.js');
const web = globalThis.window.Store;

const { dueQueue } = await import('../src/engine/srs.js');
const { answeredOn, streakDays, topicStats } = await import('../src/engine/stats.js');

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 24, 3, 0, 0);   // a fixed instant; the day key is local either way

// A bank stub — topicStats only needs the fields it reads off a question.
const BANK = new Map([
  [102, { n: 102, y: 'txt', a: 'A', tp: 'VLANs', dom: 'NA' }],
  [269, { n: 269, y: 'txt', a: 'C', tp: 'OSPF', dom: 'IPC' }],
]);

// One practice answer and one exam attempt, written the way app.js writes them.
function webRun() {
  web.recordAnswer(102, true, 'practice', NOW);
  web.recordAnswer(269, false, 'exam', NOW);
  web.saveAttempt({
    id: web.attemptId(NOW), date: NOW, mode: 'exam', preset: 'full', weighted: true,
    scaled: 650, pct: 50, ok: 1, total: 2,
    perDomain: { NA: { ok: 1, tot: 1 }, IPC: { ok: 0, tot: 1 } },
    durationMs: 60_000,
    answers: { 102: { given: ['A'] }, 269: { given: ['B'] } },
    qs: [102, 269],
  });
}

test('the phone restores what the browser exported', async () => {
  webRun();
  const file = JSON.parse(JSON.stringify(web.toBackup()));
  assert.equal(file.v, 1);

  await store.restore(file);

  assert.equal(store.attempts.length, 1);
  const a = store.attempts[0];
  assert.equal(a.mode, 'exam');
  assert.equal(a.weighted, true);
  assert.deepEqual(a.qs, [102, 269]);

  // The statistics engine recomputes everything from the raw answers — if the browser had
  // written a shape of its own, this is where it would fall apart.
  assert.deepEqual(topicStats(store.attempts, BANK).map(r => [r.topic, r.ok, r.tot]),
    [['OSPF', 0, 1], ['VLANs', 1, 1]]);
  assert.equal(answeredOn(store.activity, NOW), 2);
  assert.equal(streakDays(store.activity, NOW), 1);

  // The repetition map keeps its schedule: the wrong answer is back tomorrow, the right one
  // is not due for three days.
  assert.deepEqual(dueQueue(store.srs, NOW + DAY + 1000), [269]);
  assert.deepEqual(dueQueue(store.srs, NOW + 3 * DAY + 1000), [269, 102]);

  // A profile the browser never fills in still comes out with the phone's defaults.
  assert.equal(store.profile.dailyGoal, 30);
});

test('the browser restores what the phone exported', () => {
  store.bookmarks = [102];
  store.book = { read: { 'ch-1': NOW }, pos: {}, open: {}, last: 'ch-1', scale: 1 };
  const file = JSON.parse(JSON.stringify(store.toBackup()));

  web.restore(file);

  assert.equal(web.attempts.length, 1);
  assert.equal(web.attempts[0].id, store.attempts[0].id);
  // Branches the web trainer has no screen for survive the round trip — importing a phone
  // backup here and exporting it back must not strip the textbook or the bookmarks.
  assert.deepEqual(web.bookmarks, [102]);
  assert.equal(web.book.last, 'ch-1');
  // …but not the device identity: two devices writing attempts under one id would merge
  // each other's history into itself.
  assert.notEqual(web.deviceId, file.profile.deviceId);
  assert.match(web.deviceId, /^web-/);
});
