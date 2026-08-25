// The weekly mock exam, and when the two reminders should fire.
//
// Onboarding has always said "1 пробный в неделю" under the month-out option, and nothing
// ever counted the weeks. This is that counter: it reads the attempt history both clients
// already keep, so a mock exam taken before this existed still counts. The site draws the
// same state in its sidebar; the phone also schedules notifications off it, which is why
// the reminder clock arithmetic lives here too.
//
// Everything here is pure and takes `now` — the reminders are scheduled from a background
// callback and tested without one.
import { DAY_MS } from './srs.js?v=19';
import { daysUntil } from './localdate.js?v=19';

export const MOCK_EVERY_DAYS = 7;

// An exam attempt is a mock exam; practice and repetition are not, however long they run.
export const lastMock = attempts =>
  attempts.filter(a => a.mode === 'exam').at(-1) || null;

// Whole days, floor: a mock taken 25 hours ago is "вчера", not "2 дня назад".
export function mockState(attempts, now = Date.now(), { every = MOCK_EVERY_DAYS } = {}) {
  const last = lastMock(attempts);
  if (!last) return { last: null, daysSince: null, due: true, daysLeft: 0 };
  const daysSince = Math.max(0, Math.floor((now - last.date) / DAY_MS));
  return { last, daysSince, due: daysSince >= every, daysLeft: Math.max(0, every - daysSince) };
}

// 'HH:MM' -> {h, m}, falling back to 19:00 on anything unparseable rather than throwing
// inside a scheduling callback.
export function parseTime(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim());
  const h = m ? Number(m[1]) : 19;
  const min = m ? Number(m[2]) : 0;
  return h > 23 || min > 59 ? { h: 19, m: 0 } : { h, m: min };
}

// The same clock time, `days` from now. Local time on purpose: a reminder at 19:00 means
// 19:00 where the phone is, across DST, which is why this walks the Date rather than
// adding DAY_MS.
export function atTime(time, now, days = 0) {
  const { h, m } = parseTime(time);
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

// Today if that moment is still ahead, otherwise tomorrow — and never today when the
// day's work is already done.
export function nextDailyAt(time, now, { doneToday = false } = {}) {
  const today = atTime(time, now);
  return !doneToday && today > now ? today : atTime(time, now, 1);
}

// Due mocks nag on the same schedule as the daily reminder; a mock that is not due yet is
// announced on the day it becomes due.
export function nextMockAt(time, now, state) {
  if (state.due) return nextDailyAt(time, now);
  const at = atTime(time, now, state.daysLeft);
  return at > now ? at : atTime(time, now, state.daysLeft + 1);
}

// True once the exam date itself is fully behind you — the day of the exam still counts as
// "today", not "passed" yet, the same boundary the Профиль countdown uses (both built on
// daysUntil's local-midnight arithmetic, not a raw UTC-parsed ms gap — see localdate.js for
// why that distinction matters east of UTC). Once it flips, further "сходи на пробный"
// nagging is pointless: the real thing already happened.
export function examDatePassed(examDate, now = Date.now()) {
  const left = daysUntil(examDate, now);
  return left !== null && left < 0;
}
