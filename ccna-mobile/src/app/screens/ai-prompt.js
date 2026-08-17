// "Разобрать с ИИ" (spec 06).
//
// Replaces the web app's copy-the-question-text button with a full request: who is asking,
// what they got wrong, and what shape of answer helps. The prompt is assembled on the
// device, so the screen works offline; only the sending is manual.
import { esc, h } from '../dom.js';
import { store } from '../store.js';
import { buildPrompt, defaultParts, PROMPT_PARTS } from '../../engine/ai-prompt.js';
import { readiness } from '../../engine/readiness.js';
import { domShort } from '../qmarkup.js';
import { toast } from '../toast.js';

// Where "Скопировать и открыть ИИ" goes. Plain https links so the installed app takes
// them over when there is one, and the web version answers when there isn't.
export const AI_TARGETS = [
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'claude', label: 'Claude', url: 'https://claude.ai/new' },
  { id: 'gemini', label: 'Gemini', url: 'https://gemini.google.com/app' },
];

let parts = null;      // Set of enabled toggle ids, kept while the screen is open

// window.open() does nothing inside a Capacitor WebView — verified on the emulator, the
// app just stayed put. AppLauncher hands the URL to Android as a real ACTION_VIEW intent,
// so an installed ChatGPT or Claude app claims it via its app links, and the browser
// takes it otherwise. In the dev browser there is no plugin, so fall back to a new tab.
async function openExternally(url) {
  if (window.Capacitor?.isNativePlatform?.()) {
    const { AppLauncher } = await import('@capacitor/app-launcher');
    await AppLauncher.openUrl({ url });
    return;
  }
  window.open(url, '_blank', 'noopener');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older WebViews, or a context the Clipboard API refuses — fall back to the old trick.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export const aiPrompt = {
  id: 'ai-prompt',

  header: ctx => {
    const b = document.createElement('button');
    b.className = 'back-btn';
    b.type = 'button';
    b.innerHTML = '<span class="mono">←</span> Разобрать с ИИ';
    b.addEventListener('click', () => ctx.router.back());
    return b;
  },

  footer(ctx) {
    const node = h(`
      <div class="ai-bar">
        <div class="action-bar">
          <button class="btn primary grow" data-act="open" type="button">Скопировать и открыть ИИ</button>
        </div>
        <div class="ai-secondary">
          <button class="btn small" data-act="copy" type="button">Только скопировать</button>
          ${ctx.params.moreItems?.length ? '<button class="btn small" data-act="all" type="button">Все ошибки домена</button>' : ''}
        </div>
      </div>`);

    const text = () => promptFor(ctx, parts);

    node.querySelector('[data-act="copy"]').addEventListener('click', async () => {
      toast(await copyText(text()) ? 'Скопировано' : 'Не удалось скопировать');
    });

    node.querySelector('[data-act="open"]').addEventListener('click', async () => {
      const ok = await copyText(text());
      const target = AI_TARGETS.find(t => t.id === store.profile.aiTarget) || AI_TARGETS[0];
      toast(ok ? `Скопировано · открываю ${target.label}` : 'Не удалось скопировать');
      openExternally(target.url);
    });

    node.querySelector('[data-act="all"]')?.addEventListener('click', () => {
      ctx.params.items = ctx.params.moreItems;
      ctx.params.moreItems = null;
      ctx.router.render();
    });

    return node;
  },

  render(ctx) {
    if (!parts) parts = defaultParts();
    const preview = promptFor(ctx, parts);
    const count = ctx.params.items.length;

    const chips = PROMPT_PARTS.map(p =>
      `<button class="pill${parts.has(p.id) ? ' on' : ''}" data-part="${p.id}" type="button">${esc(p.label)}</button>`
    ).join('');

    const node = h(`
      <p class="muted lead">${count === 1
        ? 'Промпт собирается на устройстве и работает без интернета — скопируй и вставь в любой чат.'
        : `В промпт войдут ${count} вопросов, на которые ты ответил неправильно.`}</p>
      <div class="label">Что включить</div>
      <div class="ai-chips">${chips}</div>
      <div class="label spaced">Превью</div>
      <pre class="ai-preview">${esc(preview)}</pre>
      <div class="label spaced">Куда открывать</div>
      <div class="ai-chips">${AI_TARGETS.map(t =>
        `<button class="pill${(store.profile.aiTarget || AI_TARGETS[0].id) === t.id ? ' on' : ''}" data-target="${t.id}" type="button">${esc(t.label)}</button>`
      ).join('')}</div>
    `);

    node.addEventListener('click', e => {
      const part = e.target.closest('[data-part]')?.dataset.part;
      if (part) {
        parts.has(part) ? parts.delete(part) : parts.add(part);
        return ctx.router.render();
      }
      const target = e.target.closest('[data-target]')?.dataset.target;
      if (target) {
        store.patchProfile({ aiTarget: target });
        ctx.router.render();
      }
    });

    return node;
  },

  unmount() { parts = null; },
};

function promptFor(ctx, enabled) {
  const { bank } = ctx;
  const r = readiness(store.attempts, bank.byN, bank.meta.domains);
  const weakest = bank.meta.domains
    .map(d => ({ ...d, ...r.perDomain[d.id] }))
    .filter(d => d.tot > 0)
    .sort((a, b) => a.pct - b.pct)[0];

  return buildPrompt({
    items: ctx.params.items,
    parts: enabled,
    profile: store.profile,
    weakDomain: weakest ? weakest.name.replace(/^\d+\.\d+\s+/, '') : null,
    domainName: id => domShort(bank, id),
  });
}
