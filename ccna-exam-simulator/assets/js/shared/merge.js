// Combining two copies of the same progress — the phone's and the browser's.
//
// This is the whole of what "sync" means here. The server stores an opaque string and
// never looks inside it (see ccna-sync/README.md), so the rule for what happens when both
// devices wrote since they last agreed lives here, once, imported by both clients. It is
// a pure function over two plain states: no storage, no clock, no network.
//
// Three properties it has to keep, because the sync loop leans on all three:
//
//   merge(a, a) is a        — syncing twice changes nothing;
//   merge(merge(a, b), b)   — a 409 retry re-merges the same remote state and must not
//     is merge(a, b)          double anything up;
//   merge(a, b) is merge(b, a) for everything except the two fields that are deliberately
//     local — the session in progress and the device id.
//
// What it deliberately does not do: pick a "winner" state. Every branch merges on its own
// terms, because losing a morning of practice to a bookmark tapped on the other device is
// exactly the failure that makes people stop trusting sync.
import { normalizeActivity } from './activity.js?v=22';
import { normalizeTset, tsetMergeMap } from './tset.js?v=22';

const obj = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
const arr = v => Array.isArray(v) ? v : [];

// Branch-level "when was this last written". Only `profile` and `book` need it: they are
// bags of settings where a field-by-field merge would produce a state neither device ever
// had. Everything else merges by its own contents.
const stamp = v => Number(obj(v).updatedAt) || 0;

const answered = attempt => Object.keys(obj(attempt.answers)).length;

// Two rows with one id are the same run, filed twice. Later wins; if the clocks say the
// same thing, the fuller one does — a practice run can be saved mid-session and again at
// the end, and the end is the one with more answers in it.
const laterAttempt = (x, y) => {
  const dx = x.date || 0, dy = y.date || 0;
  if (dx !== dy) return dy > dx ? y : x;
  return answered(y) > answered(x) ? y : x;
};

// Union by id, oldest first — the order every reader assumes (scaledDelta compares an
// attempt with the one before it; the history screens sort for themselves).
function mergeAttempts(a, b) {
  const byId = new Map();
  for (const at of [...arr(a), ...arr(b)]) {
    if (!at || typeof at !== 'object' || at.id == null) continue;
    const id = String(at.id);
    const prev = byId.get(id);
    byId.set(id, prev ? laterAttempt(prev, at) : at);
  }
  return [...byId.values()].sort((x, y) => (x.date || 0) - (y.date || 0));
}

// A tombstoned set, the same one the textbook's read marks use: putting a question aside
// and taking it back are both dated, and the later of the two wins on both devices. Before
// this, un-bookmarking was simply undone by the other device — the union only knew how to
// add. A plain array from an older build (or an older backup file) normalizes into adds
// stamped 1, so nothing is lost by meeting one.
const mergeBookmarks = (a, b) => {
  const A = normalizeTset(a), B = normalizeTset(b);
  return { on: tsetMergeMap(A.on, B.on), off: tsetMergeMap(A.off, B.off) };
};

// Per question, the state that was graded later. `at` is written by nextState; entries
// from before it existed count as 0 and lose to any real grading, and two of them keep the
// local one. seenCount is the larger of the two rather than the winner's: both devices
// counted their own repetitions, and the sum is not recoverable from either.
function mergeSrs(a, b) {
  const A = obj(a), B = obj(b);
  const out = {};
  for (const qn of new Set([...Object.keys(A), ...Object.keys(B)])) {
    const x = A[qn], y = B[qn];
    if (!x || !y) { out[qn] = x || y; continue; }
    const win = (Number(y.at) || 0) > (Number(x.at) || 0) ? y : x;
    out[qn] = { ...win, seenCount: Math.max(x.seenCount || 0, y.seenCount || 0) };
  }
  return out;
}

// Per day, per device, the larger count. Never a sum: the same device's bucket for a day
// appears in both states, and adding them is how ten answered questions become twenty on
// the second sync. A device's own count only grows, so the larger copy is the newer one.
function mergeActivity(a, b, ownerA, ownerB) {
  const A = normalizeActivity(a, ownerA), B = normalizeActivity(b, ownerB);
  const out = {};
  for (const day of new Set([...Object.keys(A), ...Object.keys(B)])) {
    const x = obj(A[day]), y = obj(B[day]);
    const byDevice = {};
    for (const dev of new Set([...Object.keys(x), ...Object.keys(y)])) {
      const p = obj(x[dev]), q = obj(y[dev]);
      byDevice[dev] = {
        total: Math.max(p.total || 0, q.total || 0),
        wrong: Math.max(p.wrong || 0, q.wrong || 0),
        srs: Math.max(p.srs || 0, q.srs || 0),
      };
    }
    out[day] = byDevice;
  }
  return out;
}

// Reading progress. `read` and `readOff` are unions of latest timestamps — a chapter is
// read or unread according to whichever of the two the reader did last, on either device
// (see shared/theory.js: isRead). Neither map ever loses a key, which is what makes
// unmarking survive the round trip that used to undo it. Scroll positions are a union too,
// so a chapter only opened on the phone keeps its place. The scalars (which chapter to
// continue, the reader's text size) come from whichever side was touched last, because
// they describe one reader and cannot be halfway.
function mergeBook(a, b) {
  const A = obj(a), B = obj(b);
  const [newer, older] = stamp(B) > stamp(A) ? [B, A] : [A, B];
  return {
    ...older,
    ...newer,
    read: tsetMergeMap(older.read, newer.read),
    readOff: tsetMergeMap(older.readOff, newer.readOff),
    pos: { ...obj(older.pos), ...obj(newer.pos) },
    open: { ...obj(older.open), ...obj(newer.open) },
    updatedAt: Math.max(stamp(A), stamp(B)),
  };
}

// Settings, taken whole from the side written last. Field-by-field would be worse, not
// better: an exam date from one device and a daily goal from the other is a plan the user
// never made.
function mergeProfile(a, b) {
  const A = obj(a), B = obj(b);
  const winner = stamp(B) > stamp(A) ? B : A;
  return {
    ...winner,
    // Never the remote one: it names the other device, and adopting it would make both
    // write attempts and activity under a single name.
    deviceId: A.deviceId ?? B.deviceId,
    updatedAt: Math.max(stamp(A), stamp(B)),
  };
}

// `local` is this device's state, `remote` the one that came off the server. The only two
// places that asymmetry shows are the device id and the session.
export function merge(local, remote) {
  const a = obj(local), b = obj(remote);
  return {
    profile: mergeProfile(a.profile, b.profile),
    // An exam in progress is never merged or adopted. It has a running clock and a half
    // written answer sheet; pulling the other device's copy over it loses the attempt
    // rather than continuing it, so the local one stays exactly as it is.
    session: a.session ?? null,
    attempts: mergeAttempts(a.attempts, b.attempts),
    bookmarks: mergeBookmarks(a.bookmarks, b.bookmarks),
    srs: mergeSrs(a.srs, b.srs),
    activity: mergeActivity(a.activity, b.activity, obj(a.profile).deviceId, obj(b.profile).deviceId),
    book: mergeBook(a.book, b.book),
  };
}
