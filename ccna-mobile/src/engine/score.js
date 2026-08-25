// Scoring — lifted from finishExam() in app.js.
//
// The scale itself is shared with the web trainer (see the import below): both clients
// file attempts into the same history, so a score computed on the phone and one computed
// in the browser have to come out of the same formula.
import { isCorrect } from './grade.js';
import { PASS_SCALED, SCALE_MIN, SCALE_MAX, toScaled } from '../../../ccna-exam-simulator/assets/js/shared/score.js?v=19';

export { PASS_SCALED, SCALE_MIN, SCALE_MAX, toScaled };

// questions: the asked set. answers: { [q.n]: storedAnswer }. domains: meta.domains.
// Returns { ok, pct, scaled, pass, perDomain, review } — review keeps the asked order so
// the results screen can render "разбор всех N" without re-deriving anything.
export function scoreAttempt(questions, answers, domains) {
  const perDomain = {};
  for (const d of domains) perDomain[d.id] = { ok: 0, tot: 0 };

  let ok = 0;
  const review = [];
  for (const q of questions) {
    const good = isCorrect(q, answers[q.n]);
    if (good) ok++;
    if (!perDomain[q.dom]) {
      throw new Error(`scoreAttempt: question ${q.n} has domain "${q.dom}", which is not in meta.domains`);
    }
    perDomain[q.dom].tot++;
    if (good) perDomain[q.dom].ok++;
    review.push({ q, good });
  }

  // finishExam() is never reached with an empty set (beginExam refuses to start one),
  // but a module can be called from anywhere — return zeros instead of NaN.
  const pct = questions.length ? Math.round((ok / questions.length) * 100) : 0;
  const scaled = toScaled(pct);
  return { ok, pct, scaled, pass: scaled >= PASS_SCALED, perDomain, review };
}
