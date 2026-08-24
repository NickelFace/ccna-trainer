// A set that survives merging.
//
// Two devices that both hold "these are the chapters I have read" or "these are the
// questions I put aside" cannot be reconciled by a plain union: the union only knows how
// to add, so removing an item on one device is undone by the other, forever. And it cannot
// be reconciled by "whichever branch was written last" either — that would throw away
// everything the other device did in the meantime.
//
// So membership is not a list but two timestamps per item: when it was last added, and
// when it was last removed. Merging takes the later of each, per item, from both sides;
// the item is in the set when its add is younger than its removal. Nothing is ever
// deleted, both maps only ever take newer values, and the answer does not depend on which
// device asks or in what order the exchanges happen — which is what makes the merge
// idempotent and commutative, the two properties the sync loop leans on.
//
// The cost is honest and small: an item added and removed a hundred times leaves one entry
// in each map, and these sets hold chapters (47) and bookmarked questions (a few dozen).

const num = (map, id) => Number(map?.[id]) || 0;

// In the set? The add has to be strictly newer — an item removed in the same millisecond
// it was added stays out, which is what `mark` below arranges deliberately.
export const tsetHas = (on, off, id) => num(on, id) > num(off, id);

// Everything currently in it, as `{ id: added }`. Callers render rows off this rather than
// asking per item, so the rule is applied once per screen and cannot be half-applied.
export function tsetEntries(on, off) {
  const out = {};
  for (const id of Object.keys(on && typeof on === 'object' ? on : {})) {
    if (tsetHas(on, off, id)) out[id] = num(on, id);
  }
  return out;
}

// Add or remove, in place, on the pair of maps handed in.
//
// The new stamp is `max(now, the other map + 1)` rather than plain `now`: a device whose
// clock runs behind must still be able to undo what is on its own screen. Without that, a
// phone a minute slow taps "remove" and nothing happens, with no way to tell why.
export function tsetMark(on, off, id, add, now = Date.now()) {
  const target = add ? on : off;
  const other = add ? off : on;
  target[id] = Math.max(now, num(other, id) + 1);
  return add;
}

// One map merged with another: per key, the later stamp. Junk keys are dropped rather than
// carried — a `null` in either side would otherwise poison every later comparison.
export function tsetMergeMap(a, b) {
  const out = {};
  for (const src of [a, b]) {
    if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
    for (const [id, when] of Object.entries(src)) {
      const t = Number(when) || 0;
      if (t > (out[id] || 0)) out[id] = t;
    }
  }
  return out;
}

// A stored or synced pair, whatever shape it arrives in: the current `{ on, off }`, the
// plain array both clients wrote before tombstones existed, or nonsense.
//
// A legacy array becomes an add stamped 1 — the oldest possible moment that still counts
// as "in the set", so any real removal on either device beats it, and the bookmark itself
// is not lost in the process.
export function normalizeTset(raw) {
  if (Array.isArray(raw)) {
    const on = {};
    for (const id of raw) if (id != null && id !== '') on[id] = 1;
    return { on, off: {} };
  }
  const src = raw && typeof raw === 'object' ? raw : {};
  return { on: tsetMergeMap(src.on, null), off: tsetMergeMap(src.off, null) };
}
