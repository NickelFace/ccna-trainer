// Runs the engine against the real bank in ../ccna-exam-simulator/data. Synthetic
// fixtures prove the maths; this proves the maths still fits the data after the Python
// pipeline in build/ regenerates it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { weightedPick, scorable } from '../src/engine/select.js';
import { ddExpected, ddNeeded } from '../src/engine/grade.js';
import { loadBank, countByDom, seeded, WEB_DATA } from './helpers.js';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const { questions, meta } = loadBank();
const poolOf = questions.filter(scorable);

test('the scorable pool matches what meta.json advertises', () => {
  assert.equal(questions.length, meta.total);
  assert.equal(poolOf.length, meta.scored_mc + meta.dd_ready);
});

test('every scorable question sits in one of the six blueprint domains', () => {
  const ids = new Set(meta.domains.map(d => d.id));
  const strays = poolOf.filter(q => !ids.has(q.dom)).map(q => q.n);
  assert.deepEqual(strays, []);
});

test('a full exam off the real bank hits the blueprint exactly', () => {
  const picked = weightedPick(poolOf, meta.domains, 100, seeded(2026));
  assert.equal(picked.length, 100);
  assert.deepEqual(countByDom(picked), { NF: 20, NA: 20, IPC: 25, IPS: 10, SEC: 15, AUT: 10 });
});

test('a full exam never repeats a question', () => {
  const picked = weightedPick(poolOf, meta.domains, 100, seeded(7));
  assert.equal(new Set(picked.map(q => q.n)).size, 100);
});

test('drag-and-drop items are unique inside a question', () => {
  // ddExpected() matches items to buckets by text, so a duplicated string would make two
  // slots collapse onto one index and grade wrongly. Nothing in the bank may duplicate.
  const dupes = questions
    .filter(q => q.dd)
    .filter(q => new Set(q.dd.items).size !== q.dd.items.length)
    .map(q => q.n);
  assert.deepEqual(dupes, []);
});

test('every drag-and-drop bucket entry exists in the item list', () => {
  const orphans = [];
  for (const q of questions.filter(x => x.dd)) {
    for (const b of q.dd.buckets) {
      for (const text of b.correct) {
        if (!q.dd.items.includes(text)) orphans.push([q.n, b.label, text]);
      }
    }
  }
  assert.deepEqual(orphans, []);
});

test('every drag-and-drop question is solvable: at least one slot, never more than items', () => {
  for (const q of questions.filter(x => x.dd)) {
    const needed = ddNeeded(q);
    assert.ok(needed > 0, `q${q.n} has no correct placements`);
    assert.ok(needed <= q.dd.items.length, `q${q.n} needs ${needed} placements but has ${q.dd.items.length} items`);
    assert.equal(ddExpected(q).filter(x => x !== null).length, needed);
  }
});

const EXHIBITS = join(WEB_DATA, '..', 'images', 'exhibits');

test('every referenced exhibit file is actually on disk', () => {
  // The app bundles these into the APK; a missing one is a broken image on a phone with
  // no network to fall back on, which is exactly what data-check.yml is here to catch.
  const missing = questions
    .filter(q => q.img)
    .filter(q => !existsSync(join(EXHIBITS, q.img)))
    .map(q => `${q.n} -> ${q.img}`);
  assert.deepEqual(missing, []);
});

test('the exhibit count matches what meta.json advertises', () => {
  const files = readdirSync(EXHIBITS).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
  assert.equal(files.length, meta.exhibits);
});

test('no question carries a key letter that has no option', () => {
  const broken = questions
    .filter(q => q.y !== 'dd' && q.a && q.o)
    .filter(q => [...q.a].some(k => q.o[k] === undefined))
    .map(q => `${q.n}: ключ ${q.a}, варианты ${Object.keys(q.o).join('')}`);
  assert.deepEqual(broken, []);
});
