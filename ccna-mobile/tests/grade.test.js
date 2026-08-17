import test from 'node:test';
import assert from 'node:assert/strict';
import { isCorrect, ddCorrect, ddExpected, ddNeeded } from '../src/engine/grade.js';

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
