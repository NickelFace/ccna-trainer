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

// The 300..1000 score is only meaningful for a sample drawn the way the real exam draws
// one — by Cisco blueprint weight, not filtered to a domain, a question type, or a "weak
// domains" pick. Those still get graded internally (the per-domain breakdown is useful
// regardless of how the questions were chosen) but never claim a comparable score — see
// the `weighted` flag set in session.js's startExam.
export const isScored = attempt => !!attempt.weighted;
export const scoredAttempts = attempts => attempts.filter(isScored);

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
// The activity map is { 'YYYY-MM-DD': { total, wrong, srs } }. It exists because the
// streak and the day's quota cannot be derived from attempts alone — a session that was
// worked on but never finished leaves no attempt behind, yet the work happened.
//
// `total` is every graded answer that day; `wrong` is how many of those were incorrect;
// `srs` is how many came from a repetition session (startSrs) rather than practice or an
// exam — the three numbers the "Сегодня" card on the Progress tab reports.

// Local midnight, not UTC: a streak should break when the user's day does.
export const dayKey = (ts = Date.now()) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Until 2026-08 a day was stored as a bare number (answers graded, nothing else) — this
// turns whatever load() or restore() read into the current shape. wrong/srs default to 0
// for a day recorded before they existed; there is no way to recover which answers those
// were, and 0 is a truthful "unknown, treat as none" rather than a guess.
export function normalizeActivity(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const [day, v] of Object.entries(obj)) {
    out[day] = typeof v === 'number' ? { total: v, wrong: 0, srs: 0 } : v;
  }
  return out;
}

// A single day's counters, defaulting to zero so callers never need an existence check.
export const dayStats = (activity, ts = Date.now()) => {
  const d = activity[dayKey(ts)];
  return { total: d?.total || 0, wrong: d?.wrong || 0, srs: d?.srs || 0 };
};

export const answeredOn = (activity, ts = Date.now()) => dayStats(activity, ts).total;

export const answeredTotal = activity =>
  Object.values(activity).reduce((sum, d) => sum + (d?.total || 0), 0);

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
