// What the answer review should contain — the branching half of rationale() in app.js,
// with the markup and the Russian copy left to the screen.
//
// The rule the web app established and the mockups keep (screen 04): show the option
// blocks the learner actually needs, not all of them.
//   • multi-answer question  — every option, so the full picture is visible;
//   • single answer, correct — only the correct option;
//   • single answer, wrong   — the option that was picked AND the correct one.

const sortedKey = a => String(a || '').split('').sort().join('');

// Returns one of three shapes:
//   { mode: 'prose',   exp, disputed }              drag-and-drop or no options at all
//   { mode: 'key',     key, exp, disputed }         options exist but the bank has no per-option why
//   { mode: 'options', key, options, disputed }     the normal case
// where option = { key, text, why, correct, picked, missed }.
export function rationaleView(q, given = []) {
  const disputed = !!q.disp;
  const key = String(q.a || '').split('');

  if (q.y === 'dd' || !q.o || !Object.keys(q.o).length) {
    return { mode: 'prose', exp: q.exp || null, disputed };
  }
  if (!q.why) {
    return { mode: 'key', key, exp: q.exp || null, disputed };
  }

  const multi = q.a.length > 1;
  const answeredOk = given.length > 0 && given.slice().sort().join('') === sortedKey(q.a);

  const options = [];
  for (const k of Object.keys(q.o)) {
    const correct = q.a.includes(k);
    const picked = given.includes(k);
    const show = multi ? true : (answeredOk ? correct : (picked || correct));
    if (!show) continue;
    options.push({
      key: k,
      text: q.o[k],
      why: q.why[k] || null,
      correct,
      picked,
      // "пропущен": a correct option the learner failed to tick on a multi-answer question.
      missed: multi && correct && !picked,
    });
  }
  return { mode: 'options', key, options, disputed };
}
