import test from 'node:test';
import assert from 'node:assert/strict';
import { firstUnansweredIndex, answeredCount } from '../src/app/session.js';

const session = (qs, ...answered) => ({
  qs,
  answers: Object.fromEntries(answered.map(n => [n, { given: ['A'] }])),
});

test('a fully answered session has no gap', () => {
  const s = session([10, 20, 30], 10, 20, 30);
  assert.equal(firstUnansweredIndex(s), -1);
  assert.equal(answeredCount(s), 3);
});

test('the gap is the position in the session, not the question number', () => {
  const s = session([10, 20, 30], 10, 30);
  assert.equal(firstUnansweredIndex(s), 1);
  assert.equal(answeredCount(s), 2);
});

test('the first gap wins when several were skipped', () => {
  const s = session([10, 20, 30, 40], 30);
  assert.equal(firstUnansweredIndex(s), 0);
  assert.equal(answeredCount(s), 1);
});

test('an untouched session points at its own first question', () => {
  const s = session([10, 20]);
  assert.equal(firstUnansweredIndex(s), 0);
  assert.equal(answeredCount(s), 0);
});
