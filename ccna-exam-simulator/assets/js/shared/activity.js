// Daily activity — { 'YYYY-MM-DD': { [deviceId]: { total, wrong, srs } } }.
//
// It exists because the streak and the day's quota cannot be derived from attempts alone:
// a session that was worked on but never finished leaves no attempt behind, yet the work
// happened. `total` is every graded answer that day, `wrong` how many of those were
// incorrect, `srs` how many came from a repetition session rather than practice or an exam.
//
// The counters are kept per device rather than per day, because a day is the one thing two
// devices genuinely both write: answer ten questions on the phone and twelve in the browser
// and the day holds 22. Merging a single pair of numbers cannot express that — summing
// double-counts every time the same day syncs twice, taking the larger silently throws the
// other device's work away. Split by device, a merge is «take each device's own count»,
// which stays right no matter how often it runs. Everything that displays a day sums the
// buckets back up; see daySum.

export const ACTIVITY_DAYS = 400;

// Days recorded before the split have no device attached. Attributing them to whoever
// loaded the map would be a lie the moment a backup moves between devices, so they keep a
// name of their own — two devices' legacy days then merge as «the larger of the two»,
// which is the best that can be said about numbers whose owner was never written down.
export const UNKNOWN_DEVICE = 'legacy';

// Local midnight, not UTC: a streak should break when the user's day does.
export const dayKey = (ts = Date.now()) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const isBucket = v => !!v && typeof v === 'object' && typeof v.total === 'number';

const bucket = v => ({ total: v.total | 0, wrong: v.wrong | 0, srs: v.srs | 0 });

// Whatever was loaded or restored, in the current shape. Three generations arrive here: a
// bare number (until 2026-08 a day was just «answers graded»), a single { total, wrong, srs }
// bucket, and the per-device map. wrong/srs default to 0 for a day recorded before they
// existed; there is no way to recover which answers those were, and 0 is a truthful
// "unknown, treat as none" rather than a guess.
//
// `owner` is who the un-attributed days belong to — the device whose store this is, or the
// device id out of the backup being restored. Not the local device by default: guessing
// wrong here is what would make a restored backup double-count on the next sync.
export function normalizeActivity(raw, owner = UNKNOWN_DEVICE) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const [day, v] of Object.entries(obj)) {
    if (typeof v === 'number') out[day] = { [owner]: { total: v, wrong: 0, srs: 0 } };
    else if (isBucket(v)) out[day] = { [owner]: bucket(v) };
    else if (v && typeof v === 'object') {
      const byDevice = {};
      for (const [dev, b] of Object.entries(v)) if (isBucket(b)) byDevice[dev] = bucket(b);
      out[day] = byDevice;
    }
  }
  return out;
}

// One graded answer, counted into its day under the device that graded it. Mutates in place
// and returns the bucket — both stores keep the map itself and only need the counters kept
// identical.
export function bumpActivity(activity, day, correct, mode, deviceId = UNKNOWN_DEVICE) {
  const byDevice = activity[day] || (activity[day] = {});
  const b = byDevice[deviceId] || (byDevice[deviceId] = { total: 0, wrong: 0, srs: 0 });
  b.total++;
  if (!correct) b.wrong++;
  if (mode === 'srs') b.srs++;
  return b;
}

// A day as the screens want it: every device that worked that day, added up.
//
// A single un-split bucket is read as one device's worth rather than as zero — a map that
// reached a screen without going through normalizeActivity (a hand-edited file, a branch
// restored by an older build) should show the work it holds, not an empty day.
export function daySum(activity, day) {
  const out = { total: 0, wrong: 0, srs: 0 };
  const byDevice = activity && activity[day];
  if (!byDevice || typeof byDevice !== 'object') return out;
  if (isBucket(byDevice)) return bucket(byDevice);
  for (const b of Object.values(byDevice)) {
    if (!b) continue;
    out.total += b.total || 0;
    out.wrong += b.wrong || 0;
    out.srs += b.srs || 0;
  }
  return out;
}

// Keep the map from growing without bound; a year of history is more than the streak and
// the totals ever look at.
export function pruneActivity(activity, days = ACTIVITY_DAYS) {
  const keys = Object.keys(activity);
  if (keys.length <= days) return activity;
  for (const k of keys.sort().slice(0, keys.length - days)) delete activity[k];
  return activity;
}
