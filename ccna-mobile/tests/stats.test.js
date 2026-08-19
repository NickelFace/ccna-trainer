import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toneFor, scoreTone, msPerQuestion, scaledDelta, pointsToPass,
  topicStats, weakTopics, weakDomains, mistakesOf, isScored, scoredAttempts,
  dayKey, normalizeActivity, dayStats, recentDays, answeredOn, answeredTotal, streakDays,
} from '../src/engine/stats.js';
import { DOMAINS } from './helpers.js';

const q = (n, tp, dom = 'NF', a = 'A') => ({ n, tp, dom, y: 'txt', a, o: { A: 'a', B: 'b' } });

const BANK = [
  q(1, 'OSPF', 'IPC'), q(2, 'OSPF', 'IPC'), q(3, 'OSPF', 'IPC'),
  q(4, 'NAT', 'IPS'), q(5, 'NAT', 'IPS'), q(6, 'NAT', 'IPS'), q(7, 'NAT', 'IPS'),
  q(8, 'General', 'NF'), q(9, 'General', 'NF'), q(10, 'General', 'NF'),
  q(11, 'DHCP', 'IPS'), q(12, 'DHCP', 'IPS'),
];
const byN = new Map(BANK.map(x => [x.n, x]));

// wrong on 1,2 (OSPF), 4 (NAT), 8,9 (General), 11 (DHCP); right on the rest
const attempt = (over = {}) => ({
  id: '1', date: 1, mode: 'exam', scaled: 800, pct: 50, ok: 6, total: 12,
  durationMs: 12 * 90_000,
  qs: BANK.map(x => x.n),
  answers: Object.fromEntries(BANK.map(x => [x.n, { given: [[1, 2, 4, 8, 9, 11].includes(x.n) ? 'B' : 'A'] }])),
  perDomain: { NF: { ok: 1, tot: 3 }, NA: { ok: 0, tot: 0 }, IPC: { ok: 1, tot: 3 }, IPS: { ok: 4, tot: 6 }, SEC: { ok: 0, tot: 0 }, AUT: { ok: 0, tot: 0 } },
  ...over,
});

test('bar tone follows the 82 / 60 thresholds', () => {
  assert.equal(toneFor(82), 'ok');
  assert.equal(toneFor(81), 'warn');
  assert.equal(toneFor(60), 'warn');
  assert.equal(toneFor(59), 'err');
});

test('the score tone runs off the 300..1000 scale, not off the percentage', () => {
  assert.equal(scoreTone(825), 'ok');                // exactly the pass mark
  assert.equal(scoreTone(867), 'ok');
  assert.equal(scoreTone(824), 'warn');
  assert.equal(scoreTone(780), 'warn');
  assert.equal(scoreTone(779), 'err');
  // 867 scaled is 81% raw; reading the tone off the percentage would paint a pass amber.
  assert.notEqual(scoreTone(867), toneFor(81));
});

test('average time per question, and no division by zero on an empty attempt', () => {
  assert.equal(msPerQuestion(attempt()), 90_000);
  assert.equal(msPerQuestion({ total: 0, durationMs: 5000 }), 0);
});

test('delta compares against the previous attempt only', () => {
  const list = [{ scaled: 700 }, { scaled: 812 }, { scaled: 790 }];
  assert.equal(scaledDelta(list, 0), null);          // nothing to compare the first one to
  assert.equal(scaledDelta(list, 1), 112);
  assert.equal(scaledDelta(list, 2), -22);
  assert.equal(scaledDelta(list), -22);              // defaults to the latest
  assert.equal(scaledDelta([]), null);
});

test('points to pass is signed — negative once the threshold is cleared', () => {
  assert.equal(pointsToPass({ scaled: 812 }), 13);
  assert.equal(pointsToPass({ scaled: 825 }), 0);
  assert.equal(pointsToPass({ scaled: 900 }), -75);
});

test('only a blueprint-weighted attempt is scored', () => {
  assert.equal(isScored({ weighted: true }), true);
  assert.equal(isScored({ weighted: false }), false);
  assert.equal(isScored({}), false);                  // practice/srs attempts carry no flag at all
  const list = [{ id: 'a', weighted: true }, { id: 'b', weighted: false }, { id: 'c', weighted: true }];
  assert.deepEqual(scoredAttempts(list).map(a => a.id), ['a', 'c']);
});

test('topic stats aggregate every attempt and sort worst first', () => {
  const rows = topicStats([attempt()], byN);
  const byTopic = Object.fromEntries(rows.map(r => [r.topic, r]));
  assert.deepEqual(
    { ok: byTopic.OSPF.ok, tot: byTopic.OSPF.tot, pct: byTopic.OSPF.pct },
    { ok: 1, tot: 3, pct: 33 });
  assert.deepEqual(
    { ok: byTopic.NAT.ok, tot: byTopic.NAT.tot, pct: byTopic.NAT.pct },
    { ok: 3, tot: 4, pct: 75 });
  assert.ok(rows[0].pct <= rows[rows.length - 1].pct);
});

test('two attempts of the same topic accumulate rather than replace', () => {
  const rows = topicStats([attempt(), attempt({ id: '2' })], byN);
  const ospf = rows.find(r => r.topic === 'OSPF');
  assert.deepEqual({ ok: ospf.ok, tot: ospf.tot }, { ok: 2, tot: 6 });
});

test('weak topics drop the catch-all tag, the rare ones and the solid ones', () => {
  const weak = weakTopics([attempt()], byN, { minAsked: 3, below: 75 });
  const names = weak.map(r => r.topic);
  assert.ok(names.includes('OSPF'));                 // 33% over 3 questions
  assert.ok(!names.includes('General'));             // never a study target
  assert.ok(!names.includes('DHCP'));                // only 2 questions asked
  assert.ok(!names.includes('NAT'));                 // 75% is not weak
});

test('weak domains rank the worst covered ones and ignore untouched ones', () => {
  const weak = weakDomains(attempt(), DOMAINS, { limit: 2 });
  assert.deepEqual(weak.map(d => d.id), ['NF', 'IPC']);   // both 33%, NF listed first
  assert.equal(weak.every(d => d.tot > 0), true);
});

test('mistakes keep the asked order', () => {
  assert.deepEqual(mistakesOf(attempt(), byN), [1, 2, 4, 8, 9, 11]);
});

test('a question dropped from the bank is skipped, not counted as wrong', () => {
  const stale = attempt({ qs: [1, 2, 999], answers: { 1: { given: ['A'] }, 2: { given: ['A'] } } });
  const rows = topicStats([stale], byN);
  assert.equal(rows.reduce((n, r) => n + r.tot, 0), 2);
  assert.deepEqual(mistakesOf(stale, byN), []);
});

// ---------------------------------------------------------------- daily activity
const DAY = 86_400_000;
// Midday local time, so adding or subtracting whole days can never trip over a DST edge
// and land on the same calendar date twice.
const NOON = new Date(2026, 7, 17, 12, 0, 0).getTime();
const activityFor = (...offsets) =>
  Object.fromEntries(offsets.map(d => [dayKey(NOON - d * DAY), { total: 5, wrong: 1, srs: 2 }]));

test('the day key follows local midnight', () => {
  const justBefore = new Date(2026, 7, 17, 23, 59, 59).getTime();
  const justAfter = new Date(2026, 7, 18, 0, 0, 1).getTime();
  assert.equal(dayKey(justBefore), '2026-08-17');
  assert.equal(dayKey(justAfter), '2026-08-18');
});

test('a bare number from before wrong/srs existed migrates to zeros for them', () => {
  const migrated = normalizeActivity({ '2026-08-10': 5, '2026-08-11': { total: 3, wrong: 1, srs: 0 } });
  assert.deepEqual(migrated['2026-08-10'], { total: 5, wrong: 0, srs: 0 });
  assert.deepEqual(migrated['2026-08-11'], { total: 3, wrong: 1, srs: 0 });   // already current shape, untouched
  assert.deepEqual(normalizeActivity(null), {});
  assert.deepEqual(normalizeActivity(undefined), {});
});

test('a single day\'s counters, defaulting to zero on a day with nothing', () => {
  const activity = activityFor(0);
  assert.deepEqual(dayStats(activity, NOON), { total: 5, wrong: 1, srs: 2 });
  assert.deepEqual(dayStats(activity, NOON - DAY), { total: 0, wrong: 0, srs: 0 });
  assert.deepEqual(dayStats({}, NOON), { total: 0, wrong: 0, srs: 0 });
});

test('recentDays returns oldest-first over the requested window, zero-filled', () => {
  const activity = activityFor(0, 2);
  const days = recentDays(activity, NOON, 3);
  assert.equal(days.length, 3);
  assert.deepEqual(days.map(d => d.key), [dayKey(NOON - 2 * DAY), dayKey(NOON - DAY), dayKey(NOON)]);
  assert.equal(days[0].total, 5);      // 2 days ago
  assert.equal(days[1].total, 0);      // yesterday, untouched
  assert.equal(days[2].total, 5);      // today
});

test('today, and the running total', () => {
  const activity = activityFor(0, 1, 4);
  assert.equal(answeredOn(activity, NOON), 5);
  assert.equal(answeredOn(activity, NOON - 2 * DAY), 0);
  assert.equal(answeredTotal(activity), 15);
  assert.equal(answeredTotal({}), 0);
});

test('the streak counts back from today over consecutive days', () => {
  assert.equal(streakDays(activityFor(0, 1, 2), NOON), 3);
  assert.equal(streakDays(activityFor(0, 1, 3), NOON), 2);   // gap on day 2 ends it
  assert.equal(streakDays({}, NOON), 0);
});

test('a day that has not been worked yet does not break the streak', () => {
  // Nothing answered today, but yesterday and the day before were — the streak is alive
  // until the day actually ends.
  assert.equal(streakDays(activityFor(1, 2, 3), NOON), 3);
  // Two idle days in a row does break it.
  assert.equal(streakDays(activityFor(2, 3), NOON), 0);
});
