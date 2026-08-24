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
