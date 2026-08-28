// Tab 2 — practice. A run over the whole bank now; the SRS queue, weak-domain drilling
// and "работа над ошибками" arrive with steps 5 and 6.
import { esc, h } from '../dom.js';
import { store } from '../store.js';
import { startPractice } from '../session.js';
import { confirmDialog } from '../dialog.js';
import { question } from './question.js';
import { t } from '../i18n.js';

const SETS = () => [
  { count: 10, label: t('learn.warmup.title'), note: t('learn.warmup.note') },
  { count: 20, label: t('learn.practice.title'), note: t('learn.practice.note') },
];

export const learn = {
  id: 'learn',

  render(ctx) {
    const byDomain = ctx.bank.meta.domains.map(d => `
      <button class="dom-pick" data-domain="${d.id}" type="button">
        <span>${esc(d.name.replace(/^\d+\.\d+\s+/, ''))}</span>
        <span class="mono muted">${d.count} →</span>
      </button>`).join('');

    const node = h(`
      <h1 class="screen-title">${esc(t('learn.title'))}</h1>
      <div class="presets">
        ${SETS().map(s => `
          <button class="preset" data-count="${s.count}" type="button">
            <span class="preset-title">${esc(s.label)}</span>
            <span class="preset-note">${esc(s.note)}</span>
          </button>`).join('')}
      </div>
      <div class="label spaced">${esc(t('learn.byDomain'))}</div>
      <div class="card tight">${byDomain}</div>
    `);

    node.addEventListener('click', async e => {
      const set = e.target.closest('[data-count]');
      const dom = e.target.closest('[data-domain]');
      if (!set && !dom) return;
      if (store.session) {
        const yes = await confirmDialog({
          title: t('common.startTraining.title'),
          text: t('common.unfinishedLost'),
          ok: t('common.start'),
          cancel: t('common.cancel'),
        });
        if (!yes) return;
      }
      startPractice(ctx.bank, set
        ? { count: +set.dataset.count }
        : { count: 20, domain: dom.dataset.domain });
      ctx.router.modal(question);
    });

    return node;
  },
};
