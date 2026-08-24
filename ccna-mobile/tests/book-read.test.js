// Marking a chapter read, and — the part that used to not work — unmarking it.
//
// `read` and `readOff` are both unions across devices (shared/merge.js), so a mark can
// never be removed by deleting it: the other device hands it straight back. The rule here
// is what makes the second tap mean something, and it lives in shared/ because the phone
// and the browser must not each decide for themselves what "read" is.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BOOK, isRead, normalizeBook, readMap, setRead } from '../../ccna-exam-simulator/assets/js/shared/theory.js';

const book = (over = {}) => ({ ...structuredClone(DEFAULT_BOOK), ...over });

test('a chapter nobody touched is not read', () => {
  assert.equal(isRead(book(), 'ch-1'), false);
  assert.deepEqual(readMap(book()), {});
});

test('marking, unmarking and marking again each win in turn', () => {
  const b = book();
  setRead(b, 'ch-1', true, 100);
  assert.equal(isRead(b, 'ch-1'), true);
  setRead(b, 'ch-1', false, 200);
  assert.equal(isRead(b, 'ch-1'), false);
  setRead(b, 'ch-1', true, 300);
  assert.equal(isRead(b, 'ch-1'), true);
  assert.deepEqual(readMap(b), { 'ch-1': 300 });
});

test('nothing is ever deleted — that is the whole point', () => {
  const b = book();
  setRead(b, 'ch-1', true, 100);
  setRead(b, 'ch-1', false, 200);
  assert.equal(b.read['ch-1'], 100, 'the mark stays, outvoted rather than removed');
  assert.equal(b.readOff['ch-1'], 200);
});

// Two devices, two clocks. A phone whose clock is a minute behind must still be able to
// undo what it is looking at — otherwise the tap does nothing and the reason is invisible.
test('an action beats the state it was taken against even with a slow clock', () => {
  const b = book({ read: { 'ch-1': 5000 } });
  setRead(b, 'ch-1', false, 1000);
  assert.equal(isRead(b, 'ch-1'), false);

  const c = book({ readOff: { 'ch-1': 5000 } });
  setRead(c, 'ch-1', true, 1000);
  assert.equal(isRead(c, 'ch-1'), true);
});

test('readMap answers for every chapter at once, and only for the ones that count', () => {
  const b = book();
  setRead(b, 'ch-1', true, 100);
  setRead(b, 'ch-2', true, 100);
  setRead(b, 'ch-3', true, 100);
  setRead(b, 'ch-2', false, 200);
  assert.deepEqual(Object.keys(readMap(b)).sort(), ['ch-1', 'ch-3']);
});

test('a stored book from before tombstones normalizes into one that has them', () => {
  const b = normalizeBook({ read: { 'ch-1': 100 }, pos: {}, open: {}, last: 'ch-1', scale: 1 });
  assert.deepEqual(b.readOff, {});
  assert.equal(isRead(b, 'ch-1'), true);
  setRead(b, 'ch-1', false, 200);
  assert.equal(isRead(b, 'ch-1'), false);
});

test('junk in either map is a number of zero, not a crash', () => {
  const b = normalizeBook({ read: 'nope', readOff: 7 });
  assert.equal(isRead(b, 'ch-1'), false);
  assert.deepEqual(readMap(b), {});
  assert.deepEqual(readMap({ read: { 'ch-1': 'soon' }, readOff: {} }), {});
});

// ---------------------------------------------------------------- bookmarks
// The same primitive, the other set that uses it. What the store adds on top is only the
// toggle and the order a list of them reads in.
import { normalizeTset, tsetEntries, tsetHas, tsetMark } from '../../ccna-exam-simulator/assets/js/shared/tset.js';

const set = (over = {}) => ({ on: {}, off: {}, ...over });

test('a question put aside and taken back follows the later action', () => {
  const s = set();
  tsetMark(s.on, s.off, 12, true, 100);
  assert.equal(tsetHas(s.on, s.off, 12), true);
  tsetMark(s.on, s.off, 12, false, 200);
  assert.equal(tsetHas(s.on, s.off, 12), false);
  tsetMark(s.on, s.off, 12, true, 300);
  assert.equal(tsetHas(s.on, s.off, 12), true);
});

test('taking one back off in the same millisecond it was added still removes it', () => {
  const s = set();
  tsetMark(s.on, s.off, 12, true, 100);
  tsetMark(s.on, s.off, 12, false, 100);
  assert.equal(tsetHas(s.on, s.off, 12), false);
});

test('the list keeps the order they were added in', () => {
  const s = set();
  tsetMark(s.on, s.off, 30, true, 300);
  tsetMark(s.on, s.off, 10, true, 100);
  tsetMark(s.on, s.off, 20, true, 200);
  tsetMark(s.on, s.off, 10, false, 400);
  const order = Object.entries(tsetEntries(s.on, s.off)).sort((x, y) => x[1] - y[1]).map(([n]) => Number(n));
  assert.deepEqual(order, [20, 30]);
});

test('the array both clients used to store normalizes into adds nobody has undone', () => {
  const s = normalizeTset([3, 7]);
  assert.deepEqual(s, { on: { 3: 1, 7: 1 }, off: {} });
  assert.equal(tsetHas(s.on, s.off, 3), true);
  // …and a removal made anywhere since still beats it, because 1 is as old as it gets.
  tsetMark(s.on, s.off, 3, false, 2);
  assert.equal(tsetHas(s.on, s.off, 3), false);
});

test('junk in place of a set is an empty set, not a crash', () => {
  assert.deepEqual(normalizeTset(null), { on: {}, off: {} });
  assert.deepEqual(normalizeTset('nope'), { on: {}, off: {} });
  assert.deepEqual(normalizeTset({ on: [1, 2], off: 7 }), { on: {}, off: {} });
});
