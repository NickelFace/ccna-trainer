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

const MODE_LABEL = { exam: 'Пробный экзамен', practice: 'Тренировка', srs: 'Повторение' };

const agoLabel = ms => {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const hrs = Math.round(min / 60);
  return hrs < 24 ? `${hrs} ч назад` : `${Math.round(hrs / 24)} дн назад`;
};

const clock = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms % 60000 / 1000)).padStart(2, '0')}`;

const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

const groupThousands = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// ---------------------------------------------------------------- readiness
function readinessBlock(r, delta, profile) {
  const left = daysUntil(profile.examDate);
  const sub = [
    left === null ? 'дата экзамена не задана'
      : left < 0 ? `дата экзамена прошла, ${-left} ${plural(-left, 'день', 'дня', 'дней')} назад`
      : left === 0 ? 'экзамен сегодня'
      : `экзамен через ${left} ${plural(left, 'день', 'дня', 'дней')}`,
    'порог 825',
  ].join(' · ');

  // The countdown and the daily quota are the whole plan, and both were set once during
  // onboarding with no way back — so the line that shows them is also the way to change
  // them. A settings screen filed under a tab nobody opens would not be found.
  const planRow = `
    <div class="muted readiness-sub">${esc(sub)}
      <button class="plan-btn" data-act="profile" type="button">план · изменить</button>
    </div>`;

  if (r.forecast === null) {
    return `
      <div class="readiness">
        <div class="readiness-head"><span class="readiness-pct">Готовность —</span></div>
        ${planRow}
        <p class="muted lead">Прогноз появится после первых ответов: он считается по
        последним 200 ответам, взвешенным по шести доменам Cisco.</p>
      </div>`;
  }

  return `
    <div class="readiness">
      <div class="readiness-head">
        <span class="readiness-pct">Готовность ${r.pct}%</span>
      </div>
      ${planRow}
      <div class="readiness-track"><i style="width:${Math.min(100, r.pct)}%"></i></div>
      <div class="readiness-foot mono">
        <span>прогноз ${r.forecast} / 1000</span>
        <span>${delta === null ? `по ${r.sample} ответам` : `${delta > 0 ? '+' : ''}${delta} за неделю`}</span>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- resume
function resumeCard(session) {
  const left = remainingMs(session);
  const parts = [];
  if (left !== null) parts.push(left > 0 ? `осталось ${clock(left)}` : 'время вышло');
  parts.push(`сохранено ${agoLabel(Date.now() - session.savedAt)}`);

  return `
    <div class="card resume">
      <div class="label">Продолжить</div>
      <div class="resume-title">${esc(MODE_LABEL[session.mode] || session.mode)} · вопрос ${session.i + 1} из ${session.qs.length}</div>
      <div class="resume-meta">${esc(parts.join(' · '))}</div>
      <button class="btn primary wide" data-act="resume" type="button">
        ${left === 0 ? 'Посмотреть результат' : 'Вернуться'}
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
      title: 'Пробный экзамен',
      note: mock.last
        ? `последний ${mock.daysSince} ${plural(mock.daysSince, 'день', 'дня', 'дней')} назад — пора`
        : 'ещё не проходил — одна попытка покажет расклад по доменам',
    });
  }
  return `
    <div class="plan-row static">
      <span class="plan-badge ok">✓</span>
      <span class="plan-text">
        <span class="plan-title">Пробный экзамен пройден</span>
        <span class="plan-note">${esc(`следующий через ${mock.daysLeft} ${plural(mock.daysLeft, 'день', 'дня', 'дней')}`)}</span>
      </span>
    </div>`;
}

function planCards({ due, nextDue, weakDomain, ddDone, mock }) {
  const rows = [];

  if (due) {
    rows.push(planRow({
      act: 'srs', badge: String(due), tone: 'err',
      title: 'Повторить ошибки',
      note: 'вопросы, у которых подошёл срок повтора',
    }));
  } else {
    const when = nextDue
      ? `следующий повтор ${nextDue <= 1 ? 'завтра' : `через ${nextDue} ${plural(nextDue, 'день', 'дня', 'дней')}`}`
      : 'здесь появятся вопросы, в которых ошибёшься';
    rows.push(`
      <div class="plan-row static">
        <span class="plan-badge ok">✓</span>
        <span class="plan-text">
          <span class="plan-title">Всё повторено</span>
          <span class="plan-note">${esc(when)}</span>
        </span>
      </div>`);
  }

  rows.push(mockRow(mock));

  if (weakDomain) {
    rows.push(planRow({
      act: 'weak', badge: `${weakDomain.pct}%`, tone: toneFor(weakDomain.pct),
      title: weakDomain.name.replace(/^\d+\.\d+\s+/, ''),
      note: 'самый слабый домен по последним ответам',
    }));
  }

  rows.push(planRow({
    act: 'dd', badge: 'D&D', tone: 'ok',
    title: 'Тренажёр сопоставлений',
    note: ddDone ? 'сопоставления тапом, 10 вопросов' : 'разложить элементы по категориям тапом',
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
      <div class="label spaced">План на сегодня · ${today} из ${goal}</div>
      ${planCards({ due, nextDue, weakDomain, ddDone: false, mock: mockState(store.attempts, now) })}
      <div class="mini-stats">
        <div class="card mini"><b class="mono">${streak}</b><span>${plural(streak, 'день подряд', 'дня подряд', 'дней подряд')}</span></div>
        <div class="card mini"><b class="mono">${groupThousands(total)}</b><span>пройдено вопросов</span></div>
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
          title: 'Начать новую сессию?',
          text: 'Незаконченная сессия будет потеряна.',
          ok: 'Начать', cancel: 'Отмена',
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
