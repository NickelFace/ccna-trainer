// First launch (spec 01). Three questions, because all three change what the app does:
// the level goes into the AI prompt, the exam date sets the daily quota and the countdown
// on the home screen, and the language switches the whole UI plus which rationale/theory
// fields get read.
//
// The third step used to be a stub — the spec always asked for it, but the mobile app had
// no string table yet, and a language switch that changed nothing would have been a lie in
// the UI. It is real now that i18n.js exists.
import { esc, h } from '../dom.js';
import { store } from '../store.js';
import { dayKey } from '../../engine/stats.js';
import { t, getLang, setLang } from '../i18n.js';

const STEPS = () => [
  {
    key: 'level',
    title: t('onboarding.level.title'),
    lead: t('onboarding.level.lead'),
    hint: t('onboarding.level.hint'),
    options: [
      { value: 'first', title: t('onboarding.level.first.title'), note: t('onboarding.level.first.note') },
      { value: 'again', title: t('onboarding.level.again.title'), note: t('onboarding.level.again.note') },
      { value: 'retake', title: t('onboarding.level.retake.title'), note: t('onboarding.level.retake.note') },
    ],
  },
  {
    key: 'examDate',
    title: t('onboarding.date.title'),
    lead: t('onboarding.date.lead'),
    hint: t('onboarding.date.hint'),
    options: [
      { value: 14, title: t('onboarding.date.2w.title'), note: t('onboarding.date.2w.note'), goal: 60 },
      { value: 30, title: t('onboarding.date.1m.title'), note: t('onboarding.date.1m.note'), goal: 30 },
      { value: 90, title: t('onboarding.date.3m.title'), note: t('onboarding.date.3m.note'), goal: 15 },
      { value: null, title: t('onboarding.date.none.title'), note: t('onboarding.date.none.note'), goal: 20 },
    ],
  },
  {
    key: 'lang',
    title: t('onboarding.lang.title'),
    lead: t('onboarding.lang.lead'),
    hint: t('onboarding.lang.hint'),
    options: [
      { value: 'ru', title: t('onboarding.lang.ru'), note: t('onboarding.lang.ru.note') },
      { value: 'en', title: t('onboarding.lang.en'), note: t('onboarding.lang.en.note') },
    ],
  },
];

let step = 0;
let picked = {};

const optionMarkup = (o, selected) => `
  <button class="choice${selected ? ' on' : ''}" data-value="${o.value === null ? '' : o.value}" type="button">
    <span class="choice-text">
      <span class="choice-title">${esc(o.title)}</span>
      <span class="choice-note">${esc(o.note)}</span>
    </span>
    <span class="choice-mark">${selected ? '✓' : ''}</span>
  </button>`;

function commit(ctx) {
  const patch = { level: picked.level ?? null };
  const days = picked.examDate;
  const option = STEPS()[1].options.find(o => o.value === (days ?? null));
  patch.dailyGoal = option?.goal ?? 30;
  // Local calendar date, not `toISOString().slice(0, 10)` — that reads the UTC day, which
  // east of UTC (Sydney) is already tomorrow in the evening, so "через месяц" landed a day
  // early. `setDate` adds calendar days, not a fixed 24h step, so a DST change inside the
  // window can't shift it either.
  const future = new Date();
  if (days) future.setDate(future.getDate() + days);
  patch.examDate = days ? dayKey(future.getTime()) : null;
  patch.onboarded = true;
  store.patchProfile(patch);
  // The pick already flipped the live language (see the click handler below) so the rest
  // of onboarding itself is shown in the chosen language; this just makes sure the profile
  // patch above didn't race the one setLang() already wrote.
  if (picked.lang) store.patchProfile({ lang: picked.lang });
  store.flush();
  ctx.router.back({ force: true });
  ctx.router.renderTabs();
}

export const onboarding = {
  id: 'onboarding',

  footer(ctx) {
    const steps = STEPS();
    const current = steps[step];
    const chosen = picked[current.key] !== undefined;
    const last = step === steps.length - 1;

    const node = h(`
      <div class="action-bar">
        ${step > 0 ? `<button class="btn" data-act="back" type="button">${esc(t('common.back'))}</button>` : ''}
        <button class="btn primary grow" data-act="next" type="button" ${chosen ? '' : 'disabled'}>
          ${last ? esc(t('common.done')) : esc(t('common.next'))}
        </button>
      </div>`);

    node.querySelector('[data-act="back"]')?.addEventListener('click', () => {
      step--;
      ctx.router.render();
    });
    node.querySelector('[data-act="next"]').addEventListener('click', () => {
      if (last) return commit(ctx);
      step++;
      ctx.router.render();
    });
    return node;
  },

  render(ctx) {
    const steps = STEPS();
    const current = steps[step];
    const value = picked[current.key];

    const node = h(`
      <div class="onboard">
        <div class="label onboard-step">${esc(t('onboarding.step', { step: step + 1, total: steps.length }))}</div>
        <h1 class="onboard-title">${esc(current.title)}</h1>
        <p class="onboard-lead">${esc(current.lead)}</p>
        <div class="choices">
          ${current.options.map(o => optionMarkup(o, value === o.value)).join('')}
        </div>
        <p class="onboard-hint">${esc(current.hint)}</p>
      </div>`);

    node.addEventListener('click', e => {
      const btn = e.target.closest('[data-value]');
      if (!btn) return;
      const raw = btn.dataset.value;
      picked[current.key] = raw === '' ? null : (current.key === 'examDate' ? Number(raw) : raw);
      // The language step takes effect immediately — the point of asking is to let the
      // learner see the rest of the flow, and the rest of the app, in the language they
      // just picked, not to file it away for later.
      if (current.key === 'lang') {
        setLang(picked.lang);
        ctx.router.renderTabs();
      }
      ctx.router.render();
    });

    return node;
  },

  // Back steps through the questions rather than abandoning the flow. On the first one it
  // means "skip": the app works on defaults, and nagging on every launch would be worse
  // than taking no for an answer.
  beforeBack(ctx) {
    if (step > 0) { step--; ctx.router.render(); return false; }
    store.patchProfile({ onboarded: true });
    return true;
  },

  unmount() { step = 0; picked = {}; },
};
