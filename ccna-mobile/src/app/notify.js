// Local reminders. Two of them, both scheduled on the device — the app has no server and
// never talks to one.
//
//   1. Дневная норма  — a repeating alarm at the chosen time, every day. The OS re-arms it
//      on its own, so it survives a phone that never reopens the app; a day whose quota is
//      already met is pulled back after delivery instead (see initNotificationListener).
//   2. Пробный экзамен — fires when a week has passed since the last exam attempt. Its due
//      date depends on attempt history, not a fixed weekday, so it stays one-shot — firing
//      it is also the cue (again via initNotificationListener) to queue the next one, which
//      is what keeps a phone that's never reopened from getting exactly one nudge, ever.
//
// re-schedule() itself is still called from scratch whenever the app starts and whenever it
// goes to background, since those are the two moments the counts and settings can have
// changed and the listener alone cannot see that.
//
// Web is a deliberate no-op: the browser build is for development, and asking for
// notification permission there would train the habit of denying it.
import { LocalNotifications } from '@capacitor/local-notifications';
import { store } from './store.js';
import { answeredOn } from '../engine/stats.js';
import { mockState, nextMockAt, examDatePassed, parseTime } from '../engine/plan.js';
import { t, pluralWord, WORDS } from './i18n.js';

export const DEFAULT_TIME = '19:00';

// Stable ids: re-scheduling replaces the previous pair instead of stacking a new one.
const ID = { daily: 1, mock: 2 };

const native = () => !!window.Capacitor?.isNativePlatform?.();

export async function permissionState() {
  if (!native()) return 'unsupported';
  try {
    const { display } = await LocalNotifications.checkPermissions();
    return display;
  } catch (e) {
    console.warn('notify: checkPermissions failed', e);
    return 'denied';
  }
}

// Called from the switch in Профиль, where a refusal can be reported. Everywhere else we
// only ever schedule against a permission that was already granted.
export async function requestPermission() {
  if (!native()) return 'unsupported';
  try {
    const { display } = await LocalNotifications.requestPermissions();
    return display;
  } catch (e) {
    console.warn('notify: requestPermissions failed', e);
    return 'denied';
  }
}

// Pure and exported so the full matrix (enabled × daily × weeklyMock × doneToday × exam
// date) is testable without touching the native bridge — see tests/notify.test.js.
export function plan(profile, activity, attempts, now) {
  const out = [];
  // Defense in depth: reschedule() already gates on this before ever calling plan(), but a
  // pure function should not depend on every caller remembering to check first.
  if (profile.notify?.enabled === false) return out;

  const time = profile.notify?.time || DEFAULT_TIME;
  const goal = profile.dailyGoal;

  if (profile.notify?.daily !== false) {
    const { h, m } = parseTime(time);
    out.push({
      id: ID.daily,
      title: t('notify.daily.title'),
      body: t('notify.daily.body', { n: goal, questions: pluralWord(goal, WORDS.questions), done: answeredOn(activity, now) }),
      // allowWhileIdle, because without it Doze can hold a reminder until the phone is
      // picked up — which on a study reminder is the whole evening. The plugin falls back
      // to an inexact alarm when Android 12+ withholds the exact-alarm permission, so this
      // never needs a permission trip to system settings.
      //
      // `on` rather than `at`: a one-shot alarm fires once and, on a phone that's never
      // reopened, never rearms — this is a cron-style repeat the OS re-arms itself, every
      // day at this clock time, with no JS required to keep it alive. doneToday can only be
      // known live, at delivery, so it is handled there (initNotificationListener) instead
      // of by not scheduling here.
      schedule: { on: { hour: h, minute: m }, allowWhileIdle: true },
    });
  }

  // Once the real exam date is behind you there is nothing left to mock for — nagging to
  // pace-check for an exam already taken would be absurd, not motivating.
  if (profile.notify?.weeklyMock && !examDatePassed(profile.examDate, now)) {
    const state = mockState(attempts, now);
    out.push({
      id: ID.mock,
      title: t('notify.mock.title'),
      body: state.last
        ? t('notify.mock.bodyLast', { n: state.daysSince })
        : t('notify.mock.bodyNever'),
      schedule: { at: new Date(nextMockAt(time, now, state)), allowWhileIdle: true },
    });
  }

  return out;
}

async function cancelOurs() {
  const pending = await LocalNotifications.getPending();
  const ours = pending.notifications.filter(n => n.id === ID.daily || n.id === ID.mock);
  if (ours.length) await LocalNotifications.cancel({ notifications: ours.map(n => ({ id: n.id })) });
}

// The one entry point. Safe to call as often as the app likes: stable ids mean a re-schedule
// replaces rather than stacks, so a double call cannot leave two copies of the same reminder
// queued.
//
// This runs from visibilitychange/pagehide without being awaited (see bindPersistOnPause in
// store.js) — Android can freeze the WebView at any point after that fires, so whatever is
// mid-flight here when it does must not leave the user with nothing armed. New pair first,
// stale cancel after: a still-wanted id just gets replaced in place by the schedule call
// below, so a freeze there loses nothing. Only a switch actually turned off depends on the
// cancel that follows, and a freeze mid-way through that leaves a stale reminder lingering
// at worst — never silence.
export async function reschedule(now = Date.now()) {
  if (!native()) return { scheduled: 0, reason: 'web' };

  try {
    if (!store.profile.notify?.enabled) {
      await cancelOurs();
      return { scheduled: 0, reason: 'off' };
    }
    if (await permissionState() !== 'granted') {
      await cancelOurs();
      return { scheduled: 0, reason: 'denied' };
    }

    const notifications = plan(store.profile, store.activity, store.attempts, now);
    if (notifications.length) await LocalNotifications.schedule({ notifications });

    const keep = new Set(notifications.map(n => n.id));
    const pending = await LocalNotifications.getPending();
    const stale = pending.notifications.filter(n => (n.id === ID.daily || n.id === ID.mock) && !keep.has(n.id));
    if (stale.length) await LocalNotifications.cancel({ notifications: stale.map(n => ({ id: n.id })) });

    return { scheduled: notifications.length };
  } catch (e) {
    // A reminder that fails to schedule must never take the app down with it.
    console.warn('notify: reschedule failed', e);
    return { scheduled: 0, reason: 'error' };
  }
}

// Registered once at boot. Reacts to a reminder actually being delivered — the one thing
// neither the native schedule nor reschedule() can do on their own:
//   - дневная норма: pull back today's delivery if the goal was hit after the last
//     reschedule() but before the alarm fired — doneToday, checked live.
//   - пробный экзамен: queue the next one. Without this a mock reminder on a phone that's
//     never reopened fires exactly once and then goes quiet for good.
let listening = false;
export async function initNotificationListener() {
  if (!native() || listening) return;
  listening = true;
  await LocalNotifications.addListener('localNotificationReceived', async (n) => {
    try {
      if (n.id === ID.daily) {
        if (answeredOn(store.activity, Date.now()) >= store.profile.dailyGoal) {
          await LocalNotifications.removeDeliveredNotifications({ notifications: [{ id: n.id }] });
        }
      } else if (n.id === ID.mock) {
        await reschedule();
      }
    } catch (e) {
      console.warn('notify: localNotificationReceived handling failed', e);
    }
  });
}
