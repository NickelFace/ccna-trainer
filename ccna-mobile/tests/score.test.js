import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreAttempt, toScaled, PASS_SCALED } from '../src/engine/score.js';
import { DOMAINS } from './helpers.js';

const q = (n, dom, a = 'A') => ({ n, dom, y: 'txt', a });
const answers = (...pairs) => Object.fromEntries(pairs.map(([n, given]) => [n, { given }]));

test('scale endpoints and the pass threshold', () => {
  assert.equal(toScaled(0), 300);
  assert.equal(toScaled(100), 1000);
  assert.equal(toScaled(75), 825);
  assert.equal(PASS_SCALED, 825);
});

test('75% is the exact pass line', () => {
  const qs = Array.from({ length: 100 }, (_, i) => q(i, 'NF'));
  const given = Object.fromEntries(qs.map((x, i) => [x.n, { given: [i < 75 ? 'A' : 'B'] }]));
  const r = scoreAttempt(qs, given, DOMAINS);
  assert.equal(r.ok, 75);
  assert.equal(r.pct, 75);
  assert.equal(r.scaled, 825);
  assert.equal(r.pass, true);
});

test('74% falls one point short of passing', () => {
  const qs = Array.from({ length: 100 }, (_, i) => q(i, 'NF'));
  const given = Object.fromEntries(qs.map((x, i) => [x.n, { given: [i < 74 ? 'A' : 'B'] }]));
  const r = scoreAttempt(qs, given, DOMAINS);
  assert.equal(r.scaled, 818);
  assert.equal(r.pass, false);
});

test('the percentage is rounded before it is scaled', () => {
  // 2 of 3 -> pct 67 -> 300 + 0.67 * 700 = 769. Scaling the unrounded 0.6667 would
  // give 767, so this locks the rounding order inherited from finishExam().
  const qs = [q(1, 'NF'), q(2, 'NF'), q(3, 'NF')];
  const r = scoreAttempt(qs, answers([1, ['A']], [2, ['A']], [3, ['B']]), DOMAINS);
  assert.equal(r.pct, 67);
  assert.equal(r.scaled, 769);
});

test('per-domain tallies count asked and correct separately', () => {
  const qs = [q(1, 'NF'), q(2, 'NF'), q(3, 'SEC'), q(4, 'AUT')];
  const r = scoreAttempt(qs, answers([1, ['A']], [2, ['B']], [3, ['A']]), DOMAINS);
  assert.deepEqual(r.perDomain.NF, { ok: 1, tot: 2 });
  assert.deepEqual(r.perDomain.SEC, { ok: 1, tot: 1 });
  assert.deepEqual(r.perDomain.AUT, { ok: 0, tot: 1 });   // unanswered counts as asked
  assert.deepEqual(r.perDomain.IPC, { ok: 0, tot: 0 });   // untouched domain stays present
});

test('review keeps the asked order', () => {
  const qs = [q(5, 'NF'), q(6, 'SEC'), q(7, 'NF')];
  const r = scoreAttempt(qs, answers([6, ['A']]), DOMAINS);
  assert.deepEqual(r.review.map(x => [x.q.n, x.good]), [[5, false], [6, true], [7, false]]);
});

test('an empty set scores 0 rather than NaN', () => {
  const r = scoreAttempt([], {}, DOMAINS);
  assert.equal(r.pct, 0);
  assert.equal(r.scaled, 300);
  assert.equal(r.pass, false);
});

test('a question from an unknown domain is reported, not silently dropped', () => {
  assert.throws(() => scoreAttempt([q(1, 'XXX')], {}, DOMAINS), /domain "XXX"/);
});
