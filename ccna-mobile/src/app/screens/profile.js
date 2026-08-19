// Профиль и план обучения.
//
// Onboarding asks two questions on first launch and then never comes back, so until this
// screen existed the answers were permanent — a date picked as "через месяц" stayed a
// month from that first launch forever, and its own hint pointed at a Профиль screen that
// did not exist. This is that screen.
//
// Deliberately narrow: it edits the three things onboarding sets, and says under each one
// what it actually changes. Font size lives on the question screen where it is previewed,
// the AI target on the prompt screen, backup on Прогресс — none of them are moved here
// just to make the settings list look full.
import { esc, h } from '../dom.js';
import { store } from '../store.js';
import { LEVELS } from '../../engine/ai-prompt.js';
import { daysUntil } from '../../engine/localdate.js';
import { dayKey } from '../../engine/stats.js';
import { DEFAULT_TIME, requestPermission, reschedule } from '../notify.js';

// The onboarding presets, as a plain list — the pace a learner picks is one of these four
// far more often than an arbitrary number, and a number pad for "вопросов в день" invites
// a 200 nobody will hold to.
const GOALS = [15, 20, 30, 60];

const LEVEL_OPTIONS = [
  { value: 'first', title: 'Первый раз', note: 'CCNA ещё не сдавал' },
  { value: 'again', title: 'Готовился раньше', note: 'база есть, нужно освежить' },
  { value: 'retake', title: 'Пересдача', note: 'знаю, где провалился' },
];

const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

// Local date, not `toISOString().slice(0, 10)` — that reads the UTC calendar day, which
// east of UTC (Sydney) is still yesterday for the first hours of the local day, letting
// the date-input's `min` reject today's own date.
const today = () => dayKey(Date.now());

// The one line that answers "по какому плану я иду": the pace, the deadline, and what the
// two together come out to. Without it the numbers are set in three places and joined
// nowhere.
// Past this the multiplication says nothing — a date years out gives a total in the
// hundreds of thousands, which reads as a glitch rather than as a plan.
const HORIZON_DAYS = 180;

function planLine(profile) {
  const left = daysUntil(profile.examDate);
  const goal = profile.dailyGoal;
  const perDay = `${goal} ${plural(goal, 'вопрос', 'вопроса', 'вопросов')} в день`;
  if (left === null) return `${perDay}, даты экзамена нет — обратного отсчёта на главной не будет.`;
  if (left < 0) return `Дата экзамена прошла, ${-left} ${plural(-left, 'день', 'дня', 'дней')} назад — обнови её ниже, если пересдаёшь, или убери. Норма — ${perDay}.`;
  if (left === 0) return `Экзамен сегодня. Норма — ${perDay}.`;
  const days = `${left} ${plural(left, 'день', 'дня', 'дней')} до экзамена`;
  if (left > HORIZON_DAYS) return `${days}, норма — ${perDay}.`;
  const total = left * goal;
  return `${days} по ${goal} ${plural(goal, 'вопросу', 'вопроса', 'вопросов')} в день — это ${total} ${plural(total, 'вопрос', 'вопроса', 'вопросов')} до даты.`;
}

const SWITCHES = [
  { id: 'enabled', label: 'Напоминания', note: 'локальные, приходят с телефона' },
  { id: 'daily', label: 'Дневная норма', note: 'если к вечеру норма не закрыта' },
  { id: 'weeklyMock', label: 'Пробный экзамен раз в неделю', note: 'когда с прошлого прошло 7 дней' },
];

function switchRows(p) {
  // The two specific reminders are meaningless while the master switch is off, so they
  // are shown disabled rather than hidden — hiding them loses the answer to "а что вообще
  // может приходить?", which is the question the switch is there to answer.
  const off = !p.notify.enabled;
  return SWITCHES.map(s => {
    const on = s.id === 'enabled' ? p.notify.enabled : p.notify.enabled && p.notify[s.id] !== false;
    const dim = s.id !== 'enabled' && off;
    return `
      <div class="switch-row${dim ? ' dim' : ''}">
        <span class="switch-text">
          <span class="switch-label">${esc(s.label)}</span>
          <span class="switch-note">${esc(s.note)}</span>
        </span>
        <button class="switch${on ? ' on' : ''}" data-notify="${s.id}" type="button"
          role="switch" aria-checked="${on}" ${dim ? 'disabled' : ''}><i></i></button>
      </div>`;
  }).join('');
}

// Reported rather than assumed: Android 13+ can refuse the permission outright, and a row
// of switches that look armed while the OS drops every notification is the worst outcome.
let permissionNote = '';

export const profile = {
  id: 'profile',

  header: ctx => {
    const b = document.createElement('button');
    b.className = 'back-btn';
    b.type = 'button';
    b.innerHTML = '<span class="mono">←</span> Профиль';
    b.addEventListener('click', () => ctx.router.back());
    return b;
  },

  render(ctx) {
    const p = store.profile;

    const levels = LEVEL_OPTIONS.map(o => `
      <button class="choice${p.level === o.value ? ' on' : ''}" data-level="${o.value}" type="button">
        <span class="choice-text">
          <span class="choice-title">${esc(o.title)}</span>
          <span class="choice-note">${esc(o.note)}</span>
        </span>
        <span class="choice-mark">${p.level === o.value ? '✓' : ''}</span>
      </button>`).join('');

    // A goal restored from a backup (or an older build) can sit outside the presets —
    // show it rather than silently drawing none of the chips as selected.
    const goals = [...new Set([...GOALS, p.dailyGoal])].sort((a, b) => a - b);

    const node = h(`
      <div class="card plan-card">
        <div class="card-head"><span>План обучения</span></div>
        <p class="plan-line">${esc(planLine(p))}</p>
      </div>

      <div class="label spaced">Дата экзамена</div>
      <div class="card">
        <input class="date-input" type="date" value="${p.examDate || ''}" min="${today()}">
        ${p.examDate ? '<button class="btn small" data-act="clear-date" type="button">Убрать дату</button>' : ''}
        <p class="muted lead">Управляет обратным отсчётом на главной. На подбор вопросов не влияет.</p>
      </div>

      <div class="label spaced">Норма в день</div>
      <div class="ai-chips">${goals.map(g =>
        `<button class="pill${p.dailyGoal === g ? ' on' : ''}" data-goal="${g}" type="button">${g}</button>`
      ).join('')}</div>
      <p class="muted lead">Это «План на сегодня» на главной. Приложение не ограничивает — можно решать больше.</p>

      <div class="label spaced">Напоминания</div>
      <div class="switches">${switchRows(p)}</div>
      ${p.notify.enabled ? `
        <div class="card">
          <input class="time-input" type="time" value="${p.notify.time || DEFAULT_TIME}">
          <p class="muted lead">Время, в которое приходят оба напоминания. Всё считается на телефоне — интернет не нужен.</p>
        </div>` : ''}
      <p class="muted lead" data-perm>${esc(permissionNote)}</p>

      <div class="label spaced">С чего начинаешь</div>
      <div class="choices">${levels}</div>
      <p class="muted lead">Идёт в промпт для ИИ: «Я ${esc(LEVELS[p.level] || 'готовлюсь к экзамену')}». Больше ни на что не влияет.</p>
    `);

    node.addEventListener('click', async e => {
      const sw = e.target.closest('[data-notify]')?.dataset.notify;
      if (sw) {
        const notify = { ...store.profile.notify };
        if (sw === 'enabled' && !notify.enabled) {
          // Ask only when switching on: requesting on every render would nag, and asking
          // after a refusal does nothing — Android answers from its own record.
          const state = await requestPermission();
          if (state === 'denied') {
            permissionNote = 'Android не разрешил уведомления этому приложению. Включи их в настройках телефона, потом вернись сюда.';
            return ctx.router.render();
          }
          permissionNote = state === 'unsupported'
            ? 'В браузере напоминания не приходят — они работают только в приложении на телефоне.'
            : '';
        }
        if (sw === 'enabled') notify.enabled = !notify.enabled;
        else notify[sw] = notify[sw] === false;   // undefined and true both mean "on"
        store.patchProfile({ notify });
        await reschedule();
        return ctx.router.render();
      }

      const level = e.target.closest('[data-level]')?.dataset.level;
      if (level) {
        store.patchProfile({ level: store.profile.level === level ? null : level });
        return ctx.router.render();
      }
      const goal = e.target.closest('[data-goal]')?.dataset.goal;
      if (goal) {
        store.patchProfile({ dailyGoal: Number(goal) });
        await reschedule();   // the daily reminder quotes the quota and fires against it
        return ctx.router.render();
      }
      if (e.target.closest('[data-act="clear-date"]')) {
        store.patchProfile({ examDate: null });
        ctx.router.render();
      }
    });

    // 'change' rather than 'input': a native date picker fires input for every spin of the
    // year wheel, and each one would re-render the screen out from under the open picker.
    node.querySelector('.date-input').addEventListener('change', e => {
      store.patchProfile({ examDate: e.target.value || null });
      ctx.router.render();
    });

    node.querySelector('.time-input')?.addEventListener('change', async e => {
      const time = e.target.value || DEFAULT_TIME;
      store.patchProfile({ notify: { ...store.profile.notify, time } });
      await reschedule();
      ctx.router.render();
    });

    return node;
  },

  // Everything here writes straight to the profile; flush on the way out so a kill right
  // after changing the date cannot lose it.
  unmount() { store.flush(); },
};
