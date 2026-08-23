// Answer checking — lifted from app.js (isCorrect, ddExpected, ddNeeded, ddCorrect).
// Pure functions over a question and the stored answer; no DOM, no session globals.
//
// Answer shape (same as the web app stores in S.ans):
//   multiple choice   { given: ['A', 'C'] }
//   drag and drop     { placement: { itemIndex: bucketIndex } }

// Sorted key letters, so 'CA' and ['C','A'] compare equal.
const sortedKey = a => String(a || '').split('').sort().join('');

// A stored answer with nothing left in it. Both writers save on every tap, including the
// tap that clears the last option or pulls the last chip back out of the buckets, and what
// they hand over then is `{ given: [] }` / `{ placement: {} }`. A session counts a question
// as answered by the answer merely existing, so storing that would tick the cell in the ☰
// grid and walk «Остались вопросы без ответа» straight past a question nobody answered.
//
// `ok` is the record of having been graded, which is an answer whatever its shape.
export function isEmptyAnswer(ans) {
  if (!ans || ans.ok !== undefined) return false;
  if (Array.isArray(ans.given)) return ans.given.length === 0;
  if (ans.placement) return Object.keys(ans.placement).length === 0;
  return false;
}

export function isCorrect(q, ans) {
  if (!ans) return false;
  if (q.y === 'dd') return ddCorrect(q, ans.placement || {});
  return (ans.given || []).slice().sort().join('') === sortedKey(q.a);
}

// Where each item belongs: bucket index, or null for a distractor that belongs nowhere
// and must stay in the bank.
//
// Items are matched to buckets by their text (that is how the bank stores them), so two
// identical strings in `items` would both resolve to the first index. The bank is checked
// for that in tests/grade.test.js.
export function ddExpected(q) {
  const expected = q.dd.items.map(() => null);
  q.dd.buckets.forEach((b, bi) => {
    for (const text of b.correct) {
      const i = q.dd.items.indexOf(text);
      if (i >= 0) expected[i] = bi;
    }
  });
  return expected;
}

// How many items have to be placed before "Проверить" may be enabled — distractors are
// excluded, so this can be smaller than items.length.
export function ddNeeded(q) {
  return q.dd.buckets.reduce((a, b) => a + b.correct.length, 0);
}

// How many of the needed slots a placement actually fills. A distractor is placed like
// anything else but belongs in no bucket, so it fills nothing: counting raw placements
// would call a board finished while required items were still in the bank, and could
// report more filled slots than there are (the «5 из 4» in the question header).
export function ddFilled(q, placement) {
  const expected = ddExpected(q);
  return Object.keys(placement).filter(i => expected[i] != null).length;
}

// Most matching questions have named targets — "TCP" against "UDP", one state against
// another — and putting an item under the wrong name is simply wrong. A handful number their
// targets instead, or repeat one word across all of them, and say so in the stem: "drag the
// characteristics onto any position on the right". There the four right characteristics are
// right in any arrangement, and Cisco marks them on the set, not on the mapping.
//
// Ordering language is the exception to the exception: #383 numbers its targets too, but
// asks for them "beginning with the lowest and ending with the highest administrative
// distance", and #665 says "onto the sequence on the right". Those numbers are a real order.
//
// In this bank the rule picks out 261, 592 and 1001, and leaves the other 156 alone.
const ANY_POSITION = /any (of the )?positions?\b/i;
const ORDERED = /\bsequence\b|\bin order\b|beginning with|lowest[\s\S]*highest|first[\s\S]*then/i;

export function ddPositional(q) {
  const stem = q.t || '';
  if (ORDERED.test(stem)) return false;
  const labels = q.dd.buckets.map(b => String(b.label).trim().toLowerCase());
  // A single target is trivially "all the same"; the interesting case is several of them.
  return (labels.length > 1 && new Set(labels).size === 1) || ANY_POSITION.test(stem);
}

// Correct iff every item sits where it belongs, distractors included: leaving a
// distractor in the bank is part of the right answer. When the targets are interchangeable
// the same test applies to the set instead — the right items, one per position, in any
// arrangement.
export function ddCorrect(q, placement) {
  const expected = ddExpected(q);
  if (ddPositional(q)) {
    const perBucket = q.dd.buckets.map(() => 0);
    for (const bi of Object.values(placement)) {
      if (perBucket[bi] === undefined) return false;
      perBucket[bi]++;
    }
    if (!q.dd.buckets.every((b, bi) => perBucket[bi] === b.correct.length)) return false;
    const placed = Object.keys(placement).map(Number).sort((a, b) => a - b);
    const belongs = expected.map((v, i) => (v === null ? -1 : i)).filter(i => i >= 0).sort((a, b) => a - b);
    return placed.length === belongs.length && placed.every((v, k) => v === belongs[k]);
  }
  return q.dd.items.every((_, i) =>
    (placement[i] === undefined ? null : placement[i]) === expected[i]);
}

// Where a placed item counts as right. Under interchangeable targets that is any bucket at
// all, so the review must not put a red cross on a correct characteristic in position 3.
export function ddItemRight(q, placement, i) {
  const expected = ddExpected(q);
  if (placement[i] === undefined) return false;
  return ddPositional(q) ? expected[i] !== null : expected[i] === placement[i];
}
