// The matching board's two counters. 30 of the bank's 159 drag-and-drop questions carry
// distractors — items that belong in no bucket and have to stay in the bank for the answer
// to be right (132, 136, 175, 182, 193 among them). Counting them as progress is what let
// "Проверить" light up over an unfinished board.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ddNeeded } from '../src/engine/grade.js';
import { syncMatch, resetMatch, placedCount, filledCount, matchComplete, canCheck } from '../src/app/match.js';

// Four items with a home, two distractors — the shape of question 132 (7 items, 4 slots).
const q = () => ({
  n: 132, y: 'dd', dom: 'IPC',
  dd: {
    items: ['a1', 'a2', 'b1', 'b2', 'x1', 'x2'],
    buckets: [
      { label: 'A', correct: ['a1', 'a2'] },
      { label: 'B', correct: ['b1', 'b2'] },
    ],
  },
});

// The module reads its board back out of the session, which is how a revisited question
// comes back the way it was left — and the only way in without a DOM to tap.
const board = placement => {
  const question = q();
  resetMatch();
  syncMatch(question, { answers: { [question.n]: { placement } } });
  return question;
};

test('an untouched board fills nothing', () => {
  const question = board({});
  assert.equal(placedCount(), 0);
  assert.equal(filledCount(question), 0);
  assert.equal(matchComplete(question), false);
});

test('every slot filled completes the board', () => {
  const question = board({ 0: 0, 1: 0, 2: 1, 3: 1 });
  assert.equal(filledCount(question), ddNeeded(question));
  assert.equal(matchComplete(question), true);
});

test('distractors on the board do not complete it', () => {
  // Two real items and both distractors: four chips placed, but half the answer is still
  // in the bank. "Проверить" used to enable here and grade the question wrong.
  const question = board({ 0: 0, 1: 0, 4: 0, 5: 1 });
  assert.equal(placedCount(), 4);
  assert.equal(filledCount(question), 2);
  assert.equal(matchComplete(question), false);
});

test('the readout never runs past the number of slots', () => {
  // Everything in the buckets, distractors included — the header used to read «6 из 4».
  const question = board({ 0: 0, 1: 0, 2: 1, 3: 1, 4: 0, 5: 1 });
  assert.equal(placedCount(), 6);                       // «Сброс» still has work to do
  assert.equal(filledCount(question), ddNeeded(question));
  assert.equal(ddNeeded(question), 4);
});

// Regression: a board full of chips must always be gradeable.
//
// The gate used to be matchComplete, which counts only the chips that belong somewhere.
// Park a distractor in a slot and it fills that slot on screen without moving the count, so
// on question 132 (four slots, seven chips, three belonging nowhere) every bucket could be
// full with «Проверить» still disabled and no move left that would satisfy it.
test('a board full of distractors can still be checked', () => {
  const question = board({ 4: 0, 5: 1 });      // both distractors placed, nothing else
  assert.equal(filledCount(question), 0, 'neither distractor counts toward the answer');
  assert.equal(matchComplete(question), false, 'and the answer is indeed not complete');
  assert.equal(canCheck(), true, 'but there is something to grade, so the button is live');
});

test('an untouched board has nothing to grade', () => {
  board({});
  assert.equal(canCheck(), false);
});
