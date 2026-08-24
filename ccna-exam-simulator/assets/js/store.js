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
import { pruneAttempts } from './shared/retention.js';
import { boxHistogram, dueCount, dueQueue, nextDueAt, wrongQueue } from './shared/srs-queue.js';
import {
  answeredTotal, dayStats, goalOf, mistakesOf, recentDays, scoreTone, streakDays, toneFor, topicStats,
  validGoal, weakTopics,
} from './shared/progress.js';
import { PASS_SCALED, toScaled } from './shared/score.js';
import { autoSyncer, isSyncKey, newSyncKey, SYNC_BASE, syncOnce } from './shared/sync.js';
import { bodyMarkup } from './shared/book.js';
import {
  coverage, DEFAULT_BOOK, isRead, loadIndex, loadMap, loadTopic, normalizeBook, readMap, setBookVersion,
  setRead, topicOf,
} from './shared/theory.js';

const KEY = {
  profile: 'ccna.profile',
  session: 'ccna.session',
  attempts: 'ccna.attempts',
  bookmarks: 'ccna.bookmarks',
  srs: 'ccna.srs',
  activity: 'ccna.activity',
  book: 'ccna.book',
  // Not one of the seven branches: this is what talks to the server, not progress. It is
  // deliberately outside the `v:1` object — packBackup goes by BRANCHES — because the key
  // would otherwise be uploaded to the very server that is only ever supposed to hold its
  // hash, and would travel inside every exported file.
  sync: 'ccna.sync',
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
  // itself — every rule below has to be the one the Android app uses, not a second copy.
  // The three that grade take isCorrect as an argument; app.js passes its own, so the exam
  // keeps working even if this module never loads.
  toScaled,
  PASS_SCALED,
  dueQueue,
  dueCount,
  nextDueAt,
  boxHistogram,
  wrongQueue,
  topicStats,
  weakTopics,
  mistakesOf,
  dayStats,
  streakDays,
  recentDays,
  answeredTotal,
  toneFor,
  scoreTone,
  goalOf,
  // The textbook: the same chapter files the Android app reads, rendered by the same
  // block renderer. Loading is lazy — nothing here is fetched until the reader opens.
  bodyMarkup,
  loadIndex,
  loadTopic,
  loadMap,
  topicOf,
  coverage,
  readMap,
  setBookVersion,

  profile: {},
  session: null,
  attempts: [],
  bookmarks: [],
  srs: {},
  activity: {},
  book: { ...DEFAULT_BOOK },
  sync: { key: null, syncedAt: 0, rev: 0 },

  _dirty: new Set(),
  _timer: null,
  // Counts changes made here, against what the last successful sync carried. Only ever
  // compared, never persisted: after a restart the start-up sync runs regardless.
  _seq: 0,
  _syncedSeq: 0,

  load() {
    this.profile = read(KEY.profile, {}) || {};
    this.session = read(KEY.session, null);
    // Six months, and then by itself — see shared/retention.js. Done here as well as in
    // the sync so a device that never syncs still forgets on schedule.
    this.attempts = pruneAttempts(read(KEY.attempts, []) || []);
    this.bookmarks = read(KEY.bookmarks, []) || [];
    this.srs = read(KEY.srs, {}) || {};
    this.book = normalizeBook(read(KEY.book, {}));
    if (!this.profile.deviceId) {
      this.profile.deviceId = newDeviceId();
      this._touch('profile');
    }
    // Days recorded before the activity map was split by device belong to this browser —
    // it is the only device that ever wrote this store.
    this.activity = normalizeActivity(read(KEY.activity, {}), this.profile.deviceId);
    this.sync = { key: null, syncedAt: 0, rev: 0, ...(read(KEY.sync, {}) || {}) };
    return this;
  },

  get deviceId() { return this.profile.deviceId; },

  // An attempt is identified by the run it came from, so finishing the same practice run
  // twice (the review sheet is reachable mid-session) updates one row instead of filing a
  // second one.
  attemptId(startedAt) { return `${this.deviceId}-${startedAt}`; },

  // ---- the daily goal ----
  // The one profile field the site can set. Onboarding on the phone asks for it; here it
  // is the number under the day's counter, and it travels with the profile branch.
  setGoal(n) {
    if (!validGoal(n)) return goalOf(this.profile);
    this.profile.dailyGoal = n;
    this._touch('profile');
    return n;
  },

  // ---- textbook ----
  // Same three mutators the Android store has, writing the same branch: a chapter marked
  // read on the phone shows as read here after a sync, and the other way round.
  // Unmarking writes a tombstone rather than deleting the mark: the merge unions both
  // maps, so a deletion would simply come back from the other device — see
  // shared/theory.js.
  markRead(topicId, on = true) {
    setRead(this.book, topicId, on);
    this._touch('book');
    return on;
  },

  isRead(topicId) { return isRead(this.book, topicId); },

  // Below 40px is "the top" — remembering it would send someone back to a position they
  // never left, and the branch would be rewritten (and re-synced) on every glance.
  setPos(topicId, y) {
    if (y > 40) this.book.pos[topicId] = Math.round(y);
    else delete this.book.pos[topicId];
    this._touch('book');
  },

  setBook(patch) {
    Object.assign(this.book, patch);
    this._touch('book');
    return this.book;
  },

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

  // ---- sync ----
  // Exposed for app.js, which is a classic script and cannot import the shared modules.
  isSyncKey,
  newSyncKey,
  SYNC_BASE,

  // Is there anything here the server has not been told about?
  get changedSinceSync() { return this._seq !== this._syncedSeq; },

  setSync(patch) {
    Object.assign(this.sync, patch);
    this._touch('sync');
    return this.sync;
  },

  // One exchange with the server: pull, merge, push. Throws SyncError — the caller has to
  // tell "wrong key" apart from "no connection" on screen.
  async syncNow(now = Date.now()) {
    // Read before the request, applied after it: a change made while the exchange is in
    // flight was not in the blob that went up, and must still count as unsynced.
    const at = this._seq;
    const { state, rev, wrote, pulled } = await syncOnce({
      fetch: (url, init) => fetch(url, init),
      key: this.sync.key,
      state: this,
      now,
    });
    this.applySync(state);
    this.setSync({ rev, syncedAt: now });
    this._syncedSeq = at;
    this.flush();
    return { wrote, pulled, rev };
  },

  // Adopt what the merge decided. The session is not in it by design — an exam running in
  // this tab is not something the other device can contribute to.
  applySync(state) {
    for (const k of BRANCHES) {
      if (k === 'session' || !(k in state)) continue;
      this[k] = state[k];
      this._queue(k);
    }
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
    // Backups written before the textbook existed simply have no `book` key — that
    // normalizes into an untouched one rather than an error.
    this.book = normalizeBook(data.book);
    // A file written by the other device carries its device id; keeping it would make both
    // devices write attempts under one name and merge them into each other.
    this.profile.deviceId = newDeviceId();
    for (const k of BRANCHES) this._touch(k);
    this.flush();
  },

  // ---- persistence ----
  // Coalesced the way the Android store coalesces: answering ten options costs one write.
  // Queue a branch for writing without claiming it was just edited. Adopting a merged
  // state must not re-stamp it: the stamp would then say "written now" on both devices
  // after every sync, and a real edit made offline on the other one would lose to it.
  // Queue a branch for writing. Split from _mark so adopting a merged state can reach the
  // disk without counting as work the server has not seen — see applySync.
  _queue(key) {
    this._dirty.add(key);
    if (this._timer) return;
    this._timer = setTimeout(() => { this._timer = null; this.flush(); }, FLUSH_MS);
  },

  // A branch changed because something happened here. The counter is what tells the
  // automatic sync whether leaving is worth a request; the `sync` entry itself is not
  // progress, so writing the key or the last-synced time does not count.
  _mark(key) {
    if (key !== 'sync') this._seq++;
    this._queue(key);
  },

  // `profile` and `book` are the two branches merge() cannot combine field by field — an
  // exam date from one device beside a daily goal from the other is a plan nobody made —
  // so they carry the time they were last written. Stamping here rather than in each
  // mutator means no new setting can be added and quietly miss it.
  _touch(key) {
    if ((key === 'profile' || key === 'book') && this[key] && typeof this[key] === 'object') {
      this[key].updatedAt = Date.now();
    }
    this._mark(key);
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

// Automatic syncing, on the two moments that matter: opening the trainer, and leaving it
// with work the server has not seen. A screen showing history redraws itself off this
// event rather than being reached into from here — see app.js.
const autoSync = autoSyncer(Store, {
  // `pulled`, not `wrote`: a sync that only receives the other device's work writes
  // nothing, and that is precisely the case a screen showing history needs to hear about.
  onDone: result => {
    if (result && (result.pulled || result.wrote)) dispatchEvent(new CustomEvent('ccna:synced'));
  },
  onError: err => console.warn('sync:', err.code || 'failed', err.message),
});
Store.autoSync = autoSync;

// The tab can go away without a beforeunload; both of these fire first. `hidden` is also
// the last moment a fetch still has a chance of completing, which is why the sync hangs
// off it rather than off pagehide.
addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  Store.flush();
  autoSync('leave');
});
addEventListener('pagehide', () => Store.flush());

window.Store = Store;
autoSync('start');
