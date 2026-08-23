// Spaced repetition — Leitner boxes.
//
// A wrong answer drops the question to box 1 and it comes back tomorrow. A right answer
// promotes it one box, and the intervals stretch: 1, 3, 7, 16, 35 days. A question seen
// for the first time and answered correctly starts at box 2 rather than box 1 — it has
// already been demonstrated once, so making it due tomorrow would be busywork.
//
// State per question: { box: 1..5, dueAt, lastResult, seenCount, at }. Both clients write it
// and both will have to merge it, so the transition lives here rather than in either one.
// The queue helpers that only the Android app has (dueQueue, boxHistogram, …) stay in
// ccna-mobile/src/engine/srs.js, which re-exports everything below.

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
    // When this was graded, which is the only thing that can order two devices' versions
    // of the same question. dueAt cannot: a wrong answer today drops the question to box 1
    // and schedules it for tomorrow, which is *earlier* than the box-4 date the other
    // device wrote last month — merging on dueAt would keep the stale, optimistic state
    // and quietly forget that the question was just missed.
    at: now,
  };
}
