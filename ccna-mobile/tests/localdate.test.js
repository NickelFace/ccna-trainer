import test from 'node:test';
import assert from 'node:assert/strict';
import { daysUntil } from '../src/engine/localdate.js';

// Sydney is UTC+10 (AEST) / UTC+11 (AEDT) — well east of UTC, so parsing a stored
// 'YYYY-MM-DD' as UTC midnight (`new Date(iso)`) lands it hours into the *previous* local
// day. Pin the zone rather than relying on the runner's own TZ.
process.env.TZ = 'Australia/Sydney';

test('no date set is null, not a countdown to nothing', () => {
  assert.equal(daysUntil(null), null);
  assert.equal(daysUntil(undefined), null);
});

test('exam day itself is 0 for the whole local day, not just after ~10-11am UTC', () => {
  // Local midnight of 2026-08-20, an hour after the day starts — `new Date(iso)` would
  // still read this as 2026-08-19 in UTC and report "1 day left".
  const justAfterMidnight = new Date(2026, 7, 20, 0, 30).getTime();
  assert.equal(daysUntil('2026-08-20', justAfterMidnight), 0);

  const lateEvening = new Date(2026, 7, 20, 23, 30).getTime();
  assert.equal(daysUntil('2026-08-20', lateEvening), 0);
});

test('tomorrow is 1 regardless of the time of day now', () => {
  const earlyMorning = new Date(2026, 7, 19, 0, 5).getTime();
  const lateNight = new Date(2026, 7, 19, 23, 55).getTime();
  assert.equal(daysUntil('2026-08-20', earlyMorning), 1);
  assert.equal(daysUntil('2026-08-20', lateNight), 1);
});

test('a date already past is negative — days since, not clamped to 0', () => {
  const now = new Date(2026, 7, 20, 12, 0).getTime();
  assert.equal(daysUntil('2026-08-19', now), -1);
  assert.equal(daysUntil('2026-08-10', now), -10);
});

test('crossing the AEDT->AEST clock-back (2026-04-05, a 25-hour local day)', () => {
  const beforeChange = new Date(2026, 3, 4, 12, 0).getTime();  // 2026-04-04 noon
  assert.equal(daysUntil('2026-04-05', beforeChange), 1);
  assert.equal(daysUntil('2026-04-06', beforeChange), 2);
});

test('crossing the AEST->AEDT clock-forward (2026-10-04, a 23-hour local day)', () => {
  const beforeChange = new Date(2026, 9, 3, 12, 0).getTime();  // 2026-10-03 noon
  assert.equal(daysUntil('2026-10-04', beforeChange), 1);
  assert.equal(daysUntil('2026-10-05', beforeChange), 2);
});
