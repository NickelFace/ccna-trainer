// Tap-to-match — the replacement for drag & drop (spec 05).
//
// The web app wires HTML5 dragstart/drop, which simply does not fire on Android touch;
// its tap fallback is undocumented and easy to miss. Here dragging is gone entirely:
// tap an item, tap a category, done. Everything else about the answer is unchanged —
// grading still goes through ddCorrect/ddNeeded from the engine, distractors included.
import { esc } from './dom.js';
import { store } from './store.js';
import { ddCorrect, ddExpected, ddNeeded } from '../engine/grade.js';
import { gradesImmediately } from './session.js';

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

export const placedCount = () => Object.keys(state.placement).length;
export const matchComplete = q => placedCount() >= ddNeeded(q);
export const selectedItem = q => state.selected === null ? null : q.dd.items[state.selected];

const inBucket = bi => Object.entries(state.placement)
  .filter(([, b]) => b === bi)
  .map(([i]) => +i);

// ---------------------------------------------------------------- markup
export function matchBody(q, graded) {
  const expected = graded ? ddExpected(q) : null;

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
      if (graded) cls.push(expected[i] === bi ? 'correct' : 'wrong');
      return `<span class="${cls.join(' ')}">${esc(q.dd.items[i])}${graded ? '' : `<button class="chip-x" data-unplace="${i}" type="button" aria-label="Убрать">✕</button>`}</span>`;
    }).join('');

    const armed = state.selected !== null && !graded;
    return `
      <div class="bucket${armed ? ' armed' : ''}" data-bucket="${bi}">
        <div class="bucket-head">
          <span class="bucket-title mono">${esc(b.label)}</span>
          ${armed ? `<span class="bucket-hint">тапни, чтобы положить</span>` : ''}
        </div>
        ${chips ? `<div class="bucket-items">${chips}</div>` : ''}
        ${free > 0 && !graded ? `<div class="bucket-free">${free} ${plural(free, 'место', 'места', 'мест')} свободно</div>` : ''}
      </div>`;
  }).join('');

  return `
    <div class="match">
      <p class="match-hint">Тапни элемент, затем категорию. Тянуть ничего не нужно.</p>
      <div class="chips">${bank}</div>
      <div class="buckets">${buckets}</div>
    </div>`;
}

const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

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
