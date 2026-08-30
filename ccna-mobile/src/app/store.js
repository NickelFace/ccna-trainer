// Persistent state.
//
// The web app keeps everything in a global `S` that dies with the page — on Android that
// means losing a 100-question exam the moment the system reclaims the process. Here every
// action lands in Capacitor Preferences (SharedPreferences on Android, localStorage in the
// dev browser), and the session is rebuilt on the next launch.
//
// Writes are coalesced: an answer tap updates memory synchronously and schedules one
// flush, so tapping through ten options costs one write, not ten. flush() forces it out
// when the app is about to go away.
import { Preferences } from '@capacitor/preferences';
import { nextState, pruneGhosts } from '../engine/srs.js';
import { dayKey, normalizeActivity } from '../engine/stats.js';
import { isEmptyAnswer } from '../engine/grade.js';
import { ACTIVITY_DAYS, bumpActivity, pruneActivity } from '../../../ccna-exam-simulator/assets/js/shared/activity.js?v=22';
import { BRANCHES, packBackup, isBackup } from '../../../ccna-exam-simulator/assets/js/shared/backup.js?v=22';
import { pruneAttempts } from '../../../ccna-exam-simulator/assets/js/shared/retention.js?v=22';
import { isSyncKey, newSyncKey, syncOnce } from '../../../ccna-exam-simulator/assets/js/shared/sync.js?v=22';
import { DEFAULT_BOOK, isRead, normalizeBook, setRead } from './theory.js';
import { normalizeTset, tsetEntries, tsetHas, tsetMark } from '../../../ccna-exam-simulator/assets/js/shared/tset.js?v=22';
import { DEFAULT_GOAL, validGoal } from '../../../ccna-exam-simulator/assets/js/shared/progress.js?v=22';
import { initLang, t } from './i18n.js';

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

const DEFAULT_SYNC = { key: null, syncedAt: 0, rev: 0 };

const FLUSH_MS = 200;

// Attempt ids and activity counters carry the device that wrote them: two devices merging
// their histories match attempts by id and count a shared day per device, and a bare
// timestamp from two clocks is a collision waiting to happen. The web trainer generates
// the same thing with a `web-` prefix.
const newDeviceId = () => 'and-' + Math.random().toString(36).slice(2, 8);

const DEFAULT_PROFILE = {
  level: null,          // 'first' | 'again' | 'retake' — set in onboarding (step 7)
  examDate: null,
  dailyGoal: DEFAULT_GOAL,
  lang: 'ru',
  aiTarget: null,
  fontScale: 1,         // question text size, cycled by the "Aa Размер" control
  onboarded: false,
  examPreset: 'full',
  exam: {},             // runtime switches, see RUN_SWITCHES in screens/exam.js
  // Local reminders, off until asked for — see app/notify.js. `enabled` is the user's
  // switch, not the OS permission: a granted permission with the switch off stays silent.
  notify: { enabled: false, daily: true, weeklyMock: true, time: '19:00' },
};

// `validGoal` is shared: that number is a denominator everywhere it is shown ("N из 0" on
// the home screen, a divide-by-zero-shaped plan line in Профиль), and the site sets it too.

// `notify` is a nested object, so a plain spread would drop any key a stored profile
// predates — an older backup has no `notify.weeklyMock`, and shallow-merging it in would
// leave the field undefined instead of at its default.
export const mergeProfile = (stored) => {
  const p = stored && typeof stored === 'object' ? stored : {};
  return {
    ...DEFAULT_PROFILE,
    ...p,
    dailyGoal: validGoal(p.dailyGoal) ? p.dailyGoal : DEFAULT_PROFILE.dailyGoal,
    notify: { ...DEFAULT_PROFILE.notify, ...(p.notify && typeof p.notify === 'object' ? p.notify : {}) },
  };
};

const read = async (key, fallback) => {
  const { value } = await Preferences.get({ key });
  if (value == null) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    // Corrupt entry (interrupted write, manual edit) — start over rather than dying.
    console.warn(`store: ${key} is not valid JSON, resetting`);
    return fallback;
  }
};

export const store = {
  profile: { ...DEFAULT_PROFILE },
  session: null,
  attempts: [],
  bookmarks: { on: {}, off: {} },
  srs: {},            // qn -> { box, dueAt, lastResult, seenCount }
  activity: {},       // 'YYYY-MM-DD' -> deviceId -> answers graded that day
  book: { ...DEFAULT_BOOK },
  sync: { ...DEFAULT_SYNC },

  _dirty: new Set(),
  _timer: null,
  // Counts changes made here, against what the last successful sync carried. Only ever
  // compared, never persisted: after a restart the start-up sync runs regardless.
  _seq: 0,
  _syncedSeq: 0,
  _writing: null,

  async load() {
    const [profile, session, attempts, bookmarks, srs, activity, book, sync] = await Promise.all([
      read(KEY.profile, {}),
      read(KEY.session, null),
      read(KEY.attempts, []),
      read(KEY.bookmarks, []),
      read(KEY.srs, {}),
      read(KEY.activity, {}),
      read(KEY.book, {}),
      read(KEY.sync, {}),
    ]);
    this.profile = mergeProfile(profile);
    if (!this.profile.deviceId) {
      this.profile.deviceId = newDeviceId();
      this._touch('profile');
    }
    // Adopt the persisted language before anything renders — setLang() (screens/profile.js,
    // onboarding) is what changes it afterwards; this is just picking up where the phone
    // left off.
    initLang(this.profile.lang);
    this.session = session;
    // Six months, and then by itself — see shared/retention.js. Done here as well as in
    // the sync so a phone that never syncs still forgets on schedule.
    this.attempts = pruneAttempts(attempts);
    this.bookmarks = normalizeTset(bookmarks);
    this.srs = srs;
    // Days recorded before the activity map was split by device belong to this phone —
    // it is the only device that ever wrote this store.
    this.activity = normalizeActivity(activity, this.profile.deviceId);
    this.book = normalizeBook(book);
    this.sync = { ...DEFAULT_SYNC, ...(sync && typeof sync === 'object' ? sync : {}) };
    return this;
  },

  get deviceId() { return this.profile.deviceId; },

  // An attempt is identified by the run it came from, prefixed with the device, so two
  // histories can be merged by id without a timestamp collision passing for the same run.
  attemptId(startedAt) { return `${this.deviceId}-${startedAt}`; },

  // ---- textbook ----
  // Unmarking writes a tombstone rather than deleting the mark: the merge unions both
  // maps, so a deletion would simply come back from the other device — see
  // shared/theory.js. `isRead` is re-exported for the screens, which ask per row.
  markRead(topicId, on = true) {
    setRead(this.book, topicId, on);
    this._touch('book');
    return on;
  },

  isRead(topicId) { return isRead(this.book, topicId); },

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
  // Every graded answer lands here, from practice, from matching, and in bulk when an
  // exam is scored. This is the only place the SRS map is written.
  //
  // `mode` is the session mode the answer was graded under ('exam' | 'practice' | 'srs') —
  // it only affects the `srs` counter below, not the SRS map itself, which every mode
  // updates the same way.
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

  // Called once at boot, when the current bank is known — drops SRS entries for questions
  // the bank no longer has (build_data.py renumbers or removes some on a rebuild). Left in
  // place they're "ghosts": excluded from dueCount already, but still sitting there with a
  // dueAt that can never be cleared, which is exactly what nextDueAt used to report as the
  // next repetition.
  pruneGhostSrs(has) {
    const pruned = pruneGhosts(this.srs, has);
    if (pruned === this.srs) return;
    this.srs = pruned;
    this._touch('srs');
  },

  // ---- session ----
  startSession(session) {
    this.session = { ...session, savedAt: Date.now() };
    this._touch('session');
    return this.session;
  },

  // Every mutation goes through here so nothing can change the session without also
  // stamping savedAt and scheduling the write.
  patchSession(patch) {
    if (!this.session) return null;
    Object.assign(this.session, patch, { savedAt: Date.now() });
    this._touch('session');
    return this.session;
  },

  // Emptying an answer removes it rather than storing an empty one — every check for
  // «has this question been answered» is a check that the entry exists. See isEmptyAnswer.
  answer(qn, value) {
    if (!this.session) return null;
    if (isEmptyAnswer(value)) delete this.session.answers[qn];
    else this.session.answers[qn] = value;
    return this.patchSession({});
  },

  clearSession() {
    this.session = null;
    this._touch('session');
  },

  // ---- attempts ----
  saveAttempt(attempt) {
    this.attempts.push(attempt);
    this._touch('attempts');
    return attempt;
  },

  // ---- bookmarks ----
  // A tombstoned set rather than a list — see shared/tset.js. Taking a question back off
  // the pile is an action with a date on it, so the other device cannot quietly put it
  // back the next time the two talk.
  toggleBookmark(qn) {
    const on = !this.isBookmarked(qn);
    tsetMark(this.bookmarks.on, this.bookmarks.off, qn, on);
    this._touch('bookmarks');
    return on;
  },

  isBookmarked(qn) { return tsetHas(this.bookmarks.on, this.bookmarks.off, qn); },

  // Question numbers currently put aside, oldest first — the order they were added in,
  // which is the order a list of them should read.
  bookmarkList() {
    return Object.entries(tsetEntries(this.bookmarks.on, this.bookmarks.off))
      .sort((x, y) => x[1] - y[1])
      .map(([qn]) => Number(qn));
  },

  // ---- profile ----
  patchProfile(patch) {
    Object.assign(this.profile, patch);
    this._touch('profile');
    return this.profile;
  },

  // ---- sync ----
  isSyncKey,
  newSyncKey,

  // Is there anything here the server has not been told about?
  get changedSinceSync() { return this._seq !== this._syncedSeq; },

  setSync(patch) {
    Object.assign(this.sync, patch);
    this._touch('sync');
    return this.sync;
  },

  // One exchange with the server: pull, merge, push. Throws SyncError, whose `code` is
  // what the screen turns into a sentence — "wrong key" and "no signal" are not the same
  // news on a phone.
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
    await this.flush();
    return { wrote, pulled, rev };
  },

  // Adopt what the merge decided. The session is not in it by design — an exam running on
  // this phone is not something the browser can contribute to.
  applySync(state) {
    for (const k of ['profile', 'attempts', 'bookmarks', 'srs', 'activity', 'book']) {
      if (!(k in state)) continue;
      // Normalized on the way in, the same as on load: what comes back has been through
      // another client, and one still on an older build sends a textbook branch with no
      // tombstone map in it. Adopting that shape would leave `readOff` undefined until the
      // next restart, and the next unmark writing into nothing.
      this[k] = k === 'book' ? normalizeBook(state[k])
        : k === 'bookmarks' ? normalizeTset(state[k])
        : state[k];
      this._queue(k);
    }
    // A sync can bring in a language choice made on the other device — adopt it so the two
    // stay in step. The caller (autoSync's redrawIfSafe in main.js) repaints afterwards.
    if ('profile' in state) initLang(this.profile.lang);
  },

  // ---- backup ----
  // The only way progress survives an install that Android treats as a fresh one — a
  // signing key change (debug → release, or a lost keystore) forces an uninstall first,
  // and allowBackup is off, so SharedPreferences does not survive that on its own.
  // Everything the store owns goes in; restoring is meant to put the phone back exactly
  // where the export left it, onboarding included.
  // The branch list is the shared `v:1` format (shared/backup.js) — the web trainer writes
  // and reads the same file, so neither side may add a branch on its own.
  toBackup() {
    return packBackup(this);
  },

  // Defensive about shape, not just the version tag — a hand-edited or partially copied
  // file is a real way this arrives (the clipboard fallback exists for exactly that path).
  async restore(data) {
    if (!isBackup(data)) {
      throw new Error(t('backup.notABackup'));
    }
    this.profile = mergeProfile(data.profile);
    this.session = data.session ?? null;
    this.attempts = Array.isArray(data.attempts) ? data.attempts : [];
    this.bookmarks = normalizeTset(data.bookmarks);
    this.srs = data.srs && typeof data.srs === 'object' ? data.srs : {};
    // Un-attributed days in the file were graded on whatever device exported it, not here.
    this.activity = normalizeActivity(data.activity, data.profile?.deviceId);
    // Backups written before the Теория tab existed simply have no `book` key — the
    // merge turns that into an untouched textbook rather than an error.
    this.book = normalizeBook(data.book);
    // A file written by the other device carries its device id; keeping it would make both
    // devices write attempts and activity under one name and merge them into each other.
    this.profile.deviceId = newDeviceId();
    // Every branch but `sync`: a restored backup carries someone's progress, never their
    // key — the file has no key in it, and the one on this phone stays as it was.
    for (const key of BRANCHES) this._touch(key);
    await this.flush();
  },

  // ---- persistence ----
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

  async flush() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (!this._dirty.size) return this._writing || Promise.resolve();
    const keys = [...this._dirty];
    this._dirty.clear();
    this._writing = Promise.all(keys.map(k => Preferences.set({
      key: KEY[k],
      value: JSON.stringify(this[k]),
    })));
    await this._writing;
    this._writing = null;
  },
};

// Android freezes or kills the process without warning; both events fire before that,
// so the last few taps make it to disk.
// `onPause` runs alongside the flush — reminders are re-scheduled from the counts as they
// stand when the app leaves the screen, which is the last moment they can change before
// one of them is due to fire.
export function bindPersistOnPause(onPause = () => {}) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { store.flush(); onPause(); }
  });
  window.addEventListener('pagehide', () => { store.flush(); onPause(); });
}

// The mirror image: the app is on screen again after being away. `visibilitychange` is
// what Android's WebView actually delivers when the activity is resumed — the same event
// the pause hook above listens to, the other way round — so this needs no Capacitor
// plugin and behaves identically in the dev browser.
export function bindResume(onResume) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onResume();
  });
}
