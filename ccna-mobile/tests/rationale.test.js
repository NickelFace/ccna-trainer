import test from 'node:test';
import assert from 'node:assert/strict';
import { rationaleView } from '../src/engine/rationale.js';
import { parseCli } from '../src/engine/cli.js';

const q = (over = {}) => ({
  n: 1, y: 'txt', dom: 'NF', a: 'B',
  o: { A: 'default route', B: 'network route', C: 'host route', D: 'floating static' },
  why: { A: 'нет', B: 'да', C: 'нет', D: 'нет' },
  ...over,
});

const keys = view => view.options.map(o => o.key);

test('a correct single answer shows only the correct option', () => {
  const v = rationaleView(q(), ['B']);
  assert.equal(v.mode, 'options');
  assert.deepEqual(keys(v), ['B']);
  assert.equal(v.options[0].correct, true);
  assert.equal(v.options[0].picked, true);
});

test('a wrong single answer shows what was picked and what was right', () => {
  const v = rationaleView(q(), ['C']);
  assert.deepEqual(keys(v), ['B', 'C']);
  assert.deepEqual(v.options.map(o => [o.key, o.correct, o.picked]), [['B', true, false], ['C', false, true]]);
});

test('an unanswered question still shows the correct option', () => {
  assert.deepEqual(keys(rationaleView(q(), [])), ['B']);
});

test('a multi-answer question shows every option and flags the missed one', () => {
  const v = rationaleView(q({ a: 'AD' }), ['A']);
  assert.deepEqual(keys(v), ['A', 'B', 'C', 'D']);
  const byKey = Object.fromEntries(v.options.map(o => [o.key, o]));
  assert.equal(byKey.A.missed, false);          // correct and ticked
  assert.equal(byKey.D.missed, true);           // correct and not ticked
  assert.equal(byKey.B.missed, false);          // wrong option is never "missed"
});

test('drag-and-drop falls back to the prose explanation', () => {
  const v = rationaleView({ n: 3, y: 'dd', a: '', o: {}, exp: 'FTP работает поверх TCP.' });
  assert.equal(v.mode, 'prose');
  assert.equal(v.exp, 'FTP работает поверх TCP.');
});

test('a question without per-option why degrades to the bare key', () => {
  const v = rationaleView(q({ why: undefined, a: 'AD' }), ['A']);
  assert.equal(v.mode, 'key');
  assert.deepEqual(v.key, ['A', 'D']);
});

test('the disputed-key flag is carried through every mode', () => {
  assert.equal(rationaleView(q({ disp: 1 }), ['B']).disputed, true);
  assert.equal(rationaleView(q({ disp: 1, why: undefined }), ['B']).disputed, true);
  assert.equal(rationaleView({ y: 'dd', a: '', o: {}, disp: 1 }).disputed, true);
  assert.equal(rationaleView(q()).disputed, false);
});

test('parseCli collapses long output and leaves short output open', () => {
  assert.equal(parseCli(''), null);
  assert.equal(parseCli(null), null);
  assert.equal(parseCli('R1#show ip route').long, false);
  assert.equal(parseCli('a\nb\nc\nd').long, false);          // 4 lines is still short
  assert.equal(parseCli('a\nb\nc\nd\ne').long, true);        // 5 crosses the line count
  assert.equal(parseCli('x'.repeat(220)).long, false);
  assert.equal(parseCli('x'.repeat(221)).long, true);        // 221 crosses the char count
  assert.equal(parseCli('a\nb').lines.length, 2);
});
