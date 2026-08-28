// Builds the prompt that gets pasted into an AI chat.
//
// The web app's "📋 Скопировать для ИИ" copies the question text and nothing else, so the
// learner has to explain what they want every time. This assembles the whole request —
// who is asking, what they got wrong, and what kind of answer would help — from a template
// and a set of toggles. Generation is local, so it works with the device offline; sending
// is always a manual paste.
//
// Deliberately omits the bank's own why/exp: the point is an independent explanation, not
// an echo of the one already on screen.
//
// Every function here takes an optional `lang` ('ru' | 'en'), defaulting to 'ru' — the
// engine stays pure and framework-free (see the module comments on stats.js/readiness.js
// for why: this is imported by both a classic script and a bundled module, and neither may
// depend on the UI layer). The caller (screens/ai-prompt.js) passes app/i18n.js's
// getLang(); every existing call site that omits it keeps behaving exactly as before.

// Phrased to slot into "Я ..." / "I ..." without turning the sentence into a noun salad.
export const LEVELS = {
  first: 'готовлюсь первый раз',
  again: 'готовился раньше, подтягиваю',
  retake: 'иду на пересдачу',
};
export const LEVELS_EN = {
  first: 'am preparing for the first time',
  again: 'studied before and am brushing up',
  retake: 'am retaking it',
};
const LEVELS_BY_LANG = { ru: LEVELS, en: LEVELS_EN };
const LEVEL_FALLBACK = { ru: 'готовлюсь к экзамену', en: 'am preparing for the exam' };

// The dump prefixes matching questions with "DRAG DROP -" and often ends them with
// "Select and Place:" — lab-interface boilerplate. The engine owns the strip so the
// screen and the exported prompt show the same wording.
export const questionText = q => q.y !== 'dd' ? q.t : q.t
  .replace(/^\s*DRAG DROP\s*[-–]\s*/i, '')
  .replace(/\s*Select and Place:\s*$/i, '')
  .trim();

// "General" is the dump's untagged bucket, not a subject — naming it as the topic would
// send the AI chasing nothing.
const CATCH_ALL = 'General';

// Order here is the order of the numbered instructions in the prompt. The Russian set is
// the original and stays the default — see the module note above.
export const PROMPT_PARTS = [
  { id: 'theory', label: 'Теория темы', on: true,
    line: 'Объясни теорию темы с нуля, коротко и по делу, с таблицей ключевых значений.' },
  { id: 'mistake', label: 'Разбор моей ошибки', on: true,
    line: 'Покажи, где именно ломается моя логика.' },
  { id: 'ios', label: 'Команды IOS', on: false,
    line: 'Дай 3 практических примера с выводом show-команд.' },
  { id: 'analogy', label: 'Аналогия «на пальцах»', on: false,
    line: 'Приведи бытовую аналогию, без сетевых терминов.' },
  { id: 'quiz', label: '5 вопросов на закрепление', on: true,
    line: 'Задай мне 5 вопросов формата CCNA на эту тему и жди мои ответы, не показывай ключ сразу.' },
  { id: 'ru', label: 'Ответ на русском', on: true, tail: 'Отвечай на русском.' },
];

// English UI, same ids and same order — buildPrompt/defaultParts key everything off `id`,
// never off the label text, so the two sets stay interchangeable. "Answer in Russian" stays
// available (and its tail line is deliberately still Russian — that is the whole point of
// the toggle) but defaults off: an English interface implies an English answer until asked
// otherwise.
export const PROMPT_PARTS_EN = [
  { id: 'theory', label: 'Topic theory', on: true,
    line: 'Explain the topic theory from scratch, briefly and to the point, with a table of key values.' },
  { id: 'mistake', label: 'Break down my mistake', on: true,
    line: 'Show exactly where my reasoning breaks down.' },
  { id: 'ios', label: 'IOS commands', on: false,
    line: 'Give 3 practical examples with show-command output.' },
  { id: 'analogy', label: 'Plain-language analogy', on: false,
    line: 'Give an everyday analogy, with no networking jargon.' },
  { id: 'quiz', label: '5 follow-up questions', on: true,
    line: "Ask me 5 CCNA-style questions on this topic and wait for my answers — don't reveal the key right away." },
  { id: 'ru', label: 'Answer in Russian', on: false, tail: 'Отвечай на русском.' },
];
const PARTS_BY_LANG = { ru: PROMPT_PARTS, en: PROMPT_PARTS_EN };
const partsFor = lang => PARTS_BY_LANG[lang] || PROMPT_PARTS;

export const defaultParts = (lang = 'ru') =>
  new Set(partsFor(lang).filter(p => p.on).map(p => p.id));

const TXT = {
  ru: {
    question: (n, dom, disp) => `Вопрос ${n} [${dom}]${disp ? ' (спорный ключ)' : ''}`,
    imageAttached: '[схема к вопросу приложена картинкой к этому сообщению]',
    imageMissing: '[к вопросу приложена схема — картинка не входит в этот текст]',
    ddType: 'Тип: сопоставление',
    ddItems: items => `Элементы: ${items}`,
    myPlacement: 'Мой вариант распределения:',
    correctAnswer: keys => `Правильный ответ: ${keys}`,
    myAnswer: given => `Мой ответ: ${given}`,
    intro: (level, weak) => `Ты преподаёшь CCNA 200-301. Я ${level}${weak}.`,
    weakDomain: d => `, слабый домен ${d}`,
    topic: topics => `Тема: ${topics}.`,
    oneWrong: 'Я ошибся в таком вопросе:',
    manyWrong: n => `Ниже ${n} вопрос(ов), на которые я ответил неправильно. Разбери каждый.`,
    doInOrder: 'Сделай по порядку:',
  },
  en: {
    question: (n, dom, disp) => `Question ${n} [${dom}]${disp ? ' (disputed key)' : ''}`,
    imageAttached: '[the diagram for this question is attached as an image to this message]',
    imageMissing: '[this question has a diagram — the image is not included in this text]',
    ddType: 'Type: matching',
    ddItems: items => `Items: ${items}`,
    myPlacement: 'My placement:',
    correctAnswer: keys => `Correct answer: ${keys}`,
    myAnswer: given => `My answer: ${given}`,
    intro: (level, weak) => `You are teaching CCNA 200-301. I ${level}${weak}.`,
    weakDomain: d => `, weak domain ${d}`,
    topic: topics => `Topic: ${topics}.`,
    oneWrong: 'I got this question wrong:',
    manyWrong: n => `Below are ${n} question(s) I answered incorrectly. Go through each one.`,
    doInOrder: 'Please do the following, in order:',
  },
};
const textFor = lang => TXT[lang] || TXT.ru;

// Plain-text rendering of one question and, if there is one, the answer that was given.
// Ported from qToAIText() in the web app so both produce the same paste.
//
// `imageAttached` is what the screen knows and the engine cannot: sharing through the
// system sheet sends the exhibit alongside the text, and telling the model the picture is
// missing when it is right there sends it guessing.
export function questionToText(q, answer, domainName, imageAttached = false, lang = 'ru') {
  const s = textFor(lang);
  const lines = [s.question(q.n, domainName || q.dom, q.disp), questionText(q)];

  // A schema can only ride along as an attachment, and only when a single question is
  // being shared — so the bank carries `topo`, the same diagram written out (built in
  // build/topo_text.py). Where it exists the batch keeps the schema; where it does not,
  // say plainly that the picture is missing rather than let the model invent one.
  if (q.cli) lines.push('', q.cli);
  const topo = lang === 'en' ? (q.topo_en || q.topo) : q.topo;
  if (topo) lines.push('', topo);
  else if (q.img && !q.cli) lines.push('', imageAttached ? s.imageAttached : s.imageMissing);

  if (q.y === 'dd' && q.dd) {
    lines.push('', s.ddType, s.ddItems(q.dd.items.join(', ')));
    q.dd.buckets.forEach(b => lines.push(`${b.label}: ${b.correct.join(', ')}`));
    const placement = answer?.placement;
    if (placement && Object.keys(placement).length) {
      lines.push('', s.myPlacement);
      q.dd.items.forEach((text, i) => {
        if (placement[i] === undefined) return;
        lines.push(`  ${text} → ${q.dd.buckets[placement[i]]?.label ?? '?'}`);
      });
    }
  } else if (q.o) {
    lines.push('');
    Object.keys(q.o).forEach(k => lines.push(`${k}. ${q.o[k]}`));
    lines.push('', s.correctAnswer(String(q.a).split('').join(', ')));
    if (answer?.given?.length) lines.push(s.myAnswer(answer.given.join(', ')));
  }
  return lines.join('\n');
}

// items: [{ q, answer }]. One item reads as "я ошибся в таком вопросе"; several read as a
// batch, which is what "Все ошибки домена" produces.
export function buildPrompt({
  items, parts, profile = {}, weakDomain = null, domainName = () => null, imagesAttached = false, lang = 'ru',
}) {
  const s = textFor(lang);
  const all = partsFor(lang);
  const enabled = all.filter(p => parts.has(p.id));
  const steps = enabled.filter(p => p.line);
  const tails = enabled.filter(p => p.tail);

  const level = LEVELS_BY_LANG[lang]?.[profile.level] || LEVEL_FALLBACK[lang] || LEVEL_FALLBACK.ru;
  const weak = weakDomain ? s.weakDomain(weakDomain) : '';
  const topics = [...new Set(items.map(({ q }) => q.tp).filter(t => t && t !== CATCH_ALL))];

  const out = [s.intro(level, weak)];
  if (topics.length) out.push('', s.topic(topics.join(', ')));

  out.push('', items.length === 1 ? s.oneWrong : s.manyWrong(items.length));
  out.push('', items
    .map(({ q, answer }) => questionToText(q, answer, domainName(q.dom), imagesAttached, lang))
    .join('\n\n---\n\n'));

  if (steps.length) {
    out.push('', s.doInOrder);
    steps.forEach((p, i) => out.push(`${i + 1}. ${p.line}`));
  }
  for (const t of tails) out.push('', t.tail);

  return out.join('\n');
}
