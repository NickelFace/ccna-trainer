import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeProfile } from '../src/app/store.js';

// A restored backup or a hand-edited preference file is the one way `dailyGoal` can arrive
// as anything other than what onboarding/Профиль ever write — this is the guard against it.
test('a garbage dailyGoal from a restored backup falls back to the default', () => {
  for (const junk of [0, -5, 1.5, NaN, '30', null, undefined, {}, []]) {
    assert.equal(mergeProfile({ dailyGoal: junk }).dailyGoal, 30, `junk: ${JSON.stringify(junk)}`);
  }
});

test('a valid dailyGoal from a backup is kept as-is', () => {
  assert.equal(mergeProfile({ dailyGoal: 60 }).dailyGoal, 60);
  assert.equal(mergeProfile({ dailyGoal: 1 }).dailyGoal, 1);
});

test('a profile with no stored dailyGoal at all still gets the default', () => {
  assert.equal(mergeProfile({}).dailyGoal, 30);
  assert.equal(mergeProfile(null).dailyGoal, 30);
});

// notify stays merged key-by-key even when dailyGoal needed correcting alongside it.
test('dailyGoal validation does not disturb the notify merge', () => {
  const p = mergeProfile({ dailyGoal: 0, notify: { daily: false } });
  assert.equal(p.dailyGoal, 30);
  assert.equal(p.notify.daily, false);
  assert.equal(p.notify.weeklyMock, true);   // default, not present in the stored object
});
