// Scoring — lifted from finishExam() in app.js.
//
// Cisco reports 300..1000 with 825 to pass; the map from raw percentage is linear. The
// rounding order matters and is preserved exactly: the percentage is rounded to a whole
// number FIRST, and the scaled score is computed from that rounded value. 73/100 gives
// pct 73 and scaled 811 — computing from the unrounded ratio would drift by a point.
import { isCorrect } from './grade.js';

export const PASS_SCALED = 825;
export const SCALE_MIN = 300;
export const SCALE_MAX = 1000;

export const toScaled = pct => Math.round(SCALE_MIN + (pct / 100) * (SCALE_MAX - SCALE_MIN));

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
