// What ages out, what does not, and the property the whole rule rests on: pruning twice
// changes nothing the second time, because the sync applies it on every exchange.
import test from 'node:test';
import assert from 'node:assert/strict';
import { KEEP_DAYS, pruneAttempts, pruneState } from '../../ccna-exam-simulator/assets/js/shared/retention.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 24, 12, 0, 0);
const at = days => NOW - days * DAY;

const attempt = (id, days) => ({ id, date: at(days), mode: 'exam', scaled: 800, answers: {}, qs: [] });

test('six months is the line', () => {
  assert.equal(KEEP_DAYS, 183);
  const attempts = [attempt('ancient', 400), attempt('just-out', 184), attempt('just-in', 182), attempt('today', 0)];
  assert.deepEqual(pruneAttempts(attempts, NOW).map(a => a.id), ['just-in', 'today']);
});

test('nothing to drop returns the very same array', () => {
  const attempts = [attempt('a', 1), attempt('b', 100)];
  assert.equal(pruneAttempts(attempts, NOW), attempts, 'so a caller can tell nothing happened');
});

test('an attempt with no usable date is kept', () => {
  // Unknown age is not proof of old age, and there is no second chance to find out.
  const attempts = [{ id: 'nodate' }, { id: 'zero', date: 0 }, { id: 'junk', date: 'yesterday' }, attempt('old', 400)];
  assert.deepEqual(pruneAttempts(attempts, NOW).map(a => a.id), ['nodate', 'zero', 'junk']);
});

test('junk in place of a history is an empty history, not a crash', () => {
  assert.deepEqual(pruneAttempts(undefined, NOW), []);
  assert.deepEqual(pruneAttempts('nope', NOW), []);
});

test('pruning a state touches the attempts and nothing else', () => {
  const state = {
    profile: { deviceId: 'web-a' },
    attempts: [attempt('old', 400), attempt('new', 3)],
    srs: { 1: { box: 4, dueAt: 1, at: at(400) } },
    activity: { '2025-01-01': { 'web-a': { total: 5, wrong: 1, srs: 0 } } },
    book: { read: { 'ch-1': at(400) } },
  };
  const pruned = pruneState(state, NOW);
  assert.deepEqual(pruned.attempts.map(a => a.id), ['new']);
  // A question learned a year ago is still learned; a day worked a year ago still counts
  // toward the strip; a chapter read a year ago is still read.
  assert.deepEqual(pruned.srs, state.srs);
  assert.deepEqual(pruned.activity, state.activity);
  assert.deepEqual(pruned.book, state.book);
  assert.notEqual(pruned, state);
});

test('a state with nothing to lose comes back as itself', () => {
  const state = { attempts: [attempt('a', 5)] };
  assert.equal(pruneState(state, NOW), state);
});

test('pruning is idempotent, which is what lets the sync do it every time', () => {
  const state = { attempts: [attempt('old', 400), attempt('new', 3)] };
  const once = pruneState(state, NOW);
  assert.equal(pruneState(once, NOW), once);
});
