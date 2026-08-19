import test from 'node:test';
import assert from 'node:assert/strict';
import { atTime, mockState, nextDailyAt, nextMockAt, parseTime, examDatePassed, MOCK_EVERY_DAYS } from '../src/engine/plan.js';
import { DAY_MS } from '../src/engine/srs.js';

// A fixed local moment to reason from: 2026-08-18, 12:00 local.
const NOON = new Date(2026, 7, 18, 12, 0, 0, 0).getTime();
const attempt = (mode, at) => ({ id: String(at), mode, date: at, scaled: 800 });

test('no exam attempt yet means the mock is due', () => {
  const state = mockState([], NOON);
  assert.equal(state.due, true);
  assert.equal(state.last, null);
  assert.equal(state.daysSince, null);
});

test('practice and repetition are not mock exams', () => {
  const state = mockState([attempt('practice', NOON - DAY_MS), attempt('srs', NOON - 2 * DAY_MS)], NOON);
  assert.equal(state.due, true);
  assert.equal(state.last, null);
});

test('a mock taken today is not due again for a week', () => {
  const state = mockState([attempt('exam', NOON - 60_000)], NOON);
  assert.equal(state.due, false);
  assert.equal(state.daysSince, 0);
  assert.equal(state.daysLeft, MOCK_EVERY_DAYS);
});

test('the mock comes due on the seventh day', () => {
  const six = mockState([attempt('exam', NOON - 6 * DAY_MS)], NOON);
  assert.equal(six.due, false);
  assert.equal(six.daysLeft, 1);

  const seven = mockState([attempt('exam', NOON - 7 * DAY_MS)], NOON);
  assert.equal(seven.due, true);
  assert.equal(seven.daysSince, 7);
});

test('the latest exam attempt wins, not the first', () => {
  const state = mockState([attempt('exam', NOON - 30 * DAY_MS), attempt('exam', NOON - 2 * DAY_MS)], NOON);
  assert.equal(state.daysSince, 2);
});

test('a garbled time falls back to 19:00 instead of throwing', () => {
  assert.deepEqual(parseTime('7:05'), { h: 7, m: 5 });
  assert.deepEqual(parseTime('25:00'), { h: 19, m: 0 });
  assert.deepEqual(parseTime(''), { h: 19, m: 0 });
  assert.deepEqual(parseTime(undefined), { h: 19, m: 0 });
});

test('the daily reminder fires today while the time is still ahead', () => {
  const at = nextDailyAt('19:00', NOON);
  assert.equal(at, atTime('19:00', NOON));
  assert.ok(at > NOON);
});

test('a time already past today moves to tomorrow', () => {
  const evening = new Date(2026, 7, 18, 20, 30).getTime();
  const at = nextDailyAt('19:00', evening);
  assert.equal(new Date(at).getDate(), 19);
});

// The point of the whole re-scheduling dance: a finished day must not be nagged.
test("today's quota being met pushes the reminder to tomorrow", () => {
  const at = nextDailyAt('19:00', NOON, { doneToday: true });
  assert.equal(new Date(at).getDate(), 19);
  assert.equal(new Date(at).getHours(), 19);
});

test('a due mock is announced at the next reminder time', () => {
  const state = mockState([], NOON);
  assert.equal(nextMockAt('19:00', NOON, state), atTime('19:00', NOON));
});

test('a mock that is not due yet is announced on the day it becomes due', () => {
  const state = mockState([attempt('exam', NOON - 2 * DAY_MS)], NOON);   // daysLeft = 5
  const at = nextMockAt('19:00', NOON, state);
  assert.equal(new Date(at).getDate(), 23);
  assert.ok(at > NOON);
});

// Scheduling in the past is silently dropped by Android, so the "due today but the hour
// has passed" case has to roll forward on its own.
test('a mock due later today rolls to tomorrow once the hour has passed', () => {
  const evening = new Date(2026, 7, 18, 21, 0).getTime();
  const state = { last: {}, daysSince: 3, due: false, daysLeft: 0 };
  const at = nextMockAt('19:00', evening, state);
  assert.ok(at > evening);
  assert.equal(new Date(at).getDate(), 19);
});

// ------------------------------------------------------------ examDatePassed
test('no exam date is never "passed"', () => {
  assert.equal(examDatePassed(null, NOON), false);
  assert.equal(examDatePassed(undefined, NOON), false);
});

test('the exam date itself still counts as today, not passed', () => {
  assert.equal(examDatePassed('2026-08-18', NOON), false);
});

test('a future exam date is not passed', () => {
  assert.equal(examDatePassed('2026-09-01', NOON), false);
});

test('the day after the exam date is passed', () => {
  assert.equal(examDatePassed('2026-08-17', NOON), true);
  assert.equal(examDatePassed('2026-07-01', NOON), true);
});
