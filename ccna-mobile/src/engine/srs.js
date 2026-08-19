// Spaced repetition — Leitner boxes, as specified in the handoff.
//
// A wrong answer drops the question to box 1 and it comes back tomorrow. A right answer
// promotes it one box, and the intervals stretch: 1, 3, 7, 16, 35 days. A question seen
// for the first time and answered correctly starts at box 2 rather than box 1 — it has
// already been demonstrated once, so making it due tomorrow would be busywork.
//
// State per question: { box: 1..5, dueAt, lastResult, seenCount }.

export const INTERVAL_DAYS = [1, 3, 7, 16, 35];
export const MAX_BOX = INTERVAL_DAYS.length;
export const DAY_MS = 86_400_000;

export const intervalMs = box => INTERVAL_DAYS[Math.min(Math.max(box, 1), MAX_BOX) - 1] * DAY_MS;

export function nextState(prev, correct, now) {
  const box = correct ? Math.min(MAX_BOX, (prev?.box ?? 1) + 1) : 1;
  return {
    box,
    dueAt: now + intervalMs(box),
    lastResult: !!correct,
    seenCount: (prev?.seenCount ?? 0) + 1,
  };
}

export const isDue = (state, now) => !!state && state.dueAt <= now;

// Everything due, weakest first: box 1 before box 5, and within a box the one that has
// been waiting longest. `limit` is the day's quota — the queue is a plan, not a backlog
// to be cleared in one sitting.
export function dueQueue(srs, now, { limit = Infinity, has = () => true } = {}) {
  return Object.entries(srs)
    .filter(([qn, state]) => isDue(state, now) && has(Number(qn)))
    .sort(([, a], [, b]) => a.box - b.box || a.dueAt - b.dueAt)
    .slice(0, limit)
    .map(([qn]) => Number(qn));
}

export const dueCount = (srs, now, opts = {}) =>
  dueQueue(srs, now, { ...opts, limit: Infinity }).length;

// When the next question falls due, for the "всё повторено" empty state. Filtered by
// `has` the same way dueQueue is — otherwise a question dropped from the bank since
// (build_data.py renumbers or removes one) would pin this to its own dueAt forever, since
// it can never be answered again to move it along.
export function nextDueAt(srs, { has = () => true } = {}) {
  const times = Object.entries(srs)
    .filter(([qn]) => has(Number(qn)))
    .map(([, s]) => s.dueAt);
  return times.length ? Math.min(...times) : null;
}

// How the tracked questions are spread across the boxes — box 1 is what still hurts.
export function boxHistogram(srs) {
  const bins = Array.from({ length: MAX_BOX }, () => 0);
  for (const state of Object.values(srs)) bins[Math.min(state.box, MAX_BOX) - 1]++;
  return bins;
}

// Entries for questions no longer in the bank, dropped for good. The filter above keeps
// a ghost from being offered as "the next repetition"; this is what actually clears it out
// of storage — called once at boot, when the current bank is known. Returns a fresh object
// only when something was actually removed, so a caller can skip writing back otherwise.
export function pruneGhosts(srs, has) {
  const kept = Object.entries(srs).filter(([qn]) => has(Number(qn)));
  return kept.length === Object.keys(srs).length ? srs : Object.fromEntries(kept);
}
