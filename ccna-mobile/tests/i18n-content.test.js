// The locale-aware paths added for English content: rationaleView's why_en/exp_en
// fallback, and ai-prompt's `lang` parameter. Existing tests (tests/rationale.test.js,
// tests/ai-prompt.test.js) call these with no `lang` at all and must keep passing
// unchanged — this file only covers the new English branch and the fallback behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rationaleView } from '../src/engine/rationale.js';
import { buildPrompt, questionToText, defaultParts, PROMPT_PARTS_EN, LEVELS_EN } from '../src/engine/ai-prompt.js';

const q = (over = {}) => ({
  n: 1, y: 'txt', dom: 'NF', a: 'B',
  o: { A: 'default route', B: 'network route', C: 'host route', D: 'floating static' },
  why: { A: 'нет', B: 'да', C: 'нет', D: 'нет' },
  why_en: { A: 'no', B: 'yes', C: 'no', D: 'no' },
  exp: 'Пояснение по-русски.',
  exp_en: 'Explanation in English.',
  ...over,
});

test('lang "en" reads why_en instead of why', () => {
  const v = rationaleView(q(), ['B'], 'en');
  assert.equal(v.mode, 'options');
  assert.equal(v.options[0].why, 'yes');
});

test('a question with no why_en at all falls back to the Russian why', () => {
  const noEn = q({ why_en: undefined });
  const v = rationaleView(noEn, ['B'], 'en');
  assert.equal(v.options[0].why, 'да');
});

test('a why_en missing just one key falls back to Russian for that key only', () => {
  const partial = q({ why_en: { A: 'no', B: 'yes' } });    // C, D absent
  const v = rationaleView(partial, ['C'], 'en');
  const byKey = Object.fromEntries(v.options.map(o => [o.key, o.why]));
  assert.equal(byKey.B, 'yes');   // translated
  assert.equal(byKey.C, 'нет');   // fell back to Russian
});

test('lang "en" prose mode reads exp_en, falling back to exp', () => {
  const dd = { n: 2, y: 'dd', dom: 'NF', a: '', o: {}, dd: { items: [], buckets: [] } };
  const v = rationaleView({ ...dd, exp: 'ru text', exp_en: 'en text' }, [], 'en');
  assert.equal(v.exp, 'en text');
  const v2 = rationaleView({ ...dd, exp: 'ru only' }, [], 'en');
  assert.equal(v2.exp, 'ru only');
});

test('omitting lang keeps the original Russian behaviour (backward compatible)', () => {
  const v = rationaleView(q(), ['B']);
  assert.equal(v.options[0].why, 'да');
});

test('buildPrompt in English uses the English toggle set and level phrase', () => {
  const prompt = buildPrompt({
    items: [{ q: q(), answer: { given: ['C'] } }],
    parts: defaultParts('en'),
    profile: { level: 'retake' },
    domainName: () => 'NF',
    lang: 'en',
  });
  assert.match(prompt, /You are teaching CCNA 200-301/);
  assert.match(prompt, new RegExp(`I ${LEVELS_EN.retake}\\.`));
  assert.match(prompt, /^Question 1 \[NF\]/m);
  assert.match(prompt, /^Correct answer: B$/m);
});

test('the English default toggles do not include "answer in Russian"', () => {
  assert.deepEqual([...defaultParts('en')].sort(), ['mistake', 'quiz', 'theory'].sort());
});

test('the Russian tail line still reads "Отвечай на русском" even under an English prompt', () => {
  const prompt = buildPrompt({
    items: [{ q: q() }], parts: new Set(['ru']), domainName: () => 'NF', lang: 'en',
  });
  assert.match(prompt, /Отвечай на русском\.$/);
});

test('questionToText in English announces a missing/attached exhibit in English', () => {
  const withImg = { ...q(), img: 'x.jpg' };
  assert.match(questionToText(withImg, null, 'NF', false, 'en'), /diagram.*not included/);
  assert.match(questionToText(withImg, null, 'NF', true, 'en'), /attached as an image/);
});

test('every English prompt part is either a step or a tail, same as the Russian set', () => {
  for (const p of PROMPT_PARTS_EN) assert.ok(p.line || p.tail, `${p.id} does nothing`);
});
