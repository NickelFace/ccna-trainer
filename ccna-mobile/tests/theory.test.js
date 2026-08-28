// The textbook is built from Markdown at sync time, so nothing about it is checked by
// looking at committed JSON — these run the real build over the real chapters and the
// real bank. What they defend is the promise the Теория tab makes: a chapter list that
// covers the questions, and a chapter body the reader can actually render.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBook } from '../../ccna-book/build.mjs';
import { sectionOf, topicOf } from '../../ccna-exam-simulator/assets/js/shared/theory.js?v=21';
import { loadBank } from './helpers.js';

const book = await buildBook({});
const { questions } = loadBank();
const BLOCKS = new Set(['p', 'h3', 'ul', 'ol', 'table', 'code', 'note', 'check']);

test('every chapter has an id, a domain and a lead', () => {
  const ids = new Set();
  for (const t of book.topics) {
    assert.match(t.id, /^[a-z]{2,3}-\d\d-[a-z0-9-]+$/, `${t.id}: id shape`);
    assert.ok(!ids.has(t.id), `${t.id}: duplicate id`);
    ids.add(t.id);
    assert.ok(t.lead.length > 20, `${t.id}: lead is too short to say anything`);
    assert.ok(t.sections.length >= 3, `${t.id}: fewer than 3 sections`);
  }
});

test('every block the build emits is one the app knows how to render', () => {
  for (const t of book.topics) {
    for (const s of t.sections) {
      assert.ok(s.title && s.id, `${t.id}: a section without a title`);
      for (const b of s.blocks) assert.ok(BLOCKS.has(b.t), `${t.id}: unknown block "${b.t}"`);
    }
  }
});

test('tables are rectangular — a ragged row breaks the reader silently', () => {
  for (const t of book.topics) {
    for (const s of t.sections) {
      for (const b of s.blocks.filter(x => x.t === 'table')) {
        for (const row of b.rows) {
          assert.equal(row.length, b.head.length,
            `${t.id} / ${s.title}: row has ${row.length} cells, header has ${b.head.length}`);
        }
      }
    }
  }
});

test('every chapter ends with a self-check that has answers', () => {
  for (const t of book.topics) {
    const checks = t.sections.flatMap(s => s.blocks).filter(b => b.t === 'check');
    assert.ok(checks.length, `${t.id}: no "Проверь себя" block`);
    for (const c of checks) {
      assert.ok(c.items.length >= 3, `${t.id}: self-check with fewer than 3 questions`);
      for (const item of c.items) assert.ok(item.a.length > 3, `${t.id}: empty answer for "${item.q}"`);
    }
  }
});

// A chapter may legitimately have no questions — the blueprint moves faster than the dump
// the bank came from — but that has to be declared in the chapter (`bank: none`), not
// discovered as a silent zero.
test('every chapter is bound to questions from the bank', () => {
  for (const t of book.index.topics) {
    if (!t.inBank) { assert.equal(t.qn, 0, `${t.id}: declares bank: none but questions reach it`); continue; }
    assert.ok(t.qn > 0, `${t.id}: no question in the bank reaches this chapter`);
  }
});

// A map entry is `topicId`, or `topicId#sectionId` when the build could name one section
// of that chapter. Read through the accessors both clients read it through, not by
// indexing — that is the whole reason those accessors exist.
test('the map only ever points at chapters, sections and questions that exist', () => {
  const byId = new Map(book.topics.map(t => [t.id, t]));
  const numbers = new Set(questions.map(q => q.n));
  for (const n of Object.keys(book.map)) {
    assert.ok(numbers.has(Number(n)), `map has question ${n}, the bank does not`);
    const id = topicOf(book.map, n);
    const t = byId.get(id);
    assert.ok(t, `question ${n} points at missing chapter ${id}`);
    const sec = sectionOf(book.map, n);
    if (sec) {
      assert.ok(t.sections.some(x => x.id === sec),
        `question ${n} points at section "${sec}", which chapter ${id} does not have`);
    }
  }
});

// The pointer earns its place by being specific; a section named for nearly every question
// would mean the scoring is not discriminating, and one named for almost none would mean
// the thresholds are too tight to be worth the build. Neither is a correctness bug, so
// this is a wide band — it fails when the tuning has drifted out of usefulness.
test('a meaningful share of the bank is pointed at a section, and not most of it', () => {
  const share = book.stats.sectioned / questions.length;
  assert.ok(share > 0.15 && share < 0.75,
    `${Math.round(share * 100)}% of questions carry a section — expected between 15% and 75%`);
});

// The two trailer sections are the same in all 47 chapters: one lists how the exam words
// its questions, the other is a self-check. Neither explains anything, and both are what a
// lexical scorer reaches for first — see TRAILER in build.mjs.
test('no question is pointed at a chapter trailer', () => {
  const byId = new Map(book.topics.map(t => [t.id, t]));
  const bad = [];
  for (const n of Object.keys(book.map)) {
    const sec = sectionOf(book.map, n);
    if (!sec) continue;
    const title = byId.get(topicOf(book.map, n)).sections.find(x => x.id === sec)?.title || '';
    if (/^(что спрашивают|проверь себя)$/i.test(title.trim())) bad.push(n);
  }
  assert.deepEqual(bad, []);
});

test('a domain with a catch-all chapter leaves no question unbound', () => {
  const covered = new Set(book.topics.filter(t => t.fallback).map(t => t.dom));
  const orphans = questions.filter(q => covered.has(q.dom) && !book.map[q.n]).map(q => q.n);
  assert.deepEqual(orphans, [], 'questions in a domain that has a catch-all chapter must be mapped');
});
