// The merge rule, branch by branch, plus the three properties the sync loop leans on:
// merging with yourself changes nothing, re-merging the same remote state changes nothing,
// and both devices arrive at the same answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { merge } from '../../ccna-exam-simulator/assets/js/shared/merge.js';
import { isRead } from '../../ccna-exam-simulator/assets/js/shared/theory.js';
import { nextState } from '../../ccna-exam-simulator/assets/js/shared/srs.js';

const PHONE = 'and-aaa111';
const WEB = 'web-bbb222';
const DAY = '2026-08-24';

// A state as a store hands one over: seven branches, nothing else.
const state = (deviceId, over = {}) => ({
  profile: { deviceId, dailyGoal: 30, updatedAt: 1000 },
  session: null,
  attempts: [],
  bookmarks: [],
  srs: {},
  activity: {},
  book: { read: {}, readOff: {}, pos: {}, open: {}, last: null, scale: 1, updatedAt: 1000 },
  ...over,
});

const attempt = (id, date, over = {}) => ({
  id, date, mode: 'exam', preset: 'full', weighted: true, scaled: 800, pct: 60,
  ok: 60, total: 100, perDomain: {}, durationMs: 1000, answers: { 1: 'A' }, qs: [1], ...over,
});

// ------------------------------------------------------------------ the three properties

test('merging a state with itself leaves it as it was', () => {
  const s = state(PHONE, {
    attempts: [attempt('and-aaa111-1', 5)],
    bookmarks: [7, 2],
    srs: { 1: nextState(null, true, 100) },
    activity: { [DAY]: { [PHONE]: { total: 3, wrong: 1, srs: 0 } } },
    book: { read: { 'ch-1': 50 }, readOff: {}, pos: { 'ch-1': 200 }, open: {}, last: 'ch-1', scale: 1, updatedAt: 1000 },
  });
  const merged = merge(s, structuredClone(s));
  assert.deepEqual(merged, { ...s, bookmarks: [2, 7] });   // only the bookmark order is normalised
});

test('re-merging the same remote state adds nothing the second time', () => {
  const local = state(PHONE, {
    attempts: [attempt('and-aaa111-1', 5)],
    activity: { [DAY]: { [PHONE]: { total: 3, wrong: 1, srs: 0 } } },
  });
  const remote = state(WEB, {
    attempts: [attempt('web-bbb222-9', 9)],
    activity: { [DAY]: { [WEB]: { total: 4, wrong: 0, srs: 2 } } },
  });
  const once = merge(local, remote);
  const twice = merge(once, remote);
  assert.deepEqual(twice, once);
});

test('both devices arrive at the same history, whichever side they merge from', () => {
  const local = state(PHONE, { attempts: [attempt('and-aaa111-1', 5)], bookmarks: [3] });
  const remote = state(WEB, { attempts: [attempt('web-bbb222-9', 9)], bookmarks: [1] });
  const here = merge(local, remote);
  const there = merge(remote, local);
  assert.deepEqual(here.attempts, there.attempts);
  assert.deepEqual(here.bookmarks, there.bookmarks);
  assert.deepEqual(here.srs, there.srs);
  assert.deepEqual(here.activity, there.activity);
});

// ------------------------------------------------------------------ attempts

test('two histories are unioned, oldest first', () => {
  const local = state(PHONE, { attempts: [attempt('a', 30), attempt('b', 10)] });
  const remote = state(WEB, { attempts: [attempt('c', 20)] });
  assert.deepEqual(merge(local, remote).attempts.map(a => a.id), ['b', 'c', 'a']);
});

test('the same run filed twice keeps the later copy', () => {
  const local = state(PHONE, { attempts: [attempt('a', 10, { scaled: 700 })] });
  const remote = state(WEB, { attempts: [attempt('a', 20, { scaled: 900 })] });
  const merged = merge(local, remote).attempts;
  assert.equal(merged.length, 1);
  assert.equal(merged[0].scaled, 900);
});

test('same run, same clock — the fuller answer sheet wins', () => {
  const local = state(PHONE, { attempts: [attempt('a', 10, { answers: { 1: 'A' } })] });
  const remote = state(WEB, { attempts: [attempt('a', 10, { answers: { 1: 'A', 2: 'B' } })] });
  assert.deepEqual(merge(local, remote).attempts[0].answers, { 1: 'A', 2: 'B' });
});

test('a row without an id is dropped rather than filed under "undefined"', () => {
  const local = state(PHONE, { attempts: [{ date: 1 }, null, attempt('a', 2)] });
  assert.deepEqual(merge(local, state(WEB)).attempts.map(a => a.id), ['a']);
});

// ------------------------------------------------------------------ SRS

test('the question graded later wins, even when its next date is sooner', () => {
  // The phone got it right a month ago (box 4, due far out); the browser missed it today.
  const old = { box: 4, dueAt: 500_000_000, lastResult: true, seenCount: 4, at: 1_000 };
  const fresh = nextState(old, false, 2_000);
  const merged = merge(state(PHONE, { srs: { 42: old } }), state(WEB, { srs: { 42: fresh } })).srs[42];
  assert.equal(merged.box, 1);
  assert.equal(merged.lastResult, false);
  assert.ok(merged.dueAt < old.dueAt, 'the sooner date is kept, not the optimistic one');
});

test('repetitions counted on both devices are not added together', () => {
  const x = { box: 2, dueAt: 10, lastResult: true, seenCount: 5, at: 1 };
  const y = { box: 3, dueAt: 20, lastResult: true, seenCount: 8, at: 2 };
  assert.equal(merge(state(PHONE, { srs: { 1: x } }), state(WEB, { srs: { 1: y } })).srs[1].seenCount, 8);
});

test('entries from before the timestamp existed keep the local one', () => {
  const local = { box: 3, dueAt: 30, lastResult: true, seenCount: 3 };
  const remote = { box: 1, dueAt: 10, lastResult: false, seenCount: 1 };
  assert.equal(merge(state(PHONE, { srs: { 1: local } }), state(WEB, { srs: { 1: remote } })).srs[1].box, 3);
});

test('a question only one device has ever seen survives', () => {
  const merged = merge(state(PHONE, { srs: { 1: nextState(null, true, 5) } }), state(WEB, { srs: { 2: nextState(null, false, 6) } }));
  assert.deepEqual(Object.keys(merged.srs).sort(), ['1', '2']);
});

// ------------------------------------------------------------------ activity

test('a day worked on both devices holds both counts, and only once', () => {
  const local = state(PHONE, { activity: { [DAY]: { [PHONE]: { total: 10, wrong: 2, srs: 0 } } } });
  const remote = state(WEB, { activity: { [DAY]: { [WEB]: { total: 12, wrong: 1, srs: 3 } } } });
  const merged = merge(local, remote).activity;
  assert.deepEqual(merged[DAY], { [PHONE]: { total: 10, wrong: 2, srs: 0 }, [WEB]: { total: 12, wrong: 1, srs: 3 } });

  // The phone answers five more and syncs again: its own bucket grows, the browser's does not.
  const later = merge({ ...local, activity: { [DAY]: { [PHONE]: { total: 15, wrong: 2, srs: 0 } } } }, { ...remote, activity: merged });
  assert.deepEqual(later.activity[DAY], { [PHONE]: { total: 15, wrong: 2, srs: 0 }, [WEB]: { total: 12, wrong: 1, srs: 3 } });
});

test('a stale copy of a device\'s own day never walks its count backwards', () => {
  const local = state(PHONE, { activity: { [DAY]: { [PHONE]: { total: 20, wrong: 3, srs: 1 } } } });
  const remote = state(WEB, { activity: { [DAY]: { [PHONE]: { total: 8, wrong: 1, srs: 0 } } } });
  assert.deepEqual(merge(local, remote).activity[DAY][PHONE], { total: 20, wrong: 3, srs: 1 });
});

test('days from before the split are attributed to whoever wrote them', () => {
  const local = state(PHONE, { activity: { [DAY]: { total: 10, wrong: 0, srs: 0 } } });
  const remote = state(WEB, { activity: { [DAY]: { total: 4, wrong: 0, srs: 0 } } });
  assert.deepEqual(merge(local, remote).activity[DAY], {
    [PHONE]: { total: 10, wrong: 0, srs: 0 },
    [WEB]: { total: 4, wrong: 0, srs: 0 },
  });
});

// ------------------------------------------------------------------ profile, session, book

test('the settings come whole from the side written last, minus the device id', () => {
  const local = state(PHONE, { profile: { deviceId: PHONE, dailyGoal: 30, examDate: null, updatedAt: 100 } });
  const remote = state(WEB, { profile: { deviceId: WEB, dailyGoal: 50, examDate: '2026-12-01', updatedAt: 200 } });
  const merged = merge(local, remote).profile;
  assert.equal(merged.dailyGoal, 50);
  assert.equal(merged.examDate, '2026-12-01');
  assert.equal(merged.deviceId, PHONE, 'this device keeps its own name');
  assert.equal(merged.updatedAt, 200);
});

test('older settings do not overwrite newer ones', () => {
  const local = state(PHONE, { profile: { deviceId: PHONE, dailyGoal: 30, updatedAt: 900 } });
  const remote = state(WEB, { profile: { deviceId: WEB, dailyGoal: 50, updatedAt: 200 } });
  assert.equal(merge(local, remote).profile.dailyGoal, 30);
});

test('an exam in progress is never touched by the other device', () => {
  const mine = { mode: 'exam', startedAt: 5, answers: { 1: 'A' } };
  const theirs = { mode: 'exam', startedAt: 9, answers: {} };
  assert.deepEqual(merge(state(PHONE, { session: mine }), state(WEB, { session: theirs })).session, mine);
  assert.equal(merge(state(PHONE), state(WEB, { session: theirs })).session, null);
});

test('a chapter finished on either device stays finished, and keeps its place', () => {
  const local = state(PHONE, {
    book: { read: { 'ch-1': 100 }, pos: { 'ch-1': 300 }, open: {}, last: 'ch-1', scale: 1, updatedAt: 100 },
  });
  const remote = state(WEB, {
    book: { read: { 'ch-2': 200 }, pos: { 'ch-2': 400 }, open: {}, last: 'ch-2', scale: 1.2, updatedAt: 200 },
  });
  const merged = merge(local, remote).book;
  assert.deepEqual(merged.read, { 'ch-1': 100, 'ch-2': 200 });
  assert.deepEqual(merged.pos, { 'ch-1': 300, 'ch-2': 400 });
  assert.equal(merged.last, 'ch-2');    // the reader was last on the browser
  assert.equal(merged.scale, 1.2);
});

// The other half of that union. Deleting a read mark could never survive it — the other
// device still had the key, so the union handed it straight back and the tap looked
// ignored. Unmarking writes a tombstone instead, and the later of the two actions wins.
test('a chapter unmarked on one device does not come back from the other', () => {
  const local = state(PHONE, {
    book: { read: { 'ch-1': 100 }, readOff: { 'ch-1': 300 }, pos: {}, open: {}, last: null, scale: 1, updatedAt: 300 },
  });
  const remote = state(WEB, {
    book: { read: { 'ch-1': 100 }, readOff: {}, pos: {}, open: {}, last: null, scale: 1, updatedAt: 100 },
  });
  for (const [who, merged] of [['phone first', merge(local, remote).book], ['browser first', merge(remote, local).book]]) {
    assert.equal(isRead(merged, 'ch-1'), false, who);
    assert.equal(merged.read['ch-1'], 100, `${who}: the mark itself is kept, not deleted`);
  }
});

test('reading it again after unmarking it wins, because it happened later', () => {
  const local = state(PHONE, {
    book: { read: { 'ch-1': 500 }, readOff: { 'ch-1': 300 }, pos: {}, open: {}, last: null, scale: 1, updatedAt: 500 },
  });
  const remote = state(WEB, {
    book: { read: { 'ch-1': 100 }, readOff: { 'ch-1': 300 }, pos: {}, open: {}, last: null, scale: 1, updatedAt: 300 },
  });
  assert.equal(isRead(merge(local, remote).book, 'ch-1'), true);
  assert.equal(isRead(merge(remote, local).book, 'ch-1'), true, 'and from the other side too');
});

test('a book branch written before tombstones existed still reads as it did', () => {
  const old = state(PHONE, {
    book: { read: { 'ch-1': 100 }, pos: {}, open: {}, last: null, scale: 1, updatedAt: 100 },
  });
  const merged = merge(old, state(WEB)).book;
  assert.equal(isRead(merged, 'ch-1'), true);
});

// ------------------------------------------------------------------ junk

test('a state missing branches entirely merges instead of throwing', () => {
  const merged = merge({}, { attempts: [attempt('a', 1)], bookmarks: [4] });
  assert.deepEqual(merged.attempts.map(a => a.id), ['a']);
  assert.deepEqual(merged.bookmarks, [4]);
  assert.deepEqual(merged.srs, {});
  assert.equal(merged.session, null);
});

test('branches of the wrong type are treated as empty, not spread into the result', () => {
  const merged = merge({ attempts: 'nope', bookmarks: { 1: true }, srs: [], activity: 7, book: null }, {});
  assert.deepEqual(merged.attempts, []);
  assert.deepEqual(merged.bookmarks, []);
  assert.deepEqual(merged.srs, {});
  assert.deepEqual(merged.activity, {});
});
