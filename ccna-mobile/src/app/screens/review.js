// Review of a finished attempt: every question with its verdict and rationale, filtered
// to mistakes by default — that is what anyone opens this for.
import { esc, h } from '../dom.js';
import { isCorrect } from '../../engine/grade.js';
import { domShort, questionText, exhibitMarkup, cliMarkup, answerSummary, rationaleBlocks } from '../qmarkup.js';
import { openExhibit } from '../exhibit.js';
import { t } from '../i18n.js';

const FILTERS = () => [
  { id: 'bad', label: t('review.filter.bad') },
  { id: 'all', label: t('review.filter.all') },
  { id: 'ok', label: t('review.filter.ok') },
];

// Rendering 100 questions with full rationale at once is a second of jank on a phone;
// the list grows in pages instead, which is invisible in practice because nobody reads
// past the first few without scrolling.
const PAGE = 15;

let shown = PAGE;
let filter = 'bad';

const rowsFor = (attempt, bank) => attempt.qs
  .map(qn => {
    const q = bank.byN.get(qn);
    return q ? { q, given: attempt.answers[qn], good: isCorrect(q, attempt.answers[qn]) } : null;
  })
  .filter(Boolean);

const itemMarkup = ({ q, given, good }, bank) => `
  <div class="review-item ${good ? 'ok' : 'bad'}">
    <div class="q-badges">
      <span class="badge-dom">${esc(domShort(bank, q.dom))}</span>
      <span class="mono q-num">№${q.n}</span>
      <span class="verdict-badge ${good ? 'ok' : 'bad'}">${good ? esc(t('review.verdict.ok')) : esc(t('review.verdict.bad'))}</span>
    </div>
    ${exhibitMarkup(q)}
    <div class="review-qtext">${esc(questionText(q))}</div>
    ${cliMarkup(q.cli)}
    <div class="review-summary muted">${esc(answerSummary(q, given))}</div>
    ${rationaleBlocks(q, given)}
  </div>`;

export const review = {
  id: 'review',

  header: ctx => {
    const b = document.createElement('button');
    b.className = 'back-btn';
    b.type = 'button';
    b.innerHTML = `<span class="mono">←</span> ${esc(t('review.header'))}`;
    b.addEventListener('click', () => ctx.router.back());
    return b;
  },

  render(ctx) {
    const { attempt } = ctx.params;
    const { bank } = ctx;
    if (ctx.params.filter && ctx.params.filter !== filter) { filter = ctx.params.filter; shown = PAGE; }

    const all = rowsFor(attempt, bank);
    const counts = { all: all.length, bad: all.filter(r => !r.good).length, ok: all.filter(r => r.good).length };
    const list = all.filter(r => filter === 'all' || (filter === 'bad' ? !r.good : r.good));
    const page = list.slice(0, shown);

    const chips = FILTERS().map(f =>
      `<button class="pill${f.id === filter ? ' on' : ''}" data-filter="${f.id}" type="button">
         ${esc(f.label)}<span class="pill-count mono">${counts[f.id]}</span>
       </button>`).join('');

    const node = h(`
      <div class="review-filters">${chips}</div>
      ${page.length
        ? page.map(r => itemMarkup(r, bank)).join('')
        : `<p class="muted">${filter === 'bad' ? esc(t('review.noMistakes')) : esc(t('review.empty'))}</p>`}
      ${list.length > page.length
        ? `<button class="btn wide" data-act="more" type="button">${esc(t('review.showMore', { n: Math.min(PAGE, list.length - page.length) }))}</button>`
        : ''}
    `);

    node.addEventListener('click', e => {
      const img = e.target.closest('.q-exhibit');
      if (img) return openExhibit(img.src, img.alt);

      const chip = e.target.closest('[data-filter]');
      if (chip) {
        filter = chip.dataset.filter;
        shown = PAGE;
        // params carry the initial filter; clear it so re-renders keep the user's choice
        ctx.params.filter = null;
        return ctx.router.render();
      }

      if (e.target.closest('[data-act="more"]')) {
        shown += PAGE;
        return ctx.router.render();
      }
    });

    return node;
  },

  unmount() {
    shown = PAGE;
    filter = 'bad';
  },
};
