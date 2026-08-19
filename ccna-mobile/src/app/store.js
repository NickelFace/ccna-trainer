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

const KEY = {
  profile: 'ccna.profile',
  session: 'ccna.session',
  attempts: 'ccna.attempts',
  bookmarks: 'ccna.bookmarks',
  srs: 'ccna.srs',
  activity: 'ccna.activity',
  book: 'ccna.book',
};

// Reading state for the Теория tab: which chapters are done, where each was left off,
// which one to offer to continue, and the reader's text size.
const DEFAULT_BOOK = { read: {}, pos: {}, open: {}, last: null, scale: 1 };

const FLUSH_MS = 200;

const DEFAULT_PROFILE = {
  level: null,          // 'first' | 'again' | 'retake' — set in onboarding (step 7)
  examDate: null,
  dailyGoal: 30,
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

// A restored backup or a hand-edited preference file can carry `dailyGoal: 0`, a negative
// number, or plain junk (a string, null) — that number is a denominator everywhere it's
// shown ("N из 0" on the home screen, a divide-by-zero-shaped plan line in Профиль), so
// anything that isn't a whole number of at least 1 falls back to the default instead.
const validGoal = n => Number.isInteger(n) && n >= 1;

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

const mergeBook = (stored) => {
  const b = stored && typeof stored === 'object' ? stored : {};
  return {
    ...DEFAULT_BOOK,
    ...b,
    read: b.read && typeof b.read === 'object' ? b.read : {},
    pos: b.pos && typeof b.pos === 'object' ? b.pos : {},
    open: b.open && typeof b.open === 'object' ? b.open : {},
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

const ACTIVITY_DAYS = 400;

export const store = {
  profile: { ...DEFAULT_PROFILE },
  session: null,
  attempts: [],
  bookmarks: [],
  srs: {},            // qn -> { box, dueAt, lastResult, seenCount }
  activity: {},       // 'YYYY-MM-DD' -> answers graded that day
  book: { ...DEFAULT_BOOK },

  _dirty: new Set(),
  _timer: null,
  _writing: null,

  async load() {
    const [profile, session, attempts, bookmarks, srs, activity, book] = await Promise.all([
      read(KEY.profile, {}),
      read(KEY.session, null),
      read(KEY.attempts, []),
      read(KEY.bookmarks, []),
      read(KEY.srs, {}),
      read(KEY.activity, {}),
      read(KEY.book, {}),
    ]);
    this.profile = mergeProfile(profile);
    this.session = session;
    this.attempts = attempts;
    this.bookmarks = bookmarks;
    this.srs = srs;
    this.activity = normalizeActivity(activity);
    this.book = mergeBook(book);
    return this;
  },

  // ---- textbook ----
  markRead(topicId, on = true) {
    if (on) this.book.read[topicId] = Date.now();
    else delete this.book.read[topicId];
    this._touch('book');
    return on;
  },

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
    const day = dayKey(now);
    const bucket = this.activity[day] || { total: 0, wrong: 0, srs: 0 };
    bucket.total++;
    if (!correct) bucket.wrong++;
    if (mode === 'srs') bucket.srs++;
    this.activity[day] = bucket;
    this._pruneActivity();
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

  // Keep the map from growing without bound; a year of history is more than the streak
  // and the totals ever look at.
  _pruneActivity() {
    const keys = Object.keys(this.activity);
    if (keys.length <= ACTIVITY_DAYS) return;
    for (const k of keys.sort().slice(0, keys.length - ACTIVITY_DAYS)) delete this.activity[k];
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

  answer(qn, value) {
    if (!this.session) return null;
    this.session.answers[qn] = value;
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
  toggleBookmark(qn) {
    const i = this.bookmarks.indexOf(qn);
    if (i >= 0) this.bookmarks.splice(i, 1);
    else this.bookmarks.push(qn);
    this._touch('bookmarks');
    return i < 0;
  },

  isBookmarked(qn) {
    return this.bookmarks.includes(qn);
  },

  // ---- profile ----
  patchProfile(patch) {
    Object.assign(this.profile, patch);
    this._touch('profile');
    return this.profile;
  },

  // ---- backup ----
  // The only way progress survives an install that Android treats as a fresh one — a
  // signing key change (debug → release, or a lost keystore) forces an uninstall first,
  // and allowBackup is off, so SharedPreferences does not survive that on its own.
  // Everything the store owns goes in; restoring is meant to put the phone back exactly
  // where the export left it, onboarding included.
  toBackup() {
    return {
      v: 1,
      exportedAt: new Date().toISOString(),
      profile: this.profile,
      session: this.session,
      attempts: this.attempts,
      bookmarks: this.bookmarks,
      srs: this.srs,
      activity: this.activity,
      book: this.book,
    };
  },

  // Defensive about shape, not just the version tag — a hand-edited or partially copied
  // file is a real way this arrives (the clipboard fallback exists for exactly that path).
  async restore(data) {
    if (!data || typeof data !== 'object' || data.v !== 1) {
      throw new Error('Файл не похож на резервную копию CCNA Trainer.');
    }
    this.profile = mergeProfile(data.profile);
    this.session = data.session ?? null;
    this.attempts = Array.isArray(data.attempts) ? data.attempts : [];
    this.bookmarks = Array.isArray(data.bookmarks) ? data.bookmarks : [];
    this.srs = data.srs && typeof data.srs === 'object' ? data.srs : {};
    this.activity = normalizeActivity(data.activity);
    // Backups written before the Теория tab existed simply have no `book` key — the
    // merge turns that into an untouched textbook rather than an error.
    this.book = mergeBook(data.book);
    for (const key of Object.keys(KEY)) this._touch(key);
    await this.flush();
  },

  // ---- persistence ----
  _touch(key) {
    this._dirty.add(key);
    if (this._timer) return;
    this._timer = setTimeout(() => { this._timer = null; this.flush(); }, FLUSH_MS);
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
