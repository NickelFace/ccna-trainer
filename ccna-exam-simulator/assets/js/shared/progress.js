// Everything the two clients derive from the stored progress: how a score reads, which
// topics are dragging, what happened today, how long the streak is.
//
// Nothing here is stored — attempts hold the raw answers and everything else is recomputed,
// so a fix to the bank or to the grading rules is reflected in old attempts too instead of
// freezing yesterday's verdict into the history.
//
// `isCorrect` is a parameter rather than an import. The web trainer grades inside app.js,
// which is a classic script and cannot load a module: making this file import the grading
// would put the exam itself behind a module that might not load, and an exam that stops
// working because a sync helper failed is a bad trade. The two implementations are
// equivalent today (ccna-mobile/src/engine/grade.js was lifted from app.js verbatim) and
// tests/grade.test.js is what keeps the phone's honest.
import { PASS_SCALED } from './score.js?v=17';
import { daySum, dayKey } from './activity.js?v=17';

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

// The 300..1000 score is only meaningful for a sample drawn the way the real exam draws
// one — by Cisco blueprint weight, not filtered to a domain, a question type, or a "weak
// domains" pick. Those still get graded internally (the per-domain breakdown is useful
// regardless of how the questions were chosen) but never claim a comparable score — see
// the `weighted` flag set in session.js's startExam. Nor does an exam nobody finished,
// however it was drawn — see isAbandoned below.
export const isScored = attempt => !!attempt.weighted && !isAbandoned(attempt);
export const scoredAttempts = attempts => attempts.filter(isScored);

// ---------------------------------------------------------------- abandoned attempts
// An exam that was opened and walked away from is filed like any other run: the questions
// never reached are graded as wrong, so a 100-question exam with one answer lands at 307
// and then drags every average that reads the history. That number describes the walking
// away, not the knowledge.
//
// So a run where fewer than a third of the questions were answered is not a result: no
// 300..1000 score, no bar on the chart, no place in the averages. What was actually
// answered still counts everywhere — four questions answered correctly are four questions
// answered correctly — and only the untouched rest is dropped instead of being read as
// ignorance. A finished exam is the opposite case: a blank left in one is a wrong answer
// and stays counted, which is why the rule keys on the attempt, not on the question.
export const ANSWERED_MIN = 1 / 3;

export const answeredIn = attempt => Object.keys(attempt.answers || {}).length;

export function isAbandoned(attempt) {
  const total = attempt.total || (attempt.qs ? attempt.qs.length : 0);
  return total > 0 && answeredIn(attempt) < total * ANSWERED_MIN;
}

// The questions of an attempt its statistics should read.
export const gradedQs = attempt =>
  isAbandoned(attempt) ? attempt.qs.filter(qn => (attempt.answers || {})[qn] != null) : attempt.qs;

// The per-domain tally to draw: the one filed with the attempt, except for an abandoned
// run, where it is recomputed over what was answered — so the breakdown reads "4 of 4"
// rather than "1 of 20" and agrees with everything else on the screen.
export function perDomainOf(attempt, byN, isCorrect) {
  if (!isAbandoned(attempt)) return attempt.perDomain || {};
  const out = {};
  for (const qn of gradedQs(attempt)) {
    const q = byN.get(qn);
    if (!q) continue;
    const row = out[q.dom] || (out[q.dom] = { ok: 0, tot: 0 });
    row.tot++;
    if (isCorrect(q, attempt.answers[qn])) row.ok++;
  }
  return out;
}

// "General" is the dump's catch-all for questions that were never tagged, not a subject
// anyone can go and study — it is aggregated but never offered as something to work on.
const CATCH_ALL = 'General';

// [{ topic, dom, ok, tot, pct }] across every attempt, worst first.
export function topicStats(attempts, byN, isCorrect) {
  const acc = new Map();
  for (const attempt of attempts) {
    for (const qn of gradedQs(attempt)) {
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
export function weakTopics(attempts, byN, isCorrect, { limit = 5, minAsked = 3, below = 75 } = {}) {
  return topicStats(attempts, byN, isCorrect)
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
export const mistakesOf = (attempt, byN, isCorrect) =>
  gradedQs(attempt).filter(qn => {
    const q = byN.get(qn);
    return q && !isCorrect(q, attempt.answers[qn]);
  });

// ---------------------------------------------------------------- the daily goal
// How many answers a day counts as a day's work. Stored in `profile.dailyGoal`, set in
// onboarding on the phone and in the "Сегодня" card on the site, and used as a
// denominator by both — so a zero, a negative or plain junk from a restored backup has
// to become the default rather than reach a division.
export const DEFAULT_GOAL = 30;
export const validGoal = n => Number.isInteger(n) && n >= 1;
export const goalOf = profile => validGoal(profile?.dailyGoal) ? profile.dailyGoal : DEFAULT_GOAL;

// ---------------------------------------------------------------- daily activity
// The activity map is { 'YYYY-MM-DD': { [deviceId]: { total, wrong, srs } } }. It exists because the
// streak and the day's quota cannot be derived from attempts alone — a session that was
// worked on but never finished leaves no attempt behind, yet the work happened.
//
// `total` is every graded answer that day; `wrong` is how many of those were incorrect;
// `srs` is how many came from a repetition session (startSrs) rather than practice or an
// exam — the three numbers the "Сегодня" card on the Progress tab reports.

// A single day's counters — every device that worked that day, added up — defaulting to
// zero so callers never need an existence check.
export const dayStats = (activity, ts = Date.now()) => daySum(activity, dayKey(ts));

export const answeredOn = (activity, ts = Date.now()) => dayStats(activity, ts).total;

export const answeredTotal = activity =>
  Object.keys(activity).reduce((sum, day) => sum + daySum(activity, day).total, 0);

// One calendar day back (or forward) from a timestamp, in local time — not a fixed
// 86_400_000 ms step. Sydney's DST change makes some real days 23h or 25h long; stepping
// by a fixed millisecond count walks past (or lands short of) the local midnight on the
// day the clocks move, which quietly breaks a streak that is actually intact or, further
// out, drifts the whole activity strip by a day. `setDate` does calendar-field arithmetic
// instead, so it always lands on the right local date.
const addDays = (ts, n) => {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
};

// The last `days` calendar days ending today, oldest first — what the Progress tab's
// activity strip draws one bar per.
export function recentDays(activity, now = Date.now(), days = 14) {
  return Array.from({ length: days }, (_, i) => {
    const ts = addDays(now, -(days - 1 - i));
    return { key: dayKey(ts), ts, ...dayStats(activity, ts) };
  });
}

// Consecutive days with at least one answer, counting back from today. A day that is
// still in progress does not break the streak: if nothing has been answered yet today,
// the count starts from yesterday.
export function streakDays(activity, now = Date.now()) {
  let cursor = now;
  if (!answeredOn(activity, cursor)) cursor = addDays(cursor, -1);
  let streak = 0;
  while (answeredOn(activity, cursor)) { streak++; cursor = addDays(cursor, -1); }
  return streak;
}
