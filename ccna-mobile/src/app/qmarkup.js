// Markup shared by the question screen and the review list: the parts that describe a
// question and its answer, without any of the interaction around them.
import { esc } from './dom.js';
import { parseCli } from '../engine/cli.js';
import { ddExpected, ddNeeded } from '../engine/grade.js';
import { rationaleView } from '../engine/rationale.js';

export const domShort = (bank, id) => {
  const d = bank.meta.domains.find(x => x.id === id);
  return d ? d.name.replace(/^\d+\.\d+\s+/, '') : id;
};

// Defined in the engine so the screen and the exported AI prompt agree on the wording.
export { questionText } from '../engine/ai-prompt.js';

export const exhibitMarkup = q => q.img
  ? `<img class="q-exhibit" src="images/exhibits/${esc(q.img)}" alt="Схема к вопросу ${q.n}" loading="lazy">`
  : '';

// Whether the reader has the command output open. A screen that rebuilds itself — grading
// the answer, placing a chip — would otherwise hand back a collapsed block: the page gets
// shorter, the scroll position it was holding no longer exists, and the whole thing reads
// as a reload. Keyed by question, cleared when the run ends.
const cliOpen = new Set();
export const setCliOpen = (qn, open) => open ? cliOpen.add(qn) : cliOpen.delete(qn);
export const forgetCliOpen = () => cliOpen.clear();

export function cliMarkup(text, qn) {
  const cli = parseCli(text);
  if (!cli) return '';
  return cli.long
    ? `<details class="cli"${cliOpen.has(qn) ? ' open' : ''}><summary>Показать вывод команды (${cli.lines.length} стр.)</summary><pre>${esc(cli.text)}</pre></details>`
    : `<pre class="cli plain">${esc(cli.text)}</pre>`;
}

export const countRight = (q, placement) => ddExpected(q)
  .filter((bucket, i) => bucket !== null && placement[i] === bucket).length;

// One line under the verdict. A matching question has no answer letters, and placing
// every required item right while dropping a distractor into a category still grades as
// wrong — so say which of the two happened instead of printing a bare count.
export function answerSummary(q, given) {
  if (q.y === 'dd') {
    const placement = given?.placement || {};
    const expected = ddExpected(q);
    const needed = ddNeeded(q);
    const right = countRight(q, placement);
    const strays = expected.filter((bucket, i) => bucket === null && placement[i] !== undefined).length;
    if (right === needed && strays) {
      return strays === 1
        ? 'лишний элемент попал в категорию — ему место в банке'
        : 'лишние элементы попали в категории — им место в банке';
    }
    return `разложено верно ${right} из ${needed}`;
  }
  const keys = String(q.a || '').split('');
  const texts = keys.map(k => q.o?.[k]).filter(Boolean);
  const multiline = texts.some(t => t.includes('\n'));
  const text = texts.join(multiline ? '\n' : ' · ');
  return `правильный ответ ${keys.join(', ')}${text ? (multiline ? `\n${text}` : ` · ${text}`) : ''}`;
}

// The full key laid out per category, ticking what was placed right — the information
// the web app's ddReview() gives, without redrawing a board nobody can touch.
export function ddAnswerMarkup(q, placement) {
  const rows = q.dd.buckets.map((b, bi) => {
    const items = b.correct.map(text => {
      const i = q.dd.items.indexOf(text);
      const right = placement[i] === bi;
      return `<span class="placed-chip${right ? ' correct' : ''}">${esc(text)}${right ? ' ✓' : ''}</span>`;
    }).join('');
    return `<div class="bucket"><div class="bucket-head"><span class="bucket-title mono">${esc(b.label)}</span></div>
      <div class="bucket-items">${items}</div></div>`;
  }).join('');

  const expected = ddExpected(q);
  const distractors = q.dd.items.filter((_, i) => expected[i] === null);
  return `<div class="buckets review-buckets">${rows}</div>` + (distractors.length
    ? `<p class="match-hint">Лишние элементы, которым не место ни в одной категории:
       ${esc(distractors.join(' · '))}</p>`
    : '');
}

// Why-blocks for the review sheet and the review list.
export function rationaleBlocks(q, given) {
  const view = rationaleView(q, given?.given || []);
  if (view.mode === 'options') {
    return view.options.map(o => `
      <div class="why">
        <div class="why-h${o.correct ? '' : ' bad'}">Почему${o.correct ? '' : ' не'} ${o.key}</div>
        ${o.why ? `<p>${esc(o.why)}</p>` : '<p class="muted">Пояснение для этого варианта пока не готово.</p>'}
      </div>`).join('') + disputedNote(view);
  }
  const board = q.y === 'dd' ? ddAnswerMarkup(q, given?.placement || {}) : '';
  const prose = view.exp
    ? `<p>${esc(view.exp)}</p>`
    : '<p class="muted">Подробное пояснение пока не готово для этого вопроса.</p>';
  return `${board}<div class="why">${prose}</div>${disputedNote(view)}`;
}

const disputedNote = view => view.disputed
  ? '<div class="why disputed"><p>Спорный ключ — сверь по схеме.</p></div>'
  : '';
