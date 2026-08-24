// How long a finished attempt is kept.
//
// The user's rule: nothing lives longer than six months, and it goes by itself rather than
// by anyone deleting it. That is deletion by clock — the one kind that cannot be aimed at
// a particular record, and the reason the server refuses every other kind (see
// ccna-sync/src/worker.js).
//
// Only `attempts` age out. The SRS map is long-term memory — a question learned last year
// is still learned — and the activity map keeps its own 400 days, which is what the streak
// and the strip read. What is lost with an attempt is its answer sheet, and with it the
// contribution that attempt made to the topic statistics; the screens that show those say
// so rather than letting the numbers quietly shrink.
//
// Pruning has to happen *after* a merge, not only when the store loads. Merge unions two
// histories, so a pruned device that syncs with a server still holding the old attempts
// gets every one of them back — the rule only takes effect if it is applied to what the
// merge produced. That is why syncOnce calls this, and why the counts the client sends
// afterwards are the pruned ones.

export const KEEP_DAYS = 183;                 // six months, near enough

const DAY_MS = 86_400_000;

// Attempts newer than the cutoff, in the order they were in. An attempt with no usable
// date is kept: unknown age is not proof of old age, and there is no second chance to
// find out.
export function pruneAttempts(attempts, now = Date.now(), days = KEEP_DAYS) {
  if (!Array.isArray(attempts)) return [];
  const cutoff = now - days * DAY_MS;
  const kept = attempts.filter(a => {
    const date = Number(a?.date);
    return !Number.isFinite(date) || date <= 0 || date >= cutoff;
  });
  return kept.length === attempts.length ? attempts : kept;
}

// The same rule over a whole state, returning the original object when nothing aged out so
// callers can tell whether anything actually happened.
export function pruneState(state, now = Date.now(), days = KEEP_DAYS) {
  const attempts = pruneAttempts(state?.attempts, now, days);
  return attempts === state?.attempts ? state : { ...state, attempts };
}
