// The `v:1` save format — one JSON file, every branch of the store, and the only thing the
// two clients exchange today (export here, import there; a sync server would move the same
// object). Defined once so neither side can quietly add a branch the other drops on the
// floor: the Android app's store.js packs with this, and so does the web store.
//
// `session` (an exam in progress) travels in the file for completeness — a restore is meant
// to put a device back exactly where the export left it — but it is deliberately NOT part
// of what a sync would ever merge: pulling a half-written attempt with a running clock onto
// a second device loses the attempt rather than continuing it.

export const BACKUP_VERSION = 1;

export const BRANCHES = ['profile', 'session', 'attempts', 'bookmarks', 'srs', 'activity', 'book'];

export function packBackup(state, now = Date.now()) {
  const out = { v: BACKUP_VERSION, exportedAt: new Date(now).toISOString() };
  for (const k of BRANCHES) out[k] = state[k] ?? null;
  return out;
}

// Version tag and shape, not just the tag — a hand-edited or partially copied file is a
// real way this arrives (both clients offer a clipboard path).
export const isBackup = data =>
  !!data && typeof data === 'object' && !Array.isArray(data) && data.v === BACKUP_VERSION;
