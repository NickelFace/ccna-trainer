// Derived statistics over the attempt history.
//
// Nothing here is stored: attempts hold the raw answers, everything else is recomputed.
// That way a fix to the bank or to the grading rules is reflected in old attempts too,
// instead of freezing yesterday's verdict into the history.
import { isCorrect } from './grade.js';
import { PASS_SCALED } from './score.js';

// Two different scales, two different thresholds — mixing them up paints a passing score
// amber. Domain bars go by percentage (>=82 ok, 60..81 warn); the score itself goes by
// the 300..1000 scale (>=825 pass, 780..824 "почти", below that err).
export const toneFor = pct => pct >= 82 ? 'ok' : pct >= 60 ? 'warn' : 'err';
export const scoreTone = scaled => scaled >= PASS_SCALED ? 'ok' : scaled >= 780 ? 'warn' : 'err';

export const msPerQuestion = attempt =>
  attempt.total ? Math.round(attempt.durationMs / attempt.total) : 0;

// Difference in scaled score against the previous attempt, or null for the first one.
export function scaledDelta(attempts, index = attempts.length - 1) {
  if (index <= 0 || index >= attempts.length) return null;
  return attempts[index].scaled - attempts[index - 1].scaled;
}

export const pointsToPass = attempt => PASS_SCALED - attempt.scaled;

// "General" is the dump's catch-all for questions that were never tagged, not a subject
// anyone can go and study — it is aggregated but never offered as something to work on.
const CATCH_ALL = 'General';

// [{ topic, dom, ok, tot, pct }] across every attempt, worst first.
export function topicStats(attempts, byN) {
  const acc = new Map();
  for (const attempt of attempts) {
    for (const qn of attempt.qs) {
      const q = byN.get(qn);
      if (!q) continue;                       // question dropped from the bank since
      const key = q.tp || CATCH_ALL;
      const row = acc.get(key) || { topic: key, dom: q.dom, ok: 0, tot: 0 };
      row.tot++;
      if (isCorrect(q, attempt.answers[qn])) row.ok++;
      acc.set(key, row);
    }
  }
  return [...acc.values()]
    .map(r => ({ ...r, pct: r.tot ? Math.round((r.ok / r.tot) * 100) : 0 }))
    .sort((a, b) => a.pct - b.pct || b.tot - a.tot);
}

// Topics worth doing something about: seen often enough to mean anything, not already
// solid, and not the catch-all tag.
export function weakTopics(attempts, byN, { limit = 5, minAsked = 3, below = 75 } = {}) {
  return topicStats(attempts, byN)
    .filter(r => r.topic !== CATCH_ALL && r.tot >= minAsked && r.pct < below)
    .slice(0, limit);
}

// Same idea one level up: which of the six blueprint domains is dragging the score down.
export function weakDomains(attempt, domains, { limit = 2 } = {}) {
  return domains
    .map(d => {
      const p = attempt.perDomain[d.id] || { ok: 0, tot: 0 };
      return { id: d.id, name: d.name, ok: p.ok, tot: p.tot, pct: p.tot ? Math.round((p.ok / p.tot) * 100) : 0 };
    })
    .filter(d => d.tot > 0 && d.pct < 75)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, limit);
}

// Questions answered wrong in an attempt, in the order they were asked.
export const mistakesOf = (attempt, byN) =>
  attempt.qs.filter(qn => {
    const q = byN.get(qn);
    return q && !isCorrect(q, attempt.answers[qn]);
  });

// ---------------------------------------------------------------- daily activity
// The activity map is { 'YYYY-MM-DD': answers graded that day }. It exists because the
// streak and the day's quota cannot be derived from attempts alone — a session that was
// worked on but never finished leaves no attempt behind, yet the work happened.

// Local midnight, not UTC: a streak should break when the user's day does.
export const dayKey = (ts = Date.now()) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const answeredOn = (activity, ts = Date.now()) => activity[dayKey(ts)] || 0;

export const answeredTotal = activity =>
  Object.values(activity).reduce((sum, n) => sum + n, 0);

// Consecutive days with at least one answer, counting back from today. A day that is
// still in progress does not break the streak: if nothing has been answered yet today,
// the count starts from yesterday.
export function streakDays(activity, now = Date.now()) {
  const DAY = 86_400_000;
  let cursor = now;
  if (!answeredOn(activity, cursor)) cursor -= DAY;
  let streak = 0;
  while (answeredOn(activity, cursor)) { streak++; cursor -= DAY; }
  return streak;
}
