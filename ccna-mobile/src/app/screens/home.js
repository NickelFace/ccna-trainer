// Tab 1 (spec 02) — the one screen that answers "что мне делать сейчас".
//
// Deliberately absent, per the spec: anything about fixed keys, "418/418" or the size of
// the bank. That belongs in a profile screen, not on the screen you open to start working.
import { esc, h } from '../dom.js';
import { store } from '../store.js';
import { readiness, readinessDelta } from '../../engine/readiness.js';
import { dueQueue, dueCount, nextDueAt, DAY_MS } from '../../engine/srs.js';
import { streakDays, answeredOn, answeredTotal, toneFor } from '../../engine/stats.js';
import { daysUntil } from '../../engine/localdate.js';
import { mockState } from '../../engine/plan.js';
import { remainingMs, isExpired, finishSession, startSrs, startPractice } from '../session.js';
import { confirmDialog } from '../dialog.js';
import { question as questionScreen } from './question.js';
import { result as resultScreen } from './result.js';
import { profile as profileScreen } from './profile.js';
import { t, pluralWord, WORDS } from '../i18n.js';

const MODE_LABEL = () => ({ exam: t('home.mode.exam'), practice: t('home.mode.practice'), srs: t('home.mode.srs') });

const agoLabel = ms => {
  const min = Math.round(ms / 60000);
  if (min < 1) return t('home.ago.now');
  if (min < 60) return t('home.ago.min', { n: min });
  const hrs = Math.round(min / 60);
  return hrs < 24 ? t('home.ago.hr', { n: hrs }) : t('home.ago.day', { n: Math.round(hrs / 24) });
};

const clock = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms % 60000 / 1000)).padStart(2, '0')}`;

const groupThousands = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// ---------------------------------------------------------------- readiness
function readinessBlock(r, delta, profile) {
  const left = daysUntil(profile.examDate);
  const sub = [
    left === null ? t('home.readiness.examDateNone')
      : left < 0 ? t('home.readiness.examDatePassed', { n: -left, days: pluralWord(-left, WORDS.days) })
      : left === 0 ? t('home.readiness.examToday')
      : t('home.readiness.examIn', { n: left, days: pluralWord(left, WORDS.days) }),
    t('home.readiness.threshold'),
  ].join(' · ');

  // The countdown and the daily quota are the whole plan, and both were set once during
  // onboarding with no way back — so the line that shows them is also the way to change
  // them. A settings screen filed under a tab nobody opens would not be found.
  const planRow = `
    <div class="muted readiness-sub">${esc(sub)}
      <button class="plan-btn" data-act="profile" type="button">${esc(t('home.readiness.planEdit'))}</button>
    </div>`;

  if (r.forecast === null) {
    return `
      <div class="readiness">
        <div class="readiness-head"><span class="readiness-pct">${esc(t('home.readiness.titleEmpty'))}</span></div>
        ${planRow}
        <p class="muted lead">${esc(t('home.readiness.forecastHint'))}</p>
      </div>`;
  }

  return `
    <div class="readiness">
      <div class="readiness-head">
        <span class="readiness-pct">${esc(t('home.readiness.title', { pct: r.pct }))}</span>
      </div>
      ${planRow}
      <div class="readiness-track"><i style="width:${Math.min(100, r.pct)}%"></i></div>
      <div class="readiness-foot mono">
        <span>${esc(t('home.readiness.forecast', { n: r.forecast }))}</span>
        <span>${delta === null
          ? esc(t('home.readiness.bySample', { n: r.sample, answers: pluralWord(r.sample, WORDS.answers) }))
          : esc(t('home.readiness.deltaWeek', { sign: delta > 0 ? '+' : '', n: delta }))}</span>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- resume
function resumeCard(session) {
  const left = remainingMs(session);
  const parts = [];
  if (left !== null) parts.push(left > 0 ? t('home.resume.timeLeft', { clock: clock(left) }) : t('home.resume.timeUp'));
  parts.push(t('home.resume.savedAgo', { ago: agoLabel(Date.now() - session.savedAt) }));

  return `
    <div class="card resume">
      <div class="label">${esc(t('home.resume.title'))}</div>
      <div class="resume-title">${esc(t('home.resume.question', { mode: MODE_LABEL()[session.mode] || session.mode, i: session.i + 1, total: session.qs.length }))}</div>
      <div class="resume-meta">${esc(parts.join(' · '))}</div>
      <button class="btn primary wide" data-act="resume" type="button">
        ${left === 0 ? esc(t('home.resume.viewResult')) : esc(t('home.resume.return'))}
      </button>
    </div>`;
}

// ---------------------------------------------------------------- plan
const planRow = ({ act, badge, tone, title, note }) => `
  <button class="plan-row" data-act="${act}" type="button">
    <span class="plan-badge ${tone}">${esc(badge)}</span>
    <span class="plan-text">
      <span class="plan-title">${esc(title)}</span>
      <span class="plan-note">${esc(note)}</span>
    </span>
    <span class="plan-chevron">›</span>
  </button>`;

// The weekly mock, which onboarding promised under "через месяц" and nothing ever
// tracked. Due ones are a row you can act on; a mock that is not due yet still says when,
// because "по какому плану я иду" was the question that got this built.
function mockRow(mock) {
  if (mock.due) {
    return planRow({
      act: 'mock', badge: '!', tone: 'warn',
      title: t('home.plan.mock.due'),
      note: mock.last
        ? t('home.plan.mock.dueLast', { n: mock.daysSince, days: pluralWord(mock.daysSince, WORDS.days) })
        : t('home.plan.mock.dueNever'),
    });
  }
  return `
    <div class="plan-row static">
      <span class="plan-badge ok">✓</span>
      <span class="plan-text">
        <span class="plan-title">${esc(t('home.plan.mock.done'))}</span>
        <span class="plan-note">${esc(t('home.plan.mock.doneNote', { n: mock.daysLeft, days: pluralWord(mock.daysLeft, WORDS.days) }))}</span>
      </span>
    </div>`;
}

function planCards({ due, nextDue, weakDomain, ddDone, mock }) {
  const rows = [];

  if (due) {
    rows.push(planRow({
      act: 'srs', badge: String(due), tone: 'err',
      title: t('home.plan.srs.title'),
      note: t('home.plan.srs.note'),
    }));
  } else {
    const when = nextDue
      ? (nextDue <= 1 ? t('home.plan.srs.nextTomorrow') : t('home.plan.srs.nextIn', { n: nextDue, days: pluralWord(nextDue, WORDS.days) }))
      : t('home.plan.srs.nextEmpty');
    rows.push(`
      <div class="plan-row static">
        <span class="plan-badge ok">✓</span>
        <span class="plan-text">
          <span class="plan-title">${esc(t('home.plan.srs.doneTitle'))}</span>
          <span class="plan-note">${esc(when)}</span>
        </span>
      </div>`);
  }

  rows.push(mockRow(mock));

  if (weakDomain) {
    rows.push(planRow({
      act: 'weak', badge: `${weakDomain.pct}%`, tone: toneFor(weakDomain.pct),
      title: weakDomain.name.replace(/^\d+\.\d+\s+/, ''),
      note: t('home.plan.weakest'),
    }));
  }

  rows.push(planRow({
    act: 'dd', badge: 'D&D', tone: 'ok',
    title: t('home.plan.dd.title'),
    note: ddDone ? t('home.plan.dd.noteDone') : t('home.plan.dd.note'),
  }));

  return `<div class="plan">${rows.join('')}</div>`;
}

// ---------------------------------------------------------------- screen
export const home = {
  id: 'home',

  render(ctx) {
    const { bank } = ctx;
    const now = Date.now();
    const s = store.session;

    const r = readiness(store.attempts, bank.byN, bank.meta.domains);
    const delta = readinessDelta(store.attempts, bank.byN, bank.meta.domains, now - 7 * DAY_MS);

    const has = qn => bank.byN.has(qn);
    const due = dueCount(store.srs, now, { has });
    const soonest = nextDueAt(store.srs, { has });
    const nextDue = soonest ? Math.max(1, Math.ceil((soonest - now) / DAY_MS)) : null;

    // Weakest domain by the same windowed numbers the forecast uses, so the plan and the
    // readiness bar never disagree about what is going badly.
    const weakDomain = bank.meta.domains
      .map(d => ({ ...d, ...r.perDomain[d.id] }))
      .filter(d => d.tot > 0)
      .sort((a, b) => a.pct - b.pct)[0] || null;

    const goal = store.profile.dailyGoal;
    const today = answeredOn(store.activity, now);
    const streak = streakDays(store.activity, now);
    const total = answeredTotal(store.activity);

    const node = h(`
      ${readinessBlock(r, delta, store.profile)}
      ${s ? resumeCard(s) : ''}
      <div class="label spaced">${esc(t('home.plan.today', { today, goal }))}</div>
      ${planCards({ due, nextDue, weakDomain, ddDone: false, mock: mockState(store.attempts, now) })}
      <div class="mini-stats">
        <div class="card mini"><b class="mono">${streak}</b><span>${esc(t('home.stats.streak', { n: streak, days: pluralWord(streak, WORDS.daysStreak) }))}</span></div>
        <div class="card mini"><b class="mono">${groupThousands(total)}</b><span>${esc(t('home.stats.total'))}</span></div>
      </div>
    `);

    node.addEventListener('click', async e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;

      if (act === 'profile') return ctx.router.modal(profileScreen);

      // Hands over to the Экзамен tab rather than starting 100 questions on one tap — the
      // preset is a decision, and a running session would be lost without being asked.
      if (act === 'mock') return ctx.router.selectTab('exam');

      if (act === 'resume') {
        // An exam whose clock ran out while the app was gone is over — score it and show
        // the result instead of handing back a dead timer.
        if (store.session.mode === 'exam' && isExpired(store.session)) {
          const { attempt, result } = finishSession(store.session, bank);
          store.flush();
          return ctx.router.modal(resultScreen, { attempt, result });
        }
        return ctx.router.modal(questionScreen);
      }

      if (store.session) {
        const yes = await confirmDialog({
          title: t('common.startSession.title'),
          text: t('common.unfinishedLost'),
          ok: t('common.start'), cancel: t('common.cancel'),
        });
        if (!yes) return;
      }

      if (act === 'srs') startSrs(bank, dueQueue(store.srs, now, { limit: goal, has }));
      else if (act === 'weak') startPractice(bank, { count: 20, domain: weakDomain.id });
      else if (act === 'dd') startPractice(bank, { count: 10, types: ['dd'] });
      ctx.router.modal(questionScreen);
    });

    return node;
  },
};
