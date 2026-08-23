/* Progress store — the web trainer's persistent half.
   ES module by necessity: it imports the rules both clients share (shared/), and the only
   way to load those in a page with no build step is `<script type="module">`. app.js stays
   a classic script, so the one thing this file exports to it is `window.Store` — the same
   arrangement landing.js uses with `window.NetPath`.

   The shape is the Android app's, key for key (ccna-mobile/src/app/store.js): seven
   branches under the same names, attempts in the same form, SRS and activity written by
   the same rules. That is what makes the exported file interchangeable — the phone can
   restore what the browser wrote and the other way round, and a sync server later moves
   exactly this object.

   Branches this app never touches (profile beyond its device id, bookmarks, book) are
   still loaded, kept, and exported verbatim: importing a phone backup here and exporting
   it back must not quietly strip the textbook progress. */
import { nextState } from './shared/srs.js';
import { ACTIVITY_DAYS, bumpActivity, dayKey, normalizeActivity, pruneActivity } from './shared/activity.js';
import { BRANCHES, isBackup, packBackup } from './shared/backup.js';
import { PASS_SCALED, toScaled } from './shared/score.js';

const KEY = {
  profile: 'ccna.profile',
  session: 'ccna.session',
  attempts: 'ccna.attempts',
  bookmarks: 'ccna.bookmarks',
  srs: 'ccna.srs',
  activity: 'ccna.activity',
  book: 'ccna.book',
};

const FLUSH_MS = 200;

const read = (key, fallback) => {
  let raw = null;
  try { raw = localStorage.getItem(key); } catch { return fallback; }   // private mode, blocked storage
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch {
    console.warn(`store: ${key} is not valid JSON, resetting`);
    return fallback;
  }
};

// Attempt ids and activity counters carry the device that wrote them: two devices merging
// their histories match attempts by id and count a shared day per device, and a bare
// timestamp from two clocks is a collision waiting to happen.
const newDeviceId = () => 'web-' + Math.random().toString(36).slice(2, 8);

const Store = {
  // Re-exported for app.js, which is a classic script and cannot import the shared modules
  // itself — the scale must be the one the Android app uses, not a second copy of it.
  toScaled,
  PASS_SCALED,

  profile: {},
  session: null,
  attempts: [],
  bookmarks: [],
  srs: {},
  activity: {},
  book: {},

  _dirty: new Set(),
  _timer: null,

  load() {
    this.profile = read(KEY.profile, {}) || {};
    this.session = read(KEY.session, null);
    this.attempts = read(KEY.attempts, []) || [];
    this.bookmarks = read(KEY.bookmarks, []) || [];
    this.srs = read(KEY.srs, {}) || {};
    this.book = read(KEY.book, {}) || {};
    if (!this.profile.deviceId) {
      this.profile.deviceId = newDeviceId();
      this._touch('profile');
    }
    // Days recorded before the activity map was split by device belong to this browser —
    // it is the only device that ever wrote this store.
    this.activity = normalizeActivity(read(KEY.activity, {}), this.profile.deviceId);
    return this;
  },

  get deviceId() { return this.profile.deviceId; },

  // An attempt is identified by the run it came from, so finishing the same practice run
  // twice (the review sheet is reachable mid-session) updates one row instead of filing a
  // second one.
  attemptId(startedAt) { return `${this.deviceId}-${startedAt}`; },

  // ---- spaced repetition + activity ----
  recordAnswer(qn, correct, mode, now = Date.now()) {
    this.srs[qn] = nextState(this.srs[qn], correct, now);
    bumpActivity(this.activity, dayKey(now), correct, mode, this.deviceId);
    pruneActivity(this.activity, ACTIVITY_DAYS);
    this._touch('srs');
    this._touch('activity');
  },

  recordAnswers(pairs, mode, now = Date.now()) {
    for (const [qn, correct] of pairs) this.recordAnswer(qn, correct, mode, now);
  },

  // ---- attempts ----
  saveAttempt(attempt) {
    const i = this.attempts.findIndex(a => a.id === attempt.id);
    if (i >= 0) this.attempts[i] = attempt;
    else this.attempts.push(attempt);
    this._touch('attempts');
    return attempt;
  },

  attemptById(id) { return this.attempts.find(a => a.id === id) || null; },

  // Newest first — every screen that lists history wants that order.
  recentAttempts(limit = Infinity) {
    return this.attempts.slice().sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, limit);
  },

  deleteAttempt(id) {
    const i = this.attempts.findIndex(a => a.id === id);
    if (i < 0) return false;
    this.attempts.splice(i, 1);
    this._touch('attempts');
    return true;
  },

  // ---- backup ----
  toBackup() { return packBackup(this); },

  restore(data) {
    if (!isBackup(data)) throw new Error('not-a-backup');
    // Copied, not adopted: the branches below are handed straight out of the caller's
    // parsed file, and the device id is rewritten just underneath — writing that through
    // into the file object would surprise whoever still holds it.
    this.profile = { ...(data.profile && typeof data.profile === 'object' ? data.profile : {}) };
    this.session = data.session ?? null;
    this.attempts = Array.isArray(data.attempts) ? data.attempts : [];
    this.bookmarks = Array.isArray(data.bookmarks) ? data.bookmarks : [];
    this.srs = data.srs && typeof data.srs === 'object' ? data.srs : {};
    // Un-attributed days in the file were graded on whatever device exported it, not here.
    this.activity = normalizeActivity(data.activity, data.profile?.deviceId);
    this.book = data.book && typeof data.book === 'object' ? data.book : {};
    // A file written by the other device carries its device id; keeping it would make both
    // devices write attempts under one name and merge them into each other.
    this.profile.deviceId = newDeviceId();
    for (const k of BRANCHES) this._touch(k);
    this.flush();
  },

  // ---- persistence ----
  // Coalesced the way the Android store coalesces: answering ten options costs one write.
  _touch(key) {
    this._dirty.add(key);
    if (this._timer) return;
    this._timer = setTimeout(() => { this._timer = null; this.flush(); }, FLUSH_MS);
  },

  flush() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (!this._dirty.size) return;
    const keys = [...this._dirty];
    this._dirty.clear();
    try {
      for (const k of keys) localStorage.setItem(KEY[k], JSON.stringify(this[k]));
    } catch (err) {
      // Quota or a blocked store: the run in progress still works, only the history is lost.
      console.warn('store: could not persist', err);
    }
  },
};

Store.load();

// The tab can go away without a beforeunload; both of these fire first.
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Store.flush(); });
addEventListener('pagehide', () => Store.flush());

window.Store = Store;
