import test from 'node:test';
import assert from 'node:assert/strict';
import { isCorrect, ddCorrect, ddExpected, ddFilled, ddNeeded, isEmptyAnswer,
         ddPositional, ddItemRight } from '../src/engine/grade.js';
import { loadBank } from './helpers.js';

const mc = a => ({ n: 1, y: 'txt', dom: 'NF', a });

// Three items belong in buckets, "uses SNMP" belongs nowhere — a distractor that has to
// stay in the bank for the answer to be right.
const dd = () => ({
  n: 2, y: 'dd', dom: 'IPS',
  dd: {
    items: ['uses port 69', 'uses ports 20 and 21', 'uses TCP', 'uses SNMP'],
    buckets: [
      { label: 'FTP', correct: ['uses ports 20 and 21', 'uses TCP'] },
      { label: 'TFTP', correct: ['uses port 69'] },
    ],
  },
});

test('multiple choice ignores the order the letters were picked in', () => {
  assert.equal(isCorrect(mc('AD'), { given: ['D', 'A'] }), true);
  assert.equal(isCorrect(mc('AD'), { given: ['A', 'D'] }), true);
});

test('a partial multi-select answer is wrong', () => {
  assert.equal(isCorrect(mc('AD'), { given: ['A'] }), false);
  assert.equal(isCorrect(mc('AD'), { given: ['A', 'D', 'B'] }), false);
});

test('no answer at all is wrong', () => {
  assert.equal(isCorrect(mc('A'), undefined), false);
  assert.equal(isCorrect(mc('A'), { given: [] }), false);
});

test('ddExpected maps items to buckets and marks distractors null', () => {
  assert.deepEqual(ddExpected(dd()), [1, 0, 0, null]);
});

test('ddNeeded counts only the items that have a home', () => {
  assert.equal(ddNeeded(dd()), 3);            // 4 items, 1 of them a distractor
});

test('everything in its bucket and the distractor left in the bank is correct', () => {
  assert.equal(ddCorrect(dd(), { 0: 1, 1: 0, 2: 0 }), true);
});

test('placing the distractor anywhere makes the answer wrong', () => {
  assert.equal(ddCorrect(dd(), { 0: 1, 1: 0, 2: 0, 3: 0 }), false);
});

test('a swapped pair and an unplaced item are both wrong', () => {
  assert.equal(ddCorrect(dd(), { 0: 0, 1: 1, 2: 0 }), false);
  assert.equal(ddCorrect(dd(), { 0: 1, 1: 0 }), false);
});

test('isCorrect routes drag-and-drop through ddCorrect', () => {
  assert.equal(isCorrect(dd(), { placement: { 0: 1, 1: 0, 2: 0 } }), true);
  assert.equal(isCorrect(dd(), { placement: {} }), false);
  assert.equal(isCorrect(dd(), {}), false);
});

test('ddFilled counts filled slots, not placed chips', () => {
  assert.equal(ddFilled(dd(), {}), 0);
  assert.equal(ddFilled(dd(), { 0: 1, 1: 0, 2: 0 }), 3);
  // The distractor is on the board but fills nothing, so two of the three slots are still
  // open — this is the count "Проверить" and the header readout both go by.
  assert.equal(ddFilled(dd(), { 0: 1, 3: 0 }), 1);
  // Never more than ddNeeded, however much is piled into the buckets.
  assert.equal(ddFilled(dd(), { 0: 1, 1: 0, 2: 0, 3: 0 }), ddNeeded(dd()));
});

test('a slot filled from the wrong bucket is still filled', () => {
  // Wrong, but finished: the board is complete enough to be checked, and checking it is
  // how the user finds out it is wrong.
  assert.equal(ddFilled(dd(), { 0: 0, 1: 1, 2: 1 }), 3);
  assert.equal(ddCorrect(dd(), { 0: 0, 1: 1, 2: 1 }), false);
});

test('an answer emptied of its last selection is an empty answer', () => {
  assert.equal(isEmptyAnswer({ given: [] }), true);
  assert.equal(isEmptyAnswer({ placement: {} }), true);
  assert.equal(isEmptyAnswer({ given: ['A'] }), false);
  assert.equal(isEmptyAnswer({ placement: { 0: 1 } }), false);
});

test('a graded answer is never empty, whatever its shape', () => {
  assert.equal(isEmptyAnswer({ given: [], ok: false }), false);
  assert.equal(isEmptyAnswer({ placement: {}, ok: false }), false);
});

// A few questions number their targets and say the arrangement is free — "drag the
// characteristics onto any position on the right" (#1001, #592) — or repeat one word across
// every target (#261). Marking those on the mapping fails an answer that has all four right
// characteristics simply because they went in a different order.
const positional = () => ({
  n: 1001,
  t: 'Drag and drop the characteristics of northbound APIs from the left onto any position on the right. Not all characteristics are used.',
  dd: {
    items: ['a', 'b', 'x', 'c', 'y', 'd', 'z'],
    buckets: [
      { label: '1', correct: ['a'] }, { label: '2', correct: ['b'] },
      { label: '3', correct: ['c'] }, { label: '4', correct: ['d'] },
    ],
  },
});

// #383 numbers its targets too, but asks for administrative distance "beginning with the
// lowest and ending with the highest". There the numbers are the answer.
const ordered = () => ({
  n: 383,
  t: 'Drag each route source from the left to the numbers on the right. Beginning with the lowest and ending with the highest administrative distance.',
  dd: {
    items: ['a', 'b'],
    buckets: [{ label: '1', correct: ['a'] }, { label: '2', correct: ['b'] }],
  },
});

test('interchangeable targets are marked on the set, not the arrangement', () => {
  const q = positional();
  assert.equal(ddPositional(q), true);
  // Every right characteristic placed, all four in the "wrong" positions.
  assert.equal(ddCorrect(q, { 0: 2, 1: 0, 3: 3, 5: 1 }), true);
  // Same arrangement freedom does not excuse a distractor taking a position.
  assert.equal(ddCorrect(q, { 0: 0, 1: 1, 2: 2, 5: 3 }), false);
  // Nor leaving a position empty.
  assert.equal(ddCorrect(q, { 0: 0, 1: 1, 3: 2 }), false);
});

test('a stem that asks for an order still wants that order', () => {
  const q = ordered();
  assert.equal(ddPositional(q), false);
  assert.equal(ddCorrect(q, { 0: 0, 1: 1 }), true);
  assert.equal(ddCorrect(q, { 0: 1, 1: 0 }), false);
});

test('the review does not cross out a right item sitting in another position', () => {
  const q = positional();
  const placement = { 0: 2, 1: 0, 3: 3, 5: 1 };
  assert.equal(ddItemRight(q, placement, 0), true);
  assert.equal(ddItemRight(q, placement, 2), false, 'a distractor is never right');
});

// The whole bank, as a guard: every question's own answer key must still grade correct, and
// a rotation of it must still fail wherever the targets are not interchangeable.
test('the set rule loosens three questions and nothing else', () => {
  const { questions } = loadBank();
  const dd = questions.filter(q => q.y === 'dd' && q.dd);
  const positional = dd.filter(ddPositional).map(q => q.n);
  assert.deepEqual(positional, [261, 592, 1001]);

  for (const q of dd) {
    const key = {};
    q.dd.buckets.forEach((b, bi) => b.correct.forEach(txt => {
      const i = q.dd.items.indexOf(txt); if (i >= 0) key[i] = bi;
    }));
    assert.equal(ddCorrect(q, key), true, `#${q.n}: its own key stopped grading`);
    if (q.dd.buckets.length < 2 || ddPositional(q)) continue;
    const rotated = {};
    for (const [i, bi] of Object.entries(key)) rotated[i] = (+bi + 1) % q.dd.buckets.length;
    assert.equal(ddCorrect(q, rotated), false, `#${q.n}: an ordered question went soft`);
  }
});
