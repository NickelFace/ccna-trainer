// Session lifecycle: build one, resume one, finish one.
//
// The stored session holds question NUMBERS, not question objects — the bank is 2.9 MB and
// re-serialising a slice of it on every answer would be absurd. Everything that needs the
// real questions resolves them through bank.byN.
import { weightedPick, scorable, shuffle } from '../engine/select.js';
import { scoreAttempt } from '../engine/score.js';
import { store } from './store.js';

export const EXAM_PRESETS = {
  full: { label: 'Как на экзамене', count: 100, minutes: 120, note: '100 вопросов · 120 мин · вес по 6 доменам Cisco' },
  short: { label: 'Короткий прогон', count: 30, minutes: 35, note: '30 вопросов · 35 мин' },
  weak: { label: 'Только слабые домены', count: 40, minutes: 0, note: '40 вопросов · домены из статистики · без таймера' },
  manual: { label: 'Своя настройка', count: 60, minutes: 90, note: 'домены, типы, количество и таймер — вручную' },
};

// mode 'exam'  — no feedback until the end, timer, answers editable while it runs
// mode 'practice' — check one question at a time, review sheet after each
//
// The weighted pick is what makes an exam an exam, so it stays in charge unless the user
// narrows the pool by hand: filtered pools are shuffled instead, because blueprint weights
// over three chosen domains would be meaningless.
export function startExam(bank, preset = 'full', { settings = {}, manual = null, weakDomains = null } = {}) {
  const spec = EXAM_PRESETS[preset] || EXAM_PRESETS.full;
  const count = manual?.count ?? spec.count;
  const minutes = manual?.minutes ?? spec.minutes;

  let qs;
  if (manual && (manual.domains.length || manual.types.length)) {
    let pool = bank.pool;
    if (manual.domains.length) pool = pool.filter(q => manual.domains.includes(q.dom));
    if (manual.types.length) pool = pool.filter(q => manual.types.includes(q.y));
    qs = shuffle(pool).slice(0, count);
  } else if (weakDomains) {
    qs = shuffle(bank.pool.filter(q => weakDomains.includes(q.dom))).slice(0, count);
  } else {
    qs = weightedPick(bank.pool, bank.meta.domains, count);
  }

  return store.startSession({
    mode: 'exam',
    preset,
    // Captured at the start: changing a switch mid-exam should not change the rules of
    // the run already in progress.
    instant: !!settings.instant,
    keepAwake: settings.keepAwake !== false,
    qs: qs.map(q => q.n),
    i: 0,
    answers: {},
    flags: [],
    endsAt: minutes ? Date.now() + minutes * 60000 : 0,
    startedAt: Date.now(),
  });
}

export function startPractice(bank, { count = 20, domain = null, topic = null, types = null } = {}) {
  let pool = bank.pool;
  if (domain) pool = pool.filter(q => q.dom === domain);
  if (topic) pool = pool.filter(q => q.tp === topic);
  if (types) pool = pool.filter(q => types.includes(q.y));
  const qs = shuffle(pool).slice(0, count);
  return store.startSession({
    mode: 'practice',
    qs: qs.map(q => q.n),
    i: 0,
    answers: {},
    flags: [],
    endsAt: 0,
    startedAt: Date.now(),
  });
}

// The day's repetition queue, already ordered weakest-first by the SRS engine. It behaves
// like practice — check one question, read the rationale — the difference is only which
// questions are in it and that finishing it is what clears the day's plan.
export function startSrs(bank, questionNumbers) {
  return store.startSession({
    mode: 'srs',
    qs: questionNumbers.slice(),
    i: 0,
    answers: {},
    flags: [],
    endsAt: 0,
    startedAt: Date.now(),
  });
}

// Everything except an exam grades as you go and shows the review sheet — unless the exam
// was started with "Показывать ответ сразу" on, which turns it into timed practice.
export const gradesImmediately = session => session.mode !== 'exam' || !!session.instant;

// A stored session is only usable if every number in it still resolves against the bank —
// build_data.py can renumber or drop a question between releases.
export function sessionIsValid(session, bank) {
  if (!session || !Array.isArray(session.qs) || !session.qs.length) return false;
  return session.qs.every(n => bank.byN.has(n));
}

export const sessionQuestions = (session, bank) => session.qs.map(n => bank.byN.get(n));

export const currentQuestion = (session, bank) => bank.byN.get(session.qs[session.i]);

// Time is stored as an absolute deadline, so it keeps counting down while the app is
// killed — exactly like a real exam clock, and the reason a paused process can't be used
// to buy extra minutes.
export function remainingMs(session) {
  if (!session?.endsAt) return null;
  return Math.max(0, session.endsAt - Date.now());
}

export const isExpired = session => remainingMs(session) === 0;

export const answeredCount = session =>
  session.qs.filter(n => session.answers[n] !== undefined).length;

// Scores the session, files it in the attempt history and clears the active session.
export function finishSession(session, bank) {
  const questions = sessionQuestions(session, bank);
  const result = scoreAttempt(questions, session.answers, bank.meta.domains);

  // An exam withholds feedback until the end, so its answers reach the SRS map only now.
  // Practice, repetition, and an exam run with instant feedback have already recorded
  // each answer as it was graded — recording again here would double-count them.
  if (session.mode === 'exam' && !session.instant) {
    store.recordAnswers(result.review
      .filter(r => session.answers[r.q.n] !== undefined)
      .map(r => [r.q.n, r.good]));
  }

  const attempt = {
    id: `${session.startedAt}`,
    date: Date.now(),
    mode: session.mode,
    preset: session.preset || null,
    scaled: result.scaled,
    pct: result.pct,
    ok: result.ok,
    total: questions.length,
    perDomain: result.perDomain,
    durationMs: Date.now() - session.startedAt,
    answers: session.answers,
    qs: session.qs,
  };
  store.saveAttempt(attempt);
  store.clearSession();
  return { attempt, result };
}

export { scorable };
