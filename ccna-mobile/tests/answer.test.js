// Answers are saved on every tap, including the tap that takes the last one away. What
// gets stored then decides whether the question still counts as unanswered — which is what
// the ☰ grid ticks and what «Остались вопросы без ответа» is looking for.
import test from 'node:test';
import assert from 'node:assert/strict';
import { firstUnansweredIndex, answeredCount } from '../src/app/session.js';

// Capacitor Preferences falls back to window.localStorage off-device; the store schedules
// a write after every answer, so the flush needs somewhere to land.
globalThis.window = {
  localStorage: {
    _m: new Map(),
    getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
    setItem(k, v) { this._m.set(k, String(v)); },
    removeItem(k) { this._m.delete(k); },
  },
};

const { store } = await import('../src/app/store.js');

const session = () => store.startSession({
  mode: 'exam', qs: [10, 20, 30], i: 0, answers: {}, flags: [], endsAt: 0, startedAt: 0,
});

test('clearing the last option removes the answer instead of emptying it', async () => {
  const s = session();
  store.answer(20, { given: ['B'] });
  assert.equal(answeredCount(s), 1);

  store.answer(20, { given: [] });                 // the tap that unchecks B
  assert.equal(20 in s.answers, false);
  assert.equal(answeredCount(s), 0);
  assert.equal(firstUnansweredIndex(s), 0);        // and the finish check catches it again
  await store.flush();
});

test('pulling the last chip off the board removes the answer too', async () => {
  const s = session();
  store.answer(10, { placement: { 0: 1 } });
  assert.equal(answeredCount(s), 1);

  store.answer(10, { placement: {} });
  assert.equal(10 in s.answers, false);
  assert.equal(firstUnansweredIndex(s), 0);
  await store.flush();
});

test('a graded answer stays put even with nothing selected', async () => {
  const s = session();
  store.answer(10, { given: [], ok: false });
  assert.equal(answeredCount(s), 1);
  assert.equal(firstUnansweredIndex(s), 1);
  await store.flush();
});

test('the gap the finish dialog offers skips over the answered ones', async () => {
  const s = session();
  store.answer(10, { given: ['A'] });
  store.answer(20, { given: ['B'] });
  store.answer(20, { given: [] });                 // 20 emptied again
  assert.equal(answeredCount(s), 1);
  assert.equal(firstUnansweredIndex(s), 1);        // question 20, not 30
  await store.flush();
});
