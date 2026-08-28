// Tab 3 — exam setup (spec 09). Presets on top, manual filters folded away below,
// and the switches that apply while an exam is running.
import { esc, h } from '../dom.js';
import { store } from '../store.js';
import { EXAM_PRESETS, startExam } from '../session.js';
import { readiness } from '../../engine/readiness.js';
import { confirmDialog } from '../dialog.js';
import { question } from './question.js';
import { t } from '../i18n.js';

// Runtime switches. "Скрыть уведомления" from the mockup is absent on purpose: Android
// only silences notifications through Do Not Disturb, which needs a system-level policy
// grant the user has to give in Settings. A switch that quietly does nothing is worse
// than no switch.
const RUN_SWITCHES = () => [
  { id: 'keepAwake', label: t('exam.switch.keepAwake.label'), note: t('exam.switch.keepAwake.note'), on: true },
  { id: 'instant', label: t('exam.switch.instant.label'), note: t('exam.switch.instant.note'), on: false },
];

let manualOpen = false;
let manual = { domains: new Set(), types: new Set(), count: 60, minutes: 90, shuffle: true };

const QTYPES = () => [
  { id: 'txt', label: t('exam.qtype.txt') },
  { id: 'ex', label: t('exam.qtype.ex') },
  { id: 'dd', label: t('exam.qtype.dd') },
];

const PRESET_LABEL = () => ({
  full: { label: t('exam.preset.full.label'), note: t('exam.preset.full.note') },
  short: { label: t('exam.preset.short.label'), note: t('exam.preset.short.note') },
  weak: { label: t('exam.preset.weak.label'), note: t('exam.preset.weak.note') },
  manual: { label: t('exam.preset.manual.label'), note: t('exam.preset.manual.note') },
});

const examSettings = () => ({ ...Object.fromEntries(RUN_SWITCHES().map(s => [s.id, s.on])), ...store.profile.exam });

function presetCards(selected) {
  const labels = PRESET_LABEL();
  return Object.keys(EXAM_PRESETS).map(id => `
    <button class="choice${id === selected ? ' on' : ''}" data-preset="${id}" type="button">
      <span class="choice-text">
        <span class="choice-title">${esc(labels[id].label)}</span>
        <span class="choice-note">${esc(labels[id].note)}</span>
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
      <div class="label">${esc(t('exam.manual.domains'))}</div>
      <div class="ai-chips">${chips(domains, manual.domains, 'domain')}</div>
      <div class="label spaced">${esc(t('exam.manual.types'))}</div>
      <div class="ai-chips">${chips(QTYPES(), manual.types, 'type')}</div>
      <div class="label spaced">${esc(t('exam.manual.count'))}</div>
      <div class="ai-chips">${[30, 60, 100].map(n =>
        `<button class="pill${manual.count === n ? ' on' : ''}" data-count="${n}" type="button">${n}</button>`).join('')}</div>
      <div class="label spaced">${esc(t('exam.manual.time'))}</div>
      <div class="ai-chips">${[[30, t('exam.manual.min', { n: 30 })], [90, t('exam.manual.min', { n: 90 })], [120, t('exam.manual.min', { n: 120 })], [0, t('exam.manual.noTimer')]].map(([v, l]) =>
        `<button class="pill${manual.minutes === v ? ' on' : ''}" data-minutes="${v}" type="button">${esc(l)}</button>`).join('')}</div>
    </div>`;
}

function switchRows(settings) {
  return RUN_SWITCHES().map(s => `
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
        <button class="btn primary grow" data-act="start" type="button">${esc(t('exam.start', { n: count }))}</button>
      </div>`);

    node.querySelector('[data-act="start"]').addEventListener('click', async () => {
      if (store.session) {
        const yes = await confirmDialog({
          title: t('exam.newExam.title'),
          text: t('common.unfinishedLost'),
          ok: t('common.start'), cancel: t('common.cancel'),
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
      <h1 class="screen-title">${esc(t('exam.title'))}</h1>
      <p class="muted lead">${esc(t('exam.lead'))}</p>
      <div class="choices">${presetCards(preset)}</div>
      <button class="accordion${manualOpen ? ' open' : ''}" data-act="manual" type="button">
        <span class="accordion-text">
          <span class="accordion-title">${esc(t('exam.manual.toggle'))} ${manualOpen ? '▴' : '▾'}</span>
          <span class="accordion-note">${esc(t('exam.manual.note'))}</span>
        </span>
      </button>
      ${manualOpen ? manualPanel(ctx.bank) : ''}
      <div class="label spaced">${esc(t('exam.runSettings'))}</div>
      <div class="switches">${switchRows(settings)}</div>
    `);

    node.addEventListener('click', e => {
      const t2 = e.target;

      const presetId = t2.closest('[data-preset]')?.dataset.preset;
      if (presetId) { store.patchProfile({ examPreset: presetId }); return ctx.router.render(); }

      if (t2.closest('[data-act="manual"]')) {
        manualOpen = !manualOpen;
        if (manualOpen) store.patchProfile({ examPreset: 'manual' });
        return ctx.router.render();
      }

      const sw = t2.closest('[data-switch]')?.dataset.switch;
      if (sw) {
        store.patchProfile({ exam: { ...store.profile.exam, [sw]: !settings[sw] } });
        return ctx.router.render();
      }

      const dom = t2.closest('[data-domain]')?.dataset.domain;
      if (dom) { toggle(manual.domains, dom); return ctx.router.render(); }
      const type = t2.closest('[data-type]')?.dataset.type;
      if (type) { toggle(manual.types, type); return ctx.router.render(); }
      const count = t2.closest('[data-count]')?.dataset.count;
      if (count) { manual.count = Number(count); return ctx.router.render(); }
      const minutes = t2.closest('[data-minutes]')?.dataset.minutes;
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
