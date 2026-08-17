// Answer checking — lifted from app.js (isCorrect, ddExpected, ddNeeded, ddCorrect).
// Pure functions over a question and the stored answer; no DOM, no session globals.
//
// Answer shape (same as the web app stores in S.ans):
//   multiple choice   { given: ['A', 'C'] }
//   drag and drop     { placement: { itemIndex: bucketIndex } }

// Sorted key letters, so 'CA' and ['C','A'] compare equal.
const sortedKey = a => String(a || '').split('').sort().join('');

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

// Correct iff every item sits where it belongs, distractors included: leaving a
// distractor in the bank is part of the right answer.
export function ddCorrect(q, placement) {
  const expected = ddExpected(q);
  return q.dd.items.every((_, i) =>
    (placement[i] === undefined ? null : placement[i]) === expected[i]);
}
