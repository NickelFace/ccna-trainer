// Readiness and the score forecast.
//
// One place owns this formula, for both clients, stated plainly:
//
//   1. Take the last N answers across the attempt history, newest first.
//   2. Per domain, compute the share answered correctly.
//   3. Weight those shares by the Cisco blueprint weights.
//   4. A domain with no answers in the window is not simply ignored — that would let
//      someone drill one easy domain and read a flattering number. It is assumed to sit
//      at UNSEEN_FACTOR of the measured average, which pulls the forecast down until the
//      blueprint is actually covered.
//   5. Map the resulting share onto the 300..1000 scale with the same function the exam
//      result uses, so the forecast and a real score are directly comparable.
//
// Readiness percent and the forecast are two views of one number: readiness is the
// weighted share itself, the forecast is that share put on the Cisco scale.
//
// `isCorrect` is a parameter rather than an import, for the same reason it is one in
// progress.js: the web trainer grades inside app.js, a classic script that cannot load a
// module, and putting the grading behind a module that might not load would take the exam
// down with it. ccna-mobile/src/engine/readiness.js binds its own and re-exports.
import { toScaled } from './score.js?v=20';

export const WINDOW = 200;
export const UNSEEN_FACTOR = 0.7;

// Newest-first stream of { q, correct } over the attempt history.
function recentAnswers(attempts, byN, isCorrect, window) {
  const out = [];
  for (let i = attempts.length - 1; i >= 0 && out.length < window; i--) {
    const attempt = attempts[i];
    for (let k = attempt.qs.length - 1; k >= 0 && out.length < window; k--) {
      const qn = attempt.qs[k];
      const q = byN.get(qn);
      const answer = attempt.answers[qn];
      if (!q || answer === undefined) continue;      // skipped or dropped from the bank
      out.push({ q, correct: isCorrect(q, answer) });
    }
  }
  return out;
}

export function readiness(attempts, byN, domains, isCorrect, { window = WINDOW } = {}) {
  // A repetition session (startSrs) deliberately re-serves material already flagged
  // wrong — that is its whole job. Folding those answers into the forecast would punish
  // exactly the most disciplined behavior: the more faithfully mistakes get reviewed, the
  // worse "Готовность" would read on the day it happens. The SRS map itself (store.srs)
  // still records the outcome regardless — only this forecast window excludes it.
  const nonSrs = attempts.filter(a => a.mode !== 'srs');
  const answers = recentAnswers(nonSrs, byN, isCorrect, window);
  if (!answers.length) {
    return { pct: 0, forecast: null, sample: 0, covered: 0, perDomain: {} };
  }

  const perDomain = {};
  for (const d of domains) perDomain[d.id] = { ok: 0, tot: 0, pct: null };
  for (const { q, correct } of answers) {
    const row = perDomain[q.dom];
    if (!row) continue;
    row.tot++;
    if (correct) row.ok++;
  }

  let coveredWeight = 0, weightedSum = 0;
  for (const d of domains) {
    const row = perDomain[d.id];
    if (!row.tot) continue;
    row.pct = Math.round((row.ok / row.tot) * 100);
    coveredWeight += d.weight;
    weightedSum += d.weight * (row.ok / row.tot);
  }
  if (!coveredWeight) return { pct: 0, forecast: null, sample: answers.length, covered: 0, perDomain };

  const measured = weightedSum / coveredWeight;                 // average over what is known
  const assumed = measured * UNSEEN_FACTOR;                     // stand-in for the rest
  const share = weightedSum + (1 - coveredWeight) * assumed;

  const pct = Math.round(share * 100);
  return {
    pct,
    forecast: toScaled(pct),
    sample: answers.length,
    covered: Math.round(coveredWeight * 100),
    perDomain,
  };
}

// Same computation over the history as it stood `sinceMs` ago, so the home screen can say
// how much the forecast moved this week. Null when there is nothing to compare against.
export function readinessDelta(attempts, byN, domains, isCorrect, sinceMs, opts = {}) {
  const now = readiness(attempts, byN, domains, isCorrect, opts);
  if (now.forecast === null) return null;
  const older = attempts.filter(a => a.date <= sinceMs);
  if (!older.length) return null;
  const before = readiness(older, byN, domains, isCorrect, opts);
  if (before.forecast === null) return null;
  return now.forecast - before.forecast;
}
