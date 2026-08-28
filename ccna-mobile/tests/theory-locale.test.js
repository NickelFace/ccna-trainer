// The locale overlay added to ccna-book/build.mjs for the English textbook: a translated
// chapter's title/lead/sections replace the Russian ones in index.json/bodies, but the
// question↔chapter binding (map.json) is computed once, from the Russian `match` data,
// and never varies by locale — see the module note in build.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBook, loadTopicsLocale, loadTopics } from '../../ccna-book/build.mjs';

test('with every chapter translated, the English build has no fallback chapters left', async () => {
  const ru = await buildBook({});
  const en = await buildBook({ locale: 'en' });
  assert.equal(en.stats.missingTranslations, 0);
  assert.deepEqual(en.map, ru.map);                 // the binding never moves
  assert.notEqual(en.index.topics[0].title, ru.index.topics[0].title);   // real translation, not a fallback
});

test('a chapter with no .en.md translation falls back to Russian for that one chapter', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccna-book-locale-'));
  try {
    await writeFile(join(dir, 'nf-99-fixture.md'), [
      '---',
      'id: nf-99-fixture',
      'dom: NF',
      'title: Тестовая глава',
      'lead: Проверка отсутствия перевода.',
      '---',
      '## Первый раздел',
      '',
      'Текст первого раздела, достаточно длинный для парсера.',
    ].join('\n'));

    const [ruTopic] = await loadTopics(dir);
    const overlay = await loadTopicsLocale([ruTopic], dir, 'en', () => {});
    assert.equal(overlay.has('nf-99-fixture'), false);   // no .en.md written — falls back
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an English build never changes which questions map to which chapter', async () => {
  const ru = await buildBook({});
  const en = await buildBook({ locale: 'en' });
  assert.deepEqual(en.stats.matched, ru.stats.matched);
  assert.deepEqual(en.stats.fallback, ru.stats.fallback);
  assert.deepEqual(en.stats.orphan, ru.stats.orphan);
});

// A synthetic fixture, so this does not depend on any chapter actually having a
// translation yet (see CCNA_MOBILE_I18N notes for progress).
test('loadTopicsLocale reassigns section ids from the Russian original, not the English headings', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccna-book-locale-'));
  try {
    await writeFile(join(dir, 'nf-99-fixture.md'), [
      '---',
      'id: nf-99-fixture',
      'dom: NF',
      'title: Тестовая глава',
      'lead: Проверка перевода секций.',
      '---',
      '## Первый раздел',
      '',
      'Текст первого раздела, достаточно длинный для парсера.',
      '',
      '## Второй раздел',
      '',
      'Текст второго раздела, тоже достаточно длинный.',
      '',
      '```check',
      '?? Вопрос',
      '!! Ответ подлиннее трёх символов',
      '```',
    ].join('\n'));
    await writeFile(join(dir, 'nf-99-fixture.en.md'), [
      '---',
      'title: Test Chapter',
      'lead: Checking section translation.',
      '---',
      '## First Section',
      '',
      'First section text, long enough for the parser to accept.',
      '',
      '## Second Section',
      '',
      'Second section text, also long enough.',
      '',
      '```check',
      '?? Question',
      '!! An answer longer than three characters',
      '```',
    ].join('\n'));

    const [ruTopic] = await loadTopics(dir);
    const overlay = await loadTopicsLocale([ruTopic], dir, 'en', () => {});
    const en = overlay.get('nf-99-fixture');

    assert.equal(en.title, 'Test Chapter');
    assert.equal(en.sections[0].title, 'First Section');
    // The id comes from the Russian heading's slug, not the English one — this is what
    // keeps map.json's `topicId#sectionId` entries resolvable against the English tree.
    assert.equal(en.sections[0].id, ruTopic.sections[0].id);
    assert.equal(en.sections[1].id, ruTopic.sections[1].id);
    assert.notEqual(en.sections[0].id, 'first-section');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a translated chapter whose section count does not match its Russian original is skipped, not misaligned', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccna-book-locale-'));
  try {
    await writeFile(join(dir, 'nf-99-fixture.md'), [
      '---',
      'id: nf-99-fixture',
      'dom: NF',
      'title: Тестовая глава',
      'lead: Проверка перевода секций.',
      '---',
      '## Первый раздел',
      '',
      'Текст первого раздела, достаточно длинный для парсера.',
      '',
      '## Второй раздел',
      '',
      'Текст второго раздела, тоже достаточно длинный.',
    ].join('\n'));
    // Only one section in the translation — a mismatch against the two above.
    await writeFile(join(dir, 'nf-99-fixture.en.md'), [
      '---',
      'title: Test Chapter',
      'lead: Checking section translation.',
      '---',
      '## Only Section',
      '',
      'Just the one, on purpose, to trigger the mismatch guard.',
    ].join('\n'));

    const [ruTopic] = await loadTopics(dir);
    const warnings = [];
    const overlay = await loadTopicsLocale([ruTopic], dir, 'en', msg => warnings.push(msg));

    assert.equal(overlay.has('nf-99-fixture'), false);
    assert.ok(warnings.some(w => w.includes('section')), 'expected a section-count warning');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
