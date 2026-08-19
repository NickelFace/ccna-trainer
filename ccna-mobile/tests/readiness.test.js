import test from 'node:test';
import assert from 'node:assert/strict';
import { readiness, readinessDelta, UNSEEN_FACTOR } from '../src/engine/readiness.js';
import { toScaled } from '../src/engine/score.js';
import { DOMAINS } from './helpers.js';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

// n questions in one domain, `right` of them answered correctly
const bankFor = spec => {
  const qs = [];
  let n = 1;
  for (const [dom, { tot }] of Object.entries(spec)) {
    for (let i = 0; i < tot; i++) qs.push({ n: n++, dom, y: 'txt', a: 'A', o: { A: 'a', B: 'b' } });
  }
  return qs;
};

const attemptFor = (spec, { date = NOW, id = '1' } = {}) => {
  const qs = bankFor(spec);
  const byN = new Map(qs.map(q => [q.n, q]));
  const answers = {};
  const left = Object.fromEntries(Object.entries(spec).map(([dom, s]) => [dom, s.right]));
  for (const q of qs) {
    const right = left[q.dom] > 0;
    if (right) left[q.dom]--;
    answers[q.n] = { given: [right ? 'A' : 'B'] };
  }
  return { attempt: { id, date, qs: qs.map(q => q.n), answers }, byN };
};

test('with every domain covered the forecast is the plain weighted share', () => {
  // 100% in every domain -> share 1.0 -> the top of the scale.
  const spec = Object.fromEntries(DOMAINS.map(d => [d.id, { tot: 10, right: 10 }]));
  const { attempt, byN } = attemptFor(spec);
  const r = readiness([attempt], byN, DOMAINS);
  assert.equal(r.pct, 100);
  assert.equal(r.forecast, 1000);
  assert.equal(r.covered, 100);
  assert.equal(r.sample, 60);
});

test('a uniform 60% across all domains maps straight onto the scale', () => {
  const spec = Object.fromEntries(DOMAINS.map(d => [d.id, { tot: 10, right: 6 }]));
  const { attempt, byN } = attemptFor(spec);
  const r = readiness([attempt], byN, DOMAINS);
  assert.equal(r.pct, 60);
  assert.equal(r.forecast, toScaled(60));
});

test('domains are weighted by the blueprint, not counted equally', () => {
  // Perfect in IPC (weight .25), zero in AUT (weight .10), nothing else answered.
  const { attempt, byN } = attemptFor({ IPC: { tot: 10, right: 10 }, AUT: { tot: 10, right: 0 } });
  const r = readiness([attempt], byN, DOMAINS);
  const covered = 0.25 + 0.10;
  const measured = (0.25 * 1 + 0.10 * 0) / covered;
  const expected = Math.round((0.25 * 1 + (1 - covered) * measured * UNSEEN_FACTOR) * 100);
  assert.equal(r.pct, expected);
  assert.equal(r.covered, 35);
});

test('drilling one easy domain does not buy a flattering forecast', () => {
  // 100% correct, but only IP Connectivity was ever answered.
  const { attempt, byN } = attemptFor({ IPC: { tot: 40, right: 40 } });
  const narrow = readiness([attempt], byN, DOMAINS);
  const spec = Object.fromEntries(DOMAINS.map(d => [d.id, { tot: 10, right: 10 }]));
  const full = attemptFor(spec);
  const broad = readiness([full.attempt], full.byN, DOMAINS);

  assert.equal(narrow.pct, Math.round((0.25 + 0.75 * UNSEEN_FACTOR) * 100));
  assert.ok(narrow.pct < broad.pct, 'narrow coverage must score below full coverage');
  assert.equal(broad.pct, 100);
});

test('the window keeps only the most recent answers', () => {
  const old = attemptFor({ NF: { tot: 50, right: 0 } }, { id: 'old', date: NOW - 10 * DAY });
  const fresh = attemptFor({ NF: { tot: 50, right: 50 } }, { id: 'new', date: NOW });
  const byN = new Map([...old.byN, ...fresh.byN]);
  // Numbering restarts per fixture, so the newer attempt shadows the older one entirely.
  const r = readiness([old.attempt, fresh.attempt], byN, DOMAINS, { window: 50 });
  assert.equal(r.sample, 50);
  assert.equal(r.perDomain.NF.pct, 100);
});

test('a repetition (srs) attempt is excluded from the forecast window', () => {
  // Repetition deliberately re-serves material already flagged wrong — counting it would
  // punish the exact behavior spaced repetition asks for.
  const spec = Object.fromEntries(DOMAINS.map(d => [d.id, { tot: 10, right: 10 }]));
  const { attempt, byN } = attemptFor(spec);
  attempt.mode = 'srs';
  const r = readiness([attempt], byN, DOMAINS);
  assert.equal(r.forecast, null);      // the only attempt is srs — nothing left in the window
  assert.equal(r.sample, 0);
});

test('an srs attempt answered badly does not drag down a good exam forecast', () => {
  const spec = Object.fromEntries(DOMAINS.map(d => [d.id, { tot: 10, right: 10 }]));
  const good = attemptFor(spec, { id: 'exam' });
  good.attempt.mode = 'exam';
  const bad = attemptFor(spec, { id: 'srs' });
  bad.attempt.mode = 'srs';
  bad.attempt.answers = Object.fromEntries(
    Object.keys(bad.attempt.answers).map(n => [n, { given: ['B'] }]));   // wrong on everything
  const byN = new Map([...good.byN, ...bad.byN]);

  const r = readiness([good.attempt, bad.attempt], byN, DOMAINS);
  assert.equal(r.sample, 60);          // only the exam's 60 answers, the srs run is excluded
  assert.equal(r.pct, 100);
});

test('no history at all yields no forecast rather than a zero', () => {
  const r = readiness([], new Map(), DOMAINS);
  assert.equal(r.forecast, null);
  assert.equal(r.sample, 0);
});

test('unanswered questions in an attempt are not counted as wrong', () => {
  const { attempt, byN } = attemptFor({ NF: { tot: 10, right: 10 } });
  delete attempt.answers[3];
  delete attempt.answers[4];
  const r = readiness([attempt], byN, DOMAINS);
  assert.equal(r.sample, 8);
  assert.equal(r.perDomain.NF.pct, 100);
});

test('the weekly delta compares against the history as it stood back then', () => {
  const weak = attemptFor({ NF: { tot: 20, right: 5 } }, { id: 'a', date: NOW - 14 * DAY });
  const strong = attemptFor({ NF: { tot: 20, right: 18 } }, { id: 'b', date: NOW });
  const byN = new Map([...weak.byN, ...strong.byN]);
  const attempts = [weak.attempt, strong.attempt];

  const delta = readinessDelta(attempts, byN, DOMAINS, NOW - 7 * DAY, { window: 20 });
  assert.ok(delta > 0, 'improving should show a positive delta');

  // Nothing older than the cut-off means there is nothing to compare against.
  assert.equal(readinessDelta([strong.attempt], byN, DOMAINS, NOW - 7 * DAY), null);
});
