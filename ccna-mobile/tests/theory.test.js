// The textbook is built from Markdown at sync time, so nothing about it is checked by
// looking at committed JSON — these run the real build over the real chapters and the
// real bank. What they defend is the promise the Теория tab makes: a chapter list that
// covers the questions, and a chapter body the reader can actually render.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBook } from '../../ccna-book/build.mjs';
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

test('the map only ever points at chapters and questions that exist', () => {
  const ids = new Set(book.topics.map(t => t.id));
  const numbers = new Set(questions.map(q => q.n));
  for (const [n, id] of Object.entries(book.map)) {
    assert.ok(numbers.has(Number(n)), `map has question ${n}, the bank does not`);
    assert.ok(ids.has(id), `question ${n} points at missing chapter ${id}`);
  }
});

test('a domain with a catch-all chapter leaves no question unbound', () => {
  const covered = new Set(book.topics.filter(t => t.fallback).map(t => t.dom));
  const orphans = questions.filter(q => covered.has(q.dom) && !book.map[q.n]).map(q => q.n);
  assert.deepEqual(orphans, [], 'questions in a domain that has a catch-all chapter must be mapped');
});
