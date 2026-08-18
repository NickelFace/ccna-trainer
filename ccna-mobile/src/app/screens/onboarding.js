// First launch (spec 01). Two questions, because both change what the app does:
// the level goes into the AI prompt, and the exam date sets the daily quota and the
// countdown on the home screen.
//
// The spec's third step — RU/EN interface language — is not here. The mobile app has no
// string table yet; adding a language switch that changes nothing would be a lie in the
// UI. See the note in ANDROID_APP.md terms: it needs an i18n layer first.
import { esc, h } from '../dom.js';
import { store } from '../store.js';
import { DAY_MS } from '../../engine/srs.js';

const STEPS = [
  {
    key: 'level',
    title: 'С чего начинаешь?',
    lead: 'От этого зависит, как ИИ будет объяснять разбор ошибок.',
    hint: 'Поменять можно в любой момент: главная → «план · изменить». Ничего не пересчитывается задним числом.',
    options: [
      { value: 'first', title: 'Первый раз', note: 'CCNA ещё не сдавал' },
      { value: 'again', title: 'Готовился раньше', note: 'база есть, нужно освежить' },
      { value: 'retake', title: 'Пересдача', note: 'знаю, где провалился' },
    ],
  },
  {
    key: 'examDate',
    title: 'Когда экзамен?',
    lead: 'От даты зависит дневная норма и приоритет плана.',
    hint: 'Точную дату и норму задаёшь в «Профиле»: главная → «план · изменить». Там же виден обратный отсчёт.',
    options: [
      { value: 14, title: 'Через 2 недели', note: 'спринт · 60 вопросов в день', goal: 60 },
      { value: 30, title: 'Через месяц', note: '30 вопросов в день · 1 пробный в неделю', goal: 30 },
      { value: 90, title: 'Через 3 месяца и больше', note: 'спокойный темп · 15 вопросов в день', goal: 15 },
      { value: null, title: 'Даты пока нет', note: 'без нормы, только тренировка', goal: 20 },
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
  const option = STEPS[1].options.find(o => o.value === (days ?? null));
  patch.dailyGoal = option?.goal ?? 30;
  patch.examDate = days ? new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10) : null;
  patch.onboarded = true;
  store.patchProfile(patch);
  store.flush();
  ctx.router.back({ force: true });
}

export const onboarding = {
  id: 'onboarding',

  footer(ctx) {
    const current = STEPS[step];
    const chosen = picked[current.key] !== undefined;
    const last = step === STEPS.length - 1;

    const node = h(`
      <div class="action-bar">
        ${step > 0 ? '<button class="btn" data-act="back" type="button">Назад</button>' : ''}
        <button class="btn primary grow" data-act="next" type="button" ${chosen ? '' : 'disabled'}>
          ${last ? 'Готово' : 'Дальше'}
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
    const current = STEPS[step];
    const value = picked[current.key];

    const node = h(`
      <div class="onboard">
        <div class="label onboard-step">Шаг ${step + 1} из ${STEPS.length}</div>
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
