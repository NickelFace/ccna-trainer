// Профиль и план обучения.
//
// Onboarding asks two questions on first launch and then never comes back, so until this
// screen existed the answers were permanent — a date picked as "через месяц" stayed a
// month from that first launch forever, and its own hint pointed at a Профиль screen that
// did not exist. This is that screen.
//
// Deliberately narrow: it edits the three things onboarding sets (plus language, added
// alongside it once the i18n layer existed) and says under each one what it actually
// changes. Font size lives on the question screen where it is previewed, the AI target on
// the prompt screen, backup on Прогресс — none of them are moved here just to make the
// settings list look full.
import { esc, h } from '../dom.js';
import { store } from '../store.js';
import { LEVELS, LEVELS_EN } from '../../engine/ai-prompt.js';
import { daysUntil } from '../../engine/localdate.js';
import { dayKey } from '../../engine/stats.js';
import { DEFAULT_TIME, requestPermission, reschedule } from '../notify.js';
import { t, getLang, setLang, pluralWord, WORDS } from '../i18n.js';

// The onboarding presets, as a plain list — the pace a learner picks is one of these four
// far more often than an arbitrary number, and a number pad for "вопросов в день" invites
// a 200 nobody will hold to.
const GOALS = [15, 20, 30, 60];

const LEVEL_OPTIONS = () => [
  { value: 'first', title: t('onboarding.level.first.title'), note: t('onboarding.level.first.note') },
  { value: 'again', title: t('onboarding.level.again.title'), note: t('onboarding.level.again.note') },
  { value: 'retake', title: t('onboarding.level.retake.title'), note: t('onboarding.level.retake.note') },
];

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
  const perDay = t('profile.plan.perDay', { n: goal, questions: pluralWord(goal, WORDS.questions) });
  if (left === null) return t('profile.plan.noDate', { perDay });
  if (left < 0) return t('profile.plan.passed', { n: -left, days: pluralWord(-left, WORDS.days), perDay });
  if (left === 0) return t('profile.plan.today', { perDay });
  const days = t('profile.plan.daysUntil', { n: left, days: pluralWord(left, WORDS.days) });
  if (left > HORIZON_DAYS) return t('profile.plan.farOut', { days, perDay });
  const total = left * goal;
  return t('profile.plan.total', {
    days,
    goal,
    perQ: pluralWord(goal, WORDS.questionsDat),
    total,
    qs: pluralWord(total, WORDS.questions),
  });
}

const SWITCHES = () => [
  { id: 'enabled', label: t('profile.notify.enabled.label'), note: t('profile.notify.enabled.note') },
  { id: 'daily', label: t('profile.notify.daily.label'), note: t('profile.notify.daily.note') },
  { id: 'weeklyMock', label: t('profile.notify.weeklyMock.label'), note: t('profile.notify.weeklyMock.note') },
];

function switchRows(p) {
  // The two specific reminders are meaningless while the master switch is off, so they
  // are shown disabled rather than hidden — hiding them loses the answer to "а что вообще
  // может приходить?", which is the question the switch is there to answer.
  const off = !p.notify.enabled;
  return SWITCHES().map(s => {
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

function langRows(lang) {
  const OPTS = [
    { id: 'ru', label: t('profile.language.ru') },
    { id: 'en', label: t('profile.language.en') },
  ];
  return `<div class="ai-chips">${OPTS.map(o =>
    `<button class="pill${lang === o.id ? ' on' : ''}" data-lang="${o.id}" type="button">${esc(o.label)}</button>`
  ).join('')}</div>`;
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
    b.innerHTML = `<span class="mono">←</span> ${esc(t('profile.header'))}`;
    b.addEventListener('click', () => ctx.router.back());
    return b;
  },

  render(ctx) {
    const p = store.profile;

    const levels = LEVEL_OPTIONS().map(o => `
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

    const levelPhrases = getLang() === 'en' ? LEVELS_EN : LEVELS;
    const levelWord = p.level ? levelPhrases[p.level] : null;

    const node = h(`
      <div class="card plan-card">
        <div class="card-head"><span>${esc(t('profile.plan.title'))}</span></div>
        <p class="plan-line">${esc(planLine(p))}</p>
      </div>

      <div class="label spaced">${esc(t('profile.examDate'))}</div>
      <div class="card">
        <input class="date-input" type="date" value="${p.examDate || ''}" min="${today()}">
        ${p.examDate ? `<button class="btn small" data-act="clear-date" type="button">${esc(t('profile.clearDate'))}</button>` : ''}
        <p class="muted lead">${esc(t('profile.examDate.hint'))}</p>
      </div>

      <div class="label spaced">${esc(t('profile.dailyGoal'))}</div>
      <div class="ai-chips">${goals.map(g =>
        `<button class="pill${p.dailyGoal === g ? ' on' : ''}" data-goal="${g}" type="button">${g}</button>`
      ).join('')}</div>
      <p class="muted lead">${esc(t('profile.dailyGoal.hint'))}</p>

      <div class="label spaced">${esc(t('profile.notify'))}</div>
      <div class="switches">${switchRows(p)}</div>
      ${p.notify.enabled ? `
        <div class="card">
          <input class="time-input" type="time" value="${p.notify.time || DEFAULT_TIME}">
          <p class="muted lead">${esc(t('profile.notify.timeHint'))}</p>
        </div>` : ''}
      <p class="muted lead" data-perm>${esc(permissionNote)}</p>

      <div class="label spaced">${esc(t('profile.level'))}</div>
      <div class="choices">${levels}</div>
      <p class="muted lead">${esc(t('profile.level.hint', { level: levelWord || t('profile.level.fallback') }))}</p>

      <div class="label spaced">${esc(t('profile.language'))}</div>
      ${langRows(getLang())}
      <p class="muted lead">${esc(t('profile.language.hint'))}</p>
    `);

    node.addEventListener('click', async e => {
      const langBtn = e.target.closest('[data-lang]')?.dataset.lang;
      if (langBtn) {
        setLang(langBtn);
        ctx.router.renderTabs();
        return ctx.router.render();
      }

      const sw = e.target.closest('[data-notify]')?.dataset.notify;
      if (sw) {
        const notify = { ...store.profile.notify };
        if (sw === 'enabled' && !notify.enabled) {
          // Ask only when switching on: requesting on every render would nag, and asking
          // after a refusal does nothing — Android answers from its own record.
          const state = await requestPermission();
          if (state === 'denied') {
            permissionNote = t('profile.notify.denied');
            return ctx.router.render();
          }
          permissionNote = state === 'unsupported' ? t('profile.notify.unsupported') : '';
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
