// Daily activity — { 'YYYY-MM-DD': { total, wrong, srs } }.
//
// It exists because the streak and the day's quota cannot be derived from attempts alone:
// a session that was worked on but never finished leaves no attempt behind, yet the work
// happened. `total` is every graded answer that day, `wrong` how many of those were
// incorrect, `srs` how many came from a repetition session rather than practice or an exam.

export const ACTIVITY_DAYS = 400;

// Local midnight, not UTC: a streak should break when the user's day does.
export const dayKey = (ts = Date.now()) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Until 2026-08 a day was stored as a bare number (answers graded, nothing else) — this
// turns whatever was loaded or restored into the current shape. wrong/srs default to 0 for
// a day recorded before they existed; there is no way to recover which answers those were,
// and 0 is a truthful "unknown, treat as none" rather than a guess.
export function normalizeActivity(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const [day, v] of Object.entries(obj)) {
    out[day] = typeof v === 'number' ? { total: v, wrong: 0, srs: 0 } : v;
  }
  return out;
}

// One graded answer, counted into its day. Mutates in place and returns the bucket — both
// stores keep the map itself and only need the counters kept identical.
export function bumpActivity(activity, day, correct, mode) {
  const bucket = activity[day] || { total: 0, wrong: 0, srs: 0 };
  bucket.total++;
  if (!correct) bucket.wrong++;
  if (mode === 'srs') bucket.srs++;
  activity[day] = bucket;
  return bucket;
}

// Keep the map from growing without bound; a year of history is more than the streak and
// the totals ever look at.
export function pruneActivity(activity, days = ACTIVITY_DAYS) {
  const keys = Object.keys(activity);
  if (keys.length <= days) return activity;
  for (const k of keys.sort().slice(0, keys.length - days)) delete activity[k];
  return activity;
}
