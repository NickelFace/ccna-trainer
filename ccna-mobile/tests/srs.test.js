import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nextState, isDue, dueQueue, dueCount, nextDueAt, boxHistogram,
  intervalMs, INTERVAL_DAYS, MAX_BOX, DAY_MS,
} from '../src/engine/srs.js';

const NOW = 1_800_000_000_000;
const days = n => n * DAY_MS;

test('intervals are the specified 1 / 3 / 7 / 16 / 35 days', () => {
  assert.deepEqual(INTERVAL_DAYS, [1, 3, 7, 16, 35]);
  assert.equal(intervalMs(1), days(1));
  assert.equal(intervalMs(5), days(35));
  assert.equal(intervalMs(9), days(35));       // clamped at the top box
  assert.equal(intervalMs(0), days(1));        // and at the bottom
});

test('a wrong answer drops to box 1 and returns tomorrow', () => {
  const s = nextState({ box: 4, seenCount: 6 }, false, NOW);
  assert.equal(s.box, 1);
  assert.equal(s.dueAt, NOW + days(1));
  assert.equal(s.lastResult, false);
  assert.equal(s.seenCount, 7);
});

test('a first sighting answered right starts at box 2, not box 1', () => {
  // Box 1 would make a question you already know due again tomorrow — busywork.
  const s = nextState(undefined, true, NOW);
  assert.equal(s.box, 2);
  assert.equal(s.dueAt, NOW + days(3));
  assert.equal(s.seenCount, 1);
});

test('a first sighting answered wrong starts at box 1', () => {
  const s = nextState(undefined, false, NOW);
  assert.equal(s.box, 1);
  assert.equal(s.dueAt, NOW + days(1));
});

test('right answers walk the boxes up and stop at the top', () => {
  let s;
  const boxes = [];
  for (let i = 0; i < 7; i++) { s = nextState(s, true, NOW); boxes.push(s.box); }
  assert.deepEqual(boxes, [2, 3, 4, 5, 5, 5, 5]);
  assert.equal(s.dueAt, NOW + days(35));
  assert.equal(MAX_BOX, 5);
});

test('due-ness is inclusive of the exact moment', () => {
  assert.equal(isDue({ dueAt: NOW }, NOW), true);
  assert.equal(isDue({ dueAt: NOW + 1 }, NOW), false);
  assert.equal(isDue(undefined, NOW), false);
});

const SRS = {
  10: { box: 3, dueAt: NOW - days(1) },        // due, comfortable box
  11: { box: 1, dueAt: NOW - days(2) },        // due, weakest and waiting longest
  12: { box: 1, dueAt: NOW - days(1) },        // due, weakest
  13: { box: 2, dueAt: NOW + days(5) },        // not due yet
  14: { box: 5, dueAt: NOW },                  // due exactly now
};

test('the queue is weakest first, longest waiting first inside a box', () => {
  assert.deepEqual(dueQueue(SRS, NOW), [11, 12, 10, 14]);
});

test('the daily limit truncates the queue but not the count', () => {
  assert.deepEqual(dueQueue(SRS, NOW, { limit: 2 }), [11, 12]);
  assert.equal(dueCount(SRS, NOW), 4);
});

test('questions missing from the bank are dropped from the queue', () => {
  const has = qn => qn !== 11;
  assert.deepEqual(dueQueue(SRS, NOW, { has }), [12, 10, 14]);
  assert.equal(dueCount(SRS, NOW, { has }), 3);
});

test('nextDueAt finds the soonest, and is null on an empty map', () => {
  assert.equal(nextDueAt(SRS), NOW - days(2));
  assert.equal(nextDueAt({}), null);
});

test('the histogram counts questions per box', () => {
  assert.deepEqual(boxHistogram(SRS), [2, 1, 1, 0, 1]);
  assert.deepEqual(boxHistogram({}), [0, 0, 0, 0, 0]);
});
