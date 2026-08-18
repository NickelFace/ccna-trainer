// Local reminders. Two of them, both scheduled on the device — the app has no server and
// never talks to one.
//
//   1. Дневная норма  — fires at the chosen time on a day whose quota is not met yet.
//   2. Пробный экзамен — fires when a week has passed since the last exam attempt.
//
// Android kills nothing here for free: a notification scheduled once and never revisited
// would keep firing "добей норму" on days already finished. So the pair is cancelled and
// re-scheduled from scratch whenever the app starts and whenever it goes to background —
// those are the two moments the counts can have changed.
//
// Web is a deliberate no-op: the browser build is for development, and asking for
// notification permission there would train the habit of denying it.
import { LocalNotifications } from '@capacitor/local-notifications';
import { store } from './store.js';
import { answeredOn } from '../engine/stats.js';
import { mockState, nextDailyAt, nextMockAt } from '../engine/plan.js';

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

function plan(profile, activity, attempts, now) {
  const out = [];
  const time = profile.notify?.time || DEFAULT_TIME;
  const goal = profile.dailyGoal;

  if (profile.notify?.daily !== false) {
    const doneToday = answeredOn(activity, now) >= goal;
    out.push({
      id: ID.daily,
      title: 'Норма на сегодня',
      body: `${goal} ${goal % 10 === 1 && goal % 100 !== 11 ? 'вопрос' : 'вопросов'} — а сделано ${answeredOn(activity, now)}. Успеешь?`,
      // allowWhileIdle, because without it Doze can hold a reminder until the phone is
      // picked up — which on a study reminder is the whole evening. The plugin falls back
      // to an inexact alarm when Android 12+ withholds the exact-alarm permission, so this
      // never needs a permission trip to system settings.
      schedule: { at: new Date(nextDailyAt(time, now, { doneToday })), allowWhileIdle: true },
    });
  }

  if (profile.notify?.weeklyMock) {
    const state = mockState(attempts, now);
    out.push({
      id: ID.mock,
      title: 'Пробный экзамен',
      body: state.last
        ? `С прошлого прошло ${state.daysSince} дн. Проверь, где стоишь.`
        : 'Ты ещё не проходил пробный — одна попытка покажет расклад по доменам.',
      schedule: { at: new Date(nextMockAt(time, now, state)), allowWhileIdle: true },
    });
  }

  return out;
}

// The one entry point. Safe to call as often as the app likes: it always cancels first, so
// a double call cannot leave two copies of the same reminder queued.
export async function reschedule(now = Date.now()) {
  if (!native()) return { scheduled: 0, reason: 'web' };

  try {
    const pending = await LocalNotifications.getPending();
    const ours = pending.notifications.filter(n => n.id === ID.daily || n.id === ID.mock);
    if (ours.length) await LocalNotifications.cancel({ notifications: ours.map(n => ({ id: n.id })) });

    if (!store.profile.notify?.enabled) return { scheduled: 0, reason: 'off' };
    if (await permissionState() !== 'granted') return { scheduled: 0, reason: 'denied' };

    const notifications = plan(store.profile, store.activity, store.attempts, now);
    if (notifications.length) await LocalNotifications.schedule({ notifications });
    return { scheduled: notifications.length };
  } catch (e) {
    // A reminder that fails to schedule must never take the app down with it.
    console.warn('notify: reschedule failed', e);
    return { scheduled: 0, reason: 'error' };
  }
}
