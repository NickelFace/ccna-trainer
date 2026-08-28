// Local-calendar-day arithmetic for the exam countdown.
//
// `examDate` is stored as a plain 'YYYY-MM-DD' — always meant as a day on the user's own
// calendar, not a UTC instant. `new Date('YYYY-MM-DD')` parses that string as UTC
// midnight, so anywhere east of UTC (Sydney is UTC+10/11) the exam date reads back as
// still a day away for the first ~10-11 hours of the exam day itself. Comparing local
// midnights instead — rather than dividing a millisecond gap by a fixed 24h — also keeps
// the answer right across a DST change, when a "day" is 23 or 25 hours long.
import { DAY_MS } from './srs.js?v=21';

const localMidnight = ts => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

// Whole calendar days from now to the given 'YYYY-MM-DD' — >0 = дней до даты, 0 =
// сегодня, <0 = дата уже прошла (столько дней назад, negated by the caller); null when
// there's no date set at all. Comparing local midnights (Math.round, not a ceil off a raw
// ms gap) keeps this exact across a DST change, when a "day" is 23 or 25 hours long.
export function daysUntil(examIso, now = Date.now()) {
  if (!examIso) return null;
  const [y, m, d] = examIso.split('-').map(Number);
  const examMidnight = new Date(y, m - 1, d).getTime();
  return Math.round((examMidnight - localMidnight(now)) / DAY_MS);
}

// 'YYYY-MM-DD' and nothing else: the value comes off an <input type="date"> on the site
// and out of a synced profile branch written by another build, so it is checked rather
// than trusted before it reaches the arithmetic above.
export const isExamDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && !Number.isNaN(new Date(v).getTime());
