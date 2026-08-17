// Tab 3 — exam setup (spec 09). Presets on top, manual filters folded away below,
// and the switches that apply while an exam is running.
import { esc, h } from '../dom.js';
import { store } from '../store.js';
import { EXAM_PRESETS, startExam } from '../session.js';
import { readiness } from '../../engine/readiness.js';
import { confirmDialog } from '../dialog.js';
import { question } from './question.js';

// Runtime switches. "Скрыть уведомления" from the mockup is absent on purpose: Android
// only silences notifications through Do Not Disturb, which needs a system-level policy
// grant the user has to give in Settings. A switch that quietly does nothing is worse
// than no switch.
const RUN_SWITCHES = [
  { id: 'keepAwake', label: 'Не гасить экран', note: 'пока идёт экзамен', on: true },
  { id: 'instant', label: 'Показывать ответ сразу', note: 'разбор после каждого вопроса', on: false },
];

let manualOpen = false;
let manual = { domains: new Set(), types: new Set(), count: 60, minutes: 90, shuffle: true };

const QTYPES = [
  { id: 'txt', label: 'Текст' },
  { id: 'ex', label: 'Со схемой' },
  { id: 'dd', label: 'Сопоставление' },
];

const examSettings = () => ({ ...Object.fromEntries(RUN_SWITCHES.map(s => [s.id, s.on])), ...store.profile.exam });

function presetCards(selected) {
  return Object.entries(EXAM_PRESETS).map(([id, p]) => `
    <button class="choice${id === selected ? ' on' : ''}" data-preset="${id}" type="button">
      <span class="choice-text">
        <span class="choice-title">${esc(p.label)}</span>
        <span class="choice-note">${esc(p.note)}</span>
      </span>
      <span class="choice-mark">${id === selected ? '✓' : ''}</span>
    </button>`).join('');
}

function manualPanel(bank) {
  const chips = (items, set, attr) => items.map(x =>
    `<button class="pill${set.has(x.id) ? ' on' : ''}" data-${attr}="${x.id}" type="button">${esc(x.label)}</button>`
  ).join('');

  const domains = bank.meta.domains.map(d => ({ id: d.id, label: d.name.replace(/^\d+\.\d+\s+/, '') }));

  return `
    <div class="manual">
      <div class="label">Домены · пусто = все</div>
      <div class="ai-chips">${chips(domains, manual.domains, 'domain')}</div>
      <div class="label spaced">Тип вопросов · пусто = все</div>
      <div class="ai-chips">${chips(QTYPES, manual.types, 'type')}</div>
      <div class="label spaced">Сколько вопросов</div>
      <div class="ai-chips">${[30, 60, 100].map(n =>
        `<button class="pill${manual.count === n ? ' on' : ''}" data-count="${n}" type="button">${n}</button>`).join('')}</div>
      <div class="label spaced">Время</div>
      <div class="ai-chips">${[[30, '30 мин'], [90, '90 мин'], [120, '120 мин'], [0, 'без таймера']].map(([v, l]) =>
        `<button class="pill${manual.minutes === v ? ' on' : ''}" data-minutes="${v}" type="button">${l}</button>`).join('')}</div>
    </div>`;
}

function switchRows(settings) {
  return RUN_SWITCHES.map(s => `
    <div class="switch-row">
      <span class="switch-text">
        <span class="switch-label">${esc(s.label)}</span>
        <span class="switch-note">${esc(s.note)}</span>
      </span>
      <button class="switch${settings[s.id] ? ' on' : ''}" data-switch="${s.id}" type="button"
        role="switch" aria-checked="${!!settings[s.id]}"><i></i></button>
    </div>`).join('');
}

export const exam = {
  id: 'exam',

  footer(ctx) {
    const preset = store.profile.examPreset || 'full';
    const count = preset === 'manual' ? manual.count : EXAM_PRESETS[preset].count;
    const node = h(`
      <div class="action-bar">
        <button class="btn primary grow" data-act="start" type="button">Начать · ${count} вопросов</button>
      </div>`);

    node.querySelector('[data-act="start"]').addEventListener('click', async () => {
      if (store.session) {
        const yes = await confirmDialog({
          title: 'Начать новый экзамен?',
          text: 'Незаконченная сессия будет потеряна.',
          ok: 'Начать', cancel: 'Отмена',
        });
        if (!yes) return;
      }
      startExam(ctx.bank, preset, {
        settings: examSettings(),
        manual: preset === 'manual' ? { ...manual, domains: [...manual.domains], types: [...manual.types] } : null,
        weakDomains: preset === 'weak' ? weakDomainIds(ctx) : null,
      });
      ctx.router.modal(question);
    });
    return node;
  },

  render(ctx) {
    const preset = store.profile.examPreset || 'full';
    const settings = examSettings();

    const node = h(`
      <h1 class="screen-title">Экзамен</h1>
      <p class="muted lead">Пресеты сверху покрывают 90% случаев. Тонкая настройка — ниже, свёрнута.</p>
      <div class="choices">${presetCards(preset)}</div>
      <button class="accordion${manualOpen ? ' open' : ''}" data-act="manual" type="button">
        <span class="accordion-text">
          <span class="accordion-title">Настроить вручную ${manualOpen ? '▴' : '▾'}</span>
          <span class="accordion-note">домены · типы вопросов · количество · таймер</span>
        </span>
      </button>
      ${manualOpen ? manualPanel(ctx.bank) : ''}
      <div class="label spaced">На время экзамена</div>
      <div class="switches">${switchRows(settings)}</div>
    `);

    node.addEventListener('click', e => {
      const t = e.target;

      const presetId = t.closest('[data-preset]')?.dataset.preset;
      if (presetId) { store.patchProfile({ examPreset: presetId }); return ctx.router.render(); }

      if (t.closest('[data-act="manual"]')) {
        manualOpen = !manualOpen;
        if (manualOpen) store.patchProfile({ examPreset: 'manual' });
        return ctx.router.render();
      }

      const sw = t.closest('[data-switch]')?.dataset.switch;
      if (sw) {
        store.patchProfile({ exam: { ...store.profile.exam, [sw]: !settings[sw] } });
        return ctx.router.render();
      }

      const dom = t.closest('[data-domain]')?.dataset.domain;
      if (dom) { toggle(manual.domains, dom); return ctx.router.render(); }
      const type = t.closest('[data-type]')?.dataset.type;
      if (type) { toggle(manual.types, type); return ctx.router.render(); }
      const count = t.closest('[data-count]')?.dataset.count;
      if (count) { manual.count = Number(count); return ctx.router.render(); }
      const minutes = t.closest('[data-minutes]')?.dataset.minutes;
      if (minutes !== undefined) { manual.minutes = Number(minutes); return ctx.router.render(); }
    });

    return node;
  },
};

const toggle = (set, value) => set.has(value) ? set.delete(value) : set.add(value);

// "Только слабые домены" takes its list from the same windowed statistics the home screen
// shows, so the preset and the readiness bar never disagree about what is weak.
function weakDomainIds(ctx) {
  const r = readiness(store.attempts, ctx.bank.byN, ctx.bank.meta.domains);
  const ranked = ctx.bank.meta.domains
    .map(d => ({ id: d.id, ...r.perDomain[d.id] }))
    .filter(d => d.tot > 0)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 3)
    .map(d => d.id);
  return ranked.length ? ranked : null;
}
