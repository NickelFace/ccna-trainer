import test from 'node:test';
import assert from 'node:assert/strict';
import { plan } from '../src/app/notify.js';
import { dayKey } from '../src/engine/stats.js';
import { DAY_MS } from '../src/engine/srs.js';

// A fixed local moment, same as tests/plan.test.js: 2026-08-18, 12:00 local.
const NOON = new Date(2026, 7, 18, 12, 0, 0, 0).getTime();

const attempt = (mode, at) => ({ id: String(at), mode, date: at, scaled: 800 });

const profile = (over = {}) => ({
  dailyGoal: 30,
  examDate: null,
  ...over,
  notify: { enabled: true, daily: true, weeklyMock: true, time: '19:00', ...(over.notify || {}) },
});

const activityOf = (n, ts = NOON) => ({ [dayKey(ts)]: { total: n, wrong: 0, srs: 0 } });

// ---------------------------------------------------------------- enabled
test('the master switch off schedules nothing, regardless of the two sub-switches', () => {
  const p = profile({ notify: { enabled: false, daily: true, weeklyMock: true } });
  assert.deepEqual(plan(p, {}, [], NOON), []);
});

// ---------------------------------------------------------------- daily
test('daily on schedules a repeating on:{hour,minute} alarm, not a one-shot', () => {
  const out = plan(profile(), activityOf(0), [], NOON);
  const daily = out.find(n => n.id === 1);
  assert.ok(daily, 'daily reminder present');
  assert.deepEqual(daily.schedule.on, { hour: 19, minute: 0 });
  assert.equal(daily.schedule.at, undefined);
});

test('a custom time is reflected in the repeating trigger', () => {
  const out = plan(profile({ notify: { time: '07:05' } }), activityOf(0), [], NOON);
  assert.deepEqual(out.find(n => n.id === 1).schedule.on, { hour: 7, minute: 5 });
});

test('daily off drops the reminder entirely', () => {
  const out = plan(profile({ notify: { daily: false } }), activityOf(0), [], NOON);
  assert.equal(out.find(n => n.id === 1), undefined);
});

test('daily defaults on when the flag is simply absent from an older profile', () => {
  const p = profile();
  delete p.notify.daily;
  const out = plan(p, activityOf(0), [], NOON);
  assert.ok(out.find(n => n.id === 1));
});

// The schedule itself no longer depends on doneToday (a repeating alarm can't be armed
// "just for today") — but the body text quoting today's progress still should, and the
// live suppression of an already-met day happens elsewhere, at delivery time.
test('a day already at quota still schedules the repeating alarm, with the count in the body', () => {
  const out = plan(profile(), activityOf(30), [], NOON);   // goal is 30, 30 already done
  const daily = out.find(n => n.id === 1);
  assert.deepEqual(daily.schedule.on, { hour: 19, minute: 0 });
  assert.match(daily.body, /сделано 30/);
});

test('a day short of quota reports the true count', () => {
  const out = plan(profile(), activityOf(12), [], NOON);
  assert.match(out.find(n => n.id === 1).body, /сделано 12/);
});

// ---------------------------------------------------------------- weeklyMock
test('weeklyMock off drops the mock reminder', () => {
  const out = plan(profile({ notify: { weeklyMock: false } }), {}, [], NOON);
  assert.equal(out.find(n => n.id === 2), undefined);
});

test('weeklyMock on with no attempts yet is announced as one-shot, due now', () => {
  const out = plan(profile(), {}, [], NOON);
  const mock = out.find(n => n.id === 2);
  assert.ok(mock);
  assert.ok(mock.schedule.at instanceof Date);
  assert.match(mock.body, /ещё не проходил/);
});

test('weeklyMock on with a recent attempt reports days since', () => {
  const out = plan(profile(), {}, [attempt('exam', NOON - 2 * DAY_MS)], NOON);
  assert.match(out.find(n => n.id === 2).body, /С прошлого прошло 2 дн/);
});

// ---------------------------------------------------------------- exam date passed
test('an exam date in the future leaves the mock reminder untouched', () => {
  const out = plan(profile({ examDate: '2026-09-01' }), {}, [], NOON);
  assert.ok(out.find(n => n.id === 2));
});

test('an exam date that is today does not count as passed yet', () => {
  const out = plan(profile({ examDate: '2026-08-18' }), {}, [], NOON);
  assert.ok(out.find(n => n.id === 2));
});

test('an exam date fully in the past drops the mock reminder — nothing left to mock for', () => {
  const out = plan(profile({ examDate: '2026-08-01' }), {}, [], NOON);
  assert.equal(out.find(n => n.id === 2), undefined);
});

test('the daily reminder is unaffected by a passed exam date', () => {
  const out = plan(profile({ examDate: '2026-08-01' }), activityOf(0), [], NOON);
  assert.ok(out.find(n => n.id === 1));
});

// ---------------------------------------------------------------- full matrix
test('every enabled × daily × weeklyMock combination schedules exactly the switches that are on', () => {
  for (const enabled of [true, false]) {
    for (const daily of [true, false]) {
      for (const weeklyMock of [true, false]) {
        const p = profile({ notify: { enabled, daily, weeklyMock } });
        const out = plan(p, activityOf(0), [], NOON);
        const expectDaily = enabled && daily;
        const expectMock = enabled && weeklyMock;
        assert.equal(!!out.find(n => n.id === 1), expectDaily, JSON.stringify({ enabled, daily, weeklyMock }));
        assert.equal(!!out.find(n => n.id === 2), expectMock, JSON.stringify({ enabled, daily, weeklyMock }));
      }
    }
  }
});
