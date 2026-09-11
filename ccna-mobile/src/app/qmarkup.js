// Markup shared by the question screen and the review list: the parts that describe a
// question and its answer, without any of the interaction around them.
import { esc } from './dom.js';
import { parseCli } from '../engine/cli.js';
import { ddExpected, ddNeeded } from '../engine/grade.js';
import { rationaleView } from '../engine/rationale.js';
import { t, getLang, pluralWord } from './i18n.js';

export const domShort = (bank, id) => {
  const d = bank.meta.domains.find(x => x.id === id);
  return d ? d.name.replace(/^\d+\.\d+\s+/, '') : id;
};

// Defined in the engine so the screen and the exported AI prompt agree on the wording.
export { questionText } from '../engine/ai-prompt.js';

export const exhibitMarkup = q => q.img
  ? `<img class="q-exhibit" src="images/exhibits/${esc(q.img)}" alt="${esc(t('question.exhibitAlt', { n: q.n }))}" loading="lazy">`
  : '';

const LINES = { ru: ['строка', 'строки', 'строк'], en: ['line', 'lines'] };

// The output is always open: it is what the question is asking about, and a tap to reveal
// it was one step in front of every such question. Long output gets a scrolling window
// instead (see parseCli), so it still cannot push the options off the screen.
//
// The footer is a caption plus a second way into the full-screen viewer — the double tap
// that also opens it is not discoverable on its own, and it does not exist for a mouse.
export function cliMarkup(text) {
  const cli = parseCli(text);
  if (!cli) return '';
  const n = cli.lines.length;
  const vars = { n, lines: pluralWord(n, LINES) };
  const caption = t(cli.windowed ? 'question.cliLinesScroll' : 'question.cliLines', vars);
  return `<div class="cli-wrap">
      <pre class="cli${cli.windowed ? ' windowed' : ''}">${esc(cli.text)}</pre>
      <div class="cli-foot">
        <span class="cli-lines mono">${esc(caption)}</span>
        <button class="cli-expand" type="button">${esc(t('question.cliOpen'))}</button>
      </div>
    </div>`;
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
      return strays === 1 ? t('qmarkup.extraItem') : t('qmarkup.extraItems');
    }
    return t('qmarkup.placedRight', { right, needed });
  }
  const keys = String(q.a || '').split('');
  const texts = keys.map(k => q.o?.[k]).filter(Boolean);
  const multiline = texts.some(x => x.includes('\n'));
  const text = texts.join(multiline ? '\n' : ' · ');
  return t('qmarkup.correctAnswer', { keys: keys.join(', ') }) + (text ? (multiline ? `\n${text}` : ` · ${text}`) : '');
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
    ? `<p class="match-hint">${esc(t('qmarkup.extraNotPlaced', { items: distractors.join(' · ') }))}</p>`
    : '');
}

// Why-blocks for the review sheet and the review list.
export function rationaleBlocks(q, given) {
  const view = rationaleView(q, given?.given || [], getLang());
  if (view.mode === 'options') {
    return view.options.map(o => `
      <div class="why">
        <div class="why-h${o.correct ? '' : ' bad'}">${esc(o.correct ? t('qmarkup.why', { key: o.key }) : t('qmarkup.whyNot', { key: o.key }))}</div>
        ${o.why ? `<p>${esc(o.why)}</p>` : `<p class="muted">${esc(t('qmarkup.whyMissing'))}</p>`}
      </div>`).join('') + disputedNote(view);
  }
  const board = q.y === 'dd' ? ddAnswerMarkup(q, given?.placement || {}) : '';
  const prose = view.exp
    ? `<p>${esc(view.exp)}</p>`
    : `<p class="muted">${esc(t('qmarkup.expMissing'))}</p>`;
  return `${board}<div class="why">${prose}</div>${disputedNote(view)}`;
}

const disputedNote = view => view.disputed
  ? `<div class="why disputed"><p>${esc(t('qmarkup.disputed'))}</p></div>`
  : '';
