// Tap-to-match — the replacement for drag & drop (spec 05).
//
// The web app wires HTML5 dragstart/drop, which simply does not fire on Android touch;
// its tap fallback is undocumented and easy to miss. Here dragging is gone entirely:
// tap an item, tap a category, done. Everything else about the answer is unchanged —
// grading still goes through ddCorrect/ddNeeded from the engine, distractors included.
import { esc } from './dom.js';
import { store } from './store.js';
import { ddCorrect, ddFilled, ddItemRight, ddNeeded } from '../engine/grade.js';
import { gradesImmediately } from './session.js';
import { t, pluralWord, WORDS } from './i18n.js';

// { qn, placement: { itemIndex: bucketIndex }, selected: itemIndex | null }
let state = { qn: null, placement: {}, selected: null };

// Re-seed when the question changes, or when the same question is revisited and the
// session already holds a placement for it.
export function syncMatch(q, session) {
  if (state.qn === q.n) return;
  const stored = session.answers[q.n];
  state = { qn: q.n, placement: { ...(stored?.placement || {}) }, selected: null };
}

export const resetMatch = () => { state = { qn: null, placement: {}, selected: null }; };

// Two different counts, and the difference is the distractors. «Сброс» asks whether there
// is anything at all to take back off the board, so it wants the raw number; the progress
// readout and «Проверить» ask how much of the answer is built, which only the items that
// belong somewhere can move — see ddFilled.
export const placedCount = () => Object.keys(state.placement).length;
export const filledCount = q => ddFilled(q, state.placement);
export const matchComplete = q => filledCount(q) >= ddNeeded(q);

// «Проверить» used to wait for matchComplete, and on a question with distractors that could
// not be satisfied at all. filledCount ignores a chip that belongs nowhere, so parking a
// distractor in a bucket fills the slot on screen without moving the count: every bucket
// full, board visibly finished, button still grey, and nothing on screen saying which of
// the seven chips was the wrong one to place. Question 132 is the worst of them — four
// slots, seven chips, three of which belong nowhere.
//
// So the gate is now only "is there anything to grade". Nothing about marking changes:
// ddCorrect still demands every chip sit exactly where it belongs and every distractor stay
// in the bank, so an unfinished board is graded wrong — which is the answer the learner
// asked for, and infinitely better than a dead button.
export const canCheck = () => placedCount() > 0;

// Shown above the button. Deliberately the filled count and not the raw one: it reports how
// much of the *answer* is built, which is the thing worth knowing, and an earlier fix moved
// the readout here precisely so it could not run past the number of slots. A count that
// sits still while chips go down is only confusing without the line below it, so both are
// shown together — how much of the answer stands, and how many chips belong nowhere.
export const matchProgress = q => ({
  filled: filledCount(q),
  needed: ddNeeded(q),
  extra: q.dd.items.length - ddNeeded(q),
});
export const selectedItem = q => state.selected === null ? null : q.dd.items[state.selected];

const inBucket = bi => Object.entries(state.placement)
  .filter(([, b]) => b === bi)
  .map(([i]) => +i);

// ---------------------------------------------------------------- markup
export function matchBody(q, graded) {

  const bank = q.dd.items.map((text, i) => {
    const cls = ['chip'];
    if (state.placement[i] !== undefined) cls.push('placed');
    else if (state.selected === i) cls.push('sel');
    return `<button class="${cls.join(' ')}" data-item="${i}" type="button" ${graded ? 'disabled' : ''}>${esc(text)}</button>`;
  }).join('');

  const buckets = q.dd.buckets.map((b, bi) => {
    const items = inBucket(bi);
    const free = b.correct.length - items.length;
    const chips = items.map(i => {
      const cls = ['placed-chip'];
      // Under interchangeable targets a right characteristic is right wherever it sits, so
      // the mark comes from ddItemRight rather than from this bucket's index.
      if (graded) cls.push(ddItemRight(q, state.placement, i) ? 'correct' : 'wrong');
      return `<span class="${cls.join(' ')}">${esc(q.dd.items[i])}${graded ? '' : `<button class="chip-x" data-unplace="${i}" type="button" aria-label="${esc(t('match.removeAria'))}">✕</button>`}</span>`;
    }).join('');

    const armed = state.selected !== null && !graded;
    return `
      <div class="bucket${armed ? ' armed' : ''}" data-bucket="${bi}">
        <div class="bucket-head">
          <span class="bucket-title mono">${esc(b.label)}</span>
          ${armed ? `<span class="bucket-hint">${esc(t('match.tapToPlace'))}</span>` : ''}
        </div>
        ${chips ? `<div class="bucket-items">${chips}</div>` : ''}
        ${free > 0 && !graded ? `<div class="bucket-free">${esc(t('match.freeSlot', { n: free, slots: pluralWord(free, WORDS.slots) }))}</div>` : ''}
      </div>`;
  }).join('');

  return `
    <div class="match">
      <p class="match-hint">${esc(t('match.hint'))}</p>
      <div class="chips">${bank}</div>
      <div class="buckets">${buckets}</div>
    </div>`;
}

// ---------------------------------------------------------------- behaviour
// onChange re-renders the screen; the caller owns rendering, this module owns the state.
export function wireMatch(node, q, session, onChange) {
  node.addEventListener('click', e => {
    const unplace = e.target.closest('[data-unplace]');
    if (unplace) {
      delete state.placement[+unplace.dataset.unplace];
      persist(q, session);
      return onChange();
    }

    const item = e.target.closest('[data-item]');
    if (item) {
      const i = +item.dataset.item;
      // Tapping something already placed pulls it back out — no need to hunt for the ✕.
      if (state.placement[i] !== undefined) {
        delete state.placement[i];
        state.selected = i;
      } else {
        state.selected = state.selected === i ? null : i;
      }
      persist(q, session);
      return onChange();
    }

    const bucket = e.target.closest('[data-bucket]');
    if (bucket && state.selected !== null) {
      state.placement[state.selected] = +bucket.dataset.bucket;
      state.selected = null;
      persist(q, session);
      return onChange();
    }
  });
}

export function clearSelection(onChange) {
  state.selected = null;
  onChange();
}

export function resetPlacement(q, session, onChange) {
  state.placement = {};
  state.selected = null;
  persist(q, session);
  onChange();
}

// In an exam the board is the answer and is saved on every move, exactly like the
// multiple-choice screen. Where the rationale is shown as you go, nothing is committed
// until "Проверить" — a half-built board is not an answer.
function persist(q, session) {
  if (gradesImmediately(session)) return;
  store.answer(q.n, { placement: { ...state.placement } });
}

export function gradeMatch(q, session) {
  const placement = { ...state.placement };
  const ok = ddCorrect(q, placement);
  store.answer(q.n, { placement, ok });
  store.recordAnswer(q.n, ok, session.mode);
  return ok;
}
