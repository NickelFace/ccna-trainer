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

// Phrased to slot into "Я ..." without turning the sentence into a noun salad.
export const LEVELS = {
  first: 'готовлюсь первый раз',
  again: 'готовился раньше, подтягиваю',
  retake: 'иду на пересдачу',
};

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

// Order here is the order of the numbered instructions in the prompt.
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

export const defaultParts = () =>
  new Set(PROMPT_PARTS.filter(p => p.on).map(p => p.id));

// Plain-text rendering of one question and, if there is one, the answer that was given.
// Ported from qToAIText() in the web app so both produce the same paste.
//
// `imageAttached` is what the screen knows and the engine cannot: sharing through the
// system sheet sends the exhibit alongside the text, and telling the model the picture is
// missing when it is right there sends it guessing.
export function questionToText(q, answer, domainName, imageAttached = false) {
  const lines = [`Вопрос ${q.n} [${domainName || q.dom}]${q.disp ? ' (спорный ключ)' : ''}`, questionText(q)];

  // A schema can only ride along as an attachment, and only when a single question is
  // being shared — so the bank carries `topo`, the same diagram written out (built in
  // build/topo_text.py). Where it exists the batch keeps the schema; where it does not,
  // say plainly that the picture is missing rather than let the model invent one.
  if (q.cli) lines.push('', q.cli);
  if (q.topo) lines.push('', q.topo);
  else if (q.img && !q.cli) lines.push('', imageAttached
    ? '[схема к вопросу приложена картинкой к этому сообщению]'
    : '[к вопросу приложена схема — картинка не входит в этот текст]');

  if (q.y === 'dd' && q.dd) {
    lines.push('', 'Тип: сопоставление', `Элементы: ${q.dd.items.join(', ')}`);
    q.dd.buckets.forEach(b => lines.push(`${b.label}: ${b.correct.join(', ')}`));
    const placement = answer?.placement;
    if (placement && Object.keys(placement).length) {
      lines.push('', 'Мой вариант распределения:');
      q.dd.items.forEach((text, i) => {
        if (placement[i] === undefined) return;
        lines.push(`  ${text} → ${q.dd.buckets[placement[i]]?.label ?? '?'}`);
      });
    }
  } else if (q.o) {
    lines.push('');
    Object.keys(q.o).forEach(k => lines.push(`${k}. ${q.o[k]}`));
    lines.push('', `Правильный ответ: ${String(q.a).split('').join(', ')}`);
    if (answer?.given?.length) lines.push(`Мой ответ: ${answer.given.join(', ')}`);
  }
  return lines.join('\n');
}

// items: [{ q, answer }]. One item reads as "я ошибся в таком вопросе"; several read as a
// batch, which is what "Все ошибки домена" produces.
export function buildPrompt({
  items, parts, profile = {}, weakDomain = null, domainName = () => null, imagesAttached = false,
}) {
  const enabled = PROMPT_PARTS.filter(p => parts.has(p.id));
  const steps = enabled.filter(p => p.line);
  const tails = enabled.filter(p => p.tail);

  const level = LEVELS[profile.level] || 'готовлюсь к экзамену';
  const weak = weakDomain ? `, слабый домен ${weakDomain}` : '';
  const topics = [...new Set(items.map(({ q }) => q.tp).filter(t => t && t !== CATCH_ALL))];

  const out = [`Ты преподаёшь CCNA 200-301. Я ${level}${weak}.`];
  if (topics.length) out.push('', `Тема: ${topics.join(', ')}.`);

  out.push('', items.length === 1
    ? 'Я ошибся в таком вопросе:'
    : `Ниже ${items.length} вопрос(ов), на которые я ответил неправильно. Разбери каждый.`);
  out.push('', items
    .map(({ q, answer }) => questionToText(q, answer, domainName(q.dom), imagesAttached))
    .join('\n\n---\n\n'));

  if (steps.length) {
    out.push('', 'Сделай по порядку:');
    steps.forEach((p, i) => out.push(`${i + 1}. ${p.line}`));
  }
  for (const t of tails) out.push('', t.tail);

  return out.join('\n');
}
