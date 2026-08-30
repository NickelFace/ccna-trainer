// The repetition queue — what is due, how much of it, and when the next one falls.
//
// Separate from srs.js, which owns the transition of a single answer: this is the part that
// reads the whole map, and both clients need it. The Android app re-exports these from
// src/engine/srs.js; the web trainer reaches them through window.Store.
//
// State per question: { box: 1..5, dueAt, lastResult, seenCount, at }.
import { MAX_BOX } from './srs.js?v=23';
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

// Questions the last answer got wrong, most recently missed first. The SRS queue is about
// when a question is *due*; this is about what hurt, which is the other thing a person
// wants to drill and the one they can name without knowing what a Leitner box is.
export function wrongQueue(srs, { has = () => true, limit = Infinity } = {}) {
  return Object.entries(srs)
    .filter(([qn, state]) => state && state.lastResult === false && has(Number(qn)))
    .sort(([, a], [, b]) => (b.at || 0) - (a.at || 0))
    .slice(0, limit)
    .map(([qn]) => Number(qn));
}
