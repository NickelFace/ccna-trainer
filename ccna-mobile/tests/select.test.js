import test from 'node:test';
import assert from 'node:assert/strict';
import { shuffle, weightedPick, scorable } from '../src/engine/select.js';
import { DOMAINS, countByDom, pool, seeded } from './helpers.js';

test('shuffle returns a permutation and leaves the input alone', () => {
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffle(src, seeded(1));
  assert.deepEqual(src, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(out.slice().sort((a, b) => a - b), src);
});

test('shuffle with the same seed is reproducible', () => {
  const src = Array.from({ length: 20 }, (_, i) => i);
  assert.deepEqual(shuffle(src, seeded(7)), shuffle(src, seeded(7)));
});

test('100 questions land on the Cisco blueprint exactly', () => {
  const picked = weightedPick(pool(50), DOMAINS, 100, seeded(42));
  assert.equal(picked.length, 100);
  assert.deepEqual(countByDom(picked), { NF: 20, NA: 20, IPC: 25, IPS: 10, SEC: 15, AUT: 10 });
});

test('largest remainder hands the leftover to the biggest fraction', () => {
  // 30 * weights = 6, 6, 7.5, 3, 4.5, 3 -> floors sum to 29, one seat left over.
  // IPC and SEC both have fraction .5; the sort is stable, so IPC (listed first) wins it.
  const picked = weightedPick(pool(50), DOMAINS, 30, seeded(3));
  assert.equal(picked.length, 30);
  assert.deepEqual(countByDom(picked), { NF: 6, NA: 6, IPC: 8, IPS: 3, SEC: 4, AUT: 3 });
});

test('a total that divides evenly needs no remainder pass', () => {
  const picked = weightedPick(pool(50), DOMAINS, 20, seeded(5));
  assert.deepEqual(countByDom(picked), { NF: 4, NA: 4, IPC: 5, IPS: 2, SEC: 3, AUT: 2 });
});

test('a domain with too few questions gives what it has and the total falls short', () => {
  // Documented limitation carried over from app.js: the shortfall is not redistributed.
  const thin = pool(50).filter(q => q.dom !== 'IPC').concat(
    Array.from({ length: 4 }, (_, i) => ({ n: 9000 + i, dom: 'IPC', y: 'txt', a: 'A' })));
  const picked = weightedPick(thin, DOMAINS, 100, seeded(11));
  assert.equal(countByDom(picked).IPC, 4);
  assert.equal(picked.length, 79);
});

test('same seed, same exam', () => {
  const a = weightedPick(pool(50), DOMAINS, 100, seeded(99)).map(q => q.n);
  const b = weightedPick(pool(50), DOMAINS, 100, seeded(99)).map(q => q.n);
  assert.deepEqual(a, b);
});

test('scorable accepts keyed text/exhibit and reconstructed drag-drop only', () => {
  assert.equal(scorable({ y: 'txt', a: 'A' }), true);
  assert.equal(scorable({ y: 'ex', a: 'BD' }), true);
  assert.equal(scorable({ y: 'txt', a: '' }), false);
  assert.equal(scorable({ y: 'dd', dd: { items: [], buckets: [] } }), true);
  assert.equal(scorable({ y: 'dd' }), false);
  assert.equal(scorable({ y: 'sim', a: 'A' }), false);
});
