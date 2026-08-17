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
import { nextState } from '../engine/srs.js';
import { dayKey } from '../engine/stats.js';

const KEY = {
  profile: 'ccna.profile',
  session: 'ccna.session',
  attempts: 'ccna.attempts',
  bookmarks: 'ccna.bookmarks',
  srs: 'ccna.srs',
  activity: 'ccna.activity',
};

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

  _dirty: new Set(),
  _timer: null,
  _writing: null,

  async load() {
    const [profile, session, attempts, bookmarks, srs, activity] = await Promise.all([
      read(KEY.profile, {}),
      read(KEY.session, null),
      read(KEY.attempts, []),
      read(KEY.bookmarks, []),
      read(KEY.srs, {}),
      read(KEY.activity, {}),
    ]);
    this.profile = { ...DEFAULT_PROFILE, ...profile };
    this.session = session;
    this.attempts = attempts;
    this.bookmarks = bookmarks;
    this.srs = srs;
    this.activity = activity;
    return this;
  },

  // ---- spaced repetition + activity ----
  // Every graded answer lands here, from practice, from matching, and in bulk when an
  // exam is scored. This is the only place the SRS map is written.
  recordAnswer(qn, correct, now = Date.now()) {
    this.srs[qn] = nextState(this.srs[qn], correct, now);
    const day = dayKey(now);
    this.activity[day] = (this.activity[day] || 0) + 1;
    this._pruneActivity();
    this._touch('srs');
    this._touch('activity');
  },

  recordAnswers(pairs, now = Date.now()) {
    for (const [qn, correct] of pairs) this.recordAnswer(qn, correct, now);
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
    };
  },

  // Defensive about shape, not just the version tag — a hand-edited or partially copied
  // file is a real way this arrives (the clipboard fallback exists for exactly that path).
  async restore(data) {
    if (!data || typeof data !== 'object' || data.v !== 1) {
      throw new Error('Файл не похож на резервную копию CCNA Trainer.');
    }
    this.profile = { ...DEFAULT_PROFILE, ...(data.profile && typeof data.profile === 'object' ? data.profile : {}) };
    this.session = data.session ?? null;
    this.attempts = Array.isArray(data.attempts) ? data.attempts : [];
    this.bookmarks = Array.isArray(data.bookmarks) ? data.bookmarks : [];
    this.srs = data.srs && typeof data.srs === 'object' ? data.srs : {};
    this.activity = data.activity && typeof data.activity === 'object' ? data.activity : {};
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
export function bindPersistOnPause() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') store.flush();
  });
  window.addEventListener('pagehide', () => store.flush());
}
