import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, questionToText, defaultParts, PROMPT_PARTS, LEVELS } from '../src/engine/ai-prompt.js';

const mcq = {
  n: 365, dom: 'IPC', tp: 'Routing', y: 'txt',
  t: 'Which route does R1 use to reach 10.10.13.10/32?',
  o: { A: 'default route', B: 'network route', C: 'host route' },
  a: 'B',
  why: { A: 'ПОЯСНЕНИЕ-A', B: 'ПОЯСНЕНИЕ-B', C: 'ПОЯСНЕНИЕ-C' },
  exp: 'Пояснение из банка, которое не должно попасть в промпт.',
};

const dd = {
  n: 3, dom: 'IPS', tp: 'General', y: 'dd', a: '', o: {},
  t: 'Разложи протоколы по категориям',
  dd: {
    items: ['uses port 69', 'uses ports 20 and 21', 'uses SNMP'],
    buckets: [{ label: 'FTP', correct: ['uses ports 20 and 21'] }, { label: 'TFTP', correct: ['uses port 69'] }],
  },
};

const domainName = id => ({ IPC: 'IP Connectivity', IPS: 'IP Services' })[id];

test('the default toggles are theory, mistake, quiz and Russian', () => {
  assert.deepEqual([...defaultParts()].sort(), ['mistake', 'quiz', 'ru', 'theory'].sort());
});

test('a multiple-choice question renders with options, key and the answer given', () => {
  const text = questionToText(mcq, { given: ['C'] }, 'IP Connectivity');
  assert.match(text, /^Вопрос 365 \[IP Connectivity\]/);
  assert.match(text, /^A\. default route$/m);
  assert.match(text, /^Правильный ответ: B$/m);
  assert.match(text, /^Мой ответ: C$/m);
});

test('a matching question renders its items, categories and my placement', () => {
  const text = questionToText(dd, { placement: { 0: 0, 1: 1 } }, 'IP Services');
  assert.match(text, /Тип: сопоставление/);
  assert.match(text, /^FTP: uses ports 20 and 21$/m);
  assert.match(text, /uses port 69 → FTP/);          // my (wrong) placement, verbatim
  assert.match(text, /uses ports 20 and 21 → TFTP/);
});

test('an unplaced distractor is simply absent from my placement', () => {
  const text = questionToText(dd, { placement: { 0: 1 } }, 'IP Services');
  assert.ok(!text.includes('uses SNMP →'));
});

test('an exhibit is flagged as an image that did not come along', () => {
  const text = questionToText({ ...mcq, img: 'q365.jpg' }, null, 'IP Connectivity');
  assert.match(text, /схема — картинка не входит в этот текст/);
});

// The share sheet sends the exhibit alongside the text, so the same note has to stop
// saying the picture is missing — the model would otherwise answer around it.
test('an exhibit that travels with the message is announced as attached', () => {
  const text = questionToText({ ...mcq, img: 'q365.jpg' }, null, 'IP Connectivity', true);
  assert.match(text, /приложена картинкой к этому сообщению/);
  assert.ok(!text.includes('не входит в этот текст'));
});

test('CLI output is included in place of the exhibit note', () => {
  const text = questionToText({ ...mcq, cli: 'R1#show ip route', img: 'q1.jpg' }, null, 'IP Connectivity');
  assert.match(text, /R1#show ip route/);
  assert.ok(!text.includes('картинка не входит'));
});

test("the bank's own explanation never leaks into the prompt", () => {
  // The whole point is an independent answer, not a paraphrase of what is already shown.
  const prompt = buildPrompt({ items: [{ q: mcq, answer: { given: ['C'] } }], parts: defaultParts(), domainName });
  assert.ok(!prompt.includes(mcq.exp));
  for (const why of Object.values(mcq.why)) assert.ok(!prompt.includes(why));
});

test('the level and the weak domain are woven into the opening line', () => {
  const prompt = buildPrompt({
    items: [{ q: mcq, answer: { given: ['C'] } }],
    parts: defaultParts(),
    profile: { level: 'retake' },
    weakDomain: 'Automation',
    domainName,
  });
  assert.match(prompt, new RegExp(`Я ${LEVELS.retake}, слабый домен Automation\\.`));
  assert.match(prompt, /^Тема: Routing\.$/m);
});

test('an unset level falls back to a neutral phrase without a stray comma', () => {
  const prompt = buildPrompt({ items: [{ q: mcq }], parts: defaultParts(), domainName });
  assert.match(prompt, /Я готовлюсь к экзамену\./);
});

test('toggles decide which instructions appear, and they stay numbered in order', () => {
  const parts = new Set(['theory', 'ios', 'quiz']);
  const prompt = buildPrompt({ items: [{ q: mcq }], parts, domainName });
  const steps = prompt.split('\n').filter(l => /^\d\. /.test(l));
  assert.equal(steps.length, 3);
  assert.match(steps[0], /^1\. Объясни теорию/);
  assert.match(steps[1], /^2\. Дай 3 практических примера/);
  assert.match(steps[2], /^3\. Задай мне 5 вопросов/);
  assert.ok(!prompt.includes('ломается моя логика'));
  assert.ok(!prompt.includes('Отвечай на русском'));
});

test('turning everything off still produces the question, just without instructions', () => {
  const prompt = buildPrompt({ items: [{ q: mcq }], parts: new Set(), domainName });
  assert.ok(!prompt.includes('Сделай по порядку'));
  assert.match(prompt, /Вопрос 365/);
});

test('the Russian toggle is a tail line, not a numbered step', () => {
  const prompt = buildPrompt({ items: [{ q: mcq }], parts: new Set(['ru']), domainName });
  assert.match(prompt, /Отвечай на русском\.$/);
  assert.ok(!/^\d\. Отвечай/m.test(prompt));
});

test('several mistakes come through as one batch split by ---', () => {
  const prompt = buildPrompt({
    items: [{ q: mcq, answer: { given: ['A'] } }, { q: dd, answer: { placement: { 0: 0 } } }],
    parts: defaultParts(),
    domainName,
  });
  assert.match(prompt, /Ниже 2 вопрос\(ов\), на которые я ответил неправильно/);
  assert.equal(prompt.split('\n---\n').length, 2);
  // "General" is the untagged bucket, so it never makes it into the topic line.
  assert.match(prompt, /^Тема: Routing\.$/m);
});

test('the drag-drop boilerplate is stripped from the exported text too', () => {
  const noisy = { ...dd, t: 'DRAG DROP - Разложи протоколы по категориям Select and Place:' };
  const text = questionToText(noisy, null, 'IP Services');
  assert.ok(!text.includes('DRAG DROP'));
  assert.ok(!text.includes('Select and Place'));
  assert.match(text, /Разложи протоколы по категориям/);
});

test('a question with no topic tag at all leaves the topic line out', () => {
  const prompt = buildPrompt({ items: [{ q: { ...mcq, tp: undefined } }], parts: defaultParts(), domainName });
  assert.ok(!prompt.includes('Тема:'));
});

test('every declared toggle is either a step or a tail, never neither', () => {
  for (const p of PROMPT_PARTS) {
    assert.ok(p.line || p.tail, `${p.id} does nothing`);
  }
});

test('an untouched board does not print an empty "my placement" heading', () => {
  const text = questionToText(dd, { placement: {} }, 'IP Services');
  assert.ok(!text.includes('Мой вариант распределения'));
  // ...but a single placement is enough to earn it
  assert.match(questionToText(dd, { placement: { 0: 1 } }, 'IP Services'), /Мой вариант распределения/);
});
