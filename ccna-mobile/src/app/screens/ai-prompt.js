// "Разобрать с ИИ" (spec 06, revised for share-flow — feature/share-ii-ux-testbuild).
//
// Change from the copy-and-open version: one action pushes both the assembled prompt and
// the question's schema image to the OS share sheet through Intent.ACTION_SEND, and the
// user picks the target app. The heavy preview panel is gone — schemas are announced by a
// one-line strip only. "Только скопировать" stays as a secondary fallback.
//
// Modal lifecycle: the parts toggles are kept in module state across dismiss + reopen
// within a session, so the user does not lose their picks by tapping back.
import { esc, h } from '../dom.js';
import { store } from '../store.js';
import { buildPrompt, defaultParts, PROMPT_PARTS } from '../../engine/ai-prompt.js';
import { readiness } from '../../engine/readiness.js';
import { domShort } from '../qmarkup.js';
import { toast } from '../toast.js';

// Kept for backwards-compat and the dev browser fallback: when no native share sheet is
// available we still let the user pick an AI target and open its URL directly.
export const AI_TARGETS = [
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'claude', label: 'Claude', url: 'https://claude.ai/new' },
  { id: 'gemini', label: 'Gemini', url: 'https://gemini.google.com/app' },
];

// Module-scope on purpose — survives the modal being dismissed and reopened, so the user
// does not have to re-check the same toggles. unmount() no longer nulls this out.
let parts = null;

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

// The share sheet needs a single image at most — attaching several is meaningful only if
// the user is looking at exactly one wrong question with a schema. For "Все ошибки
// домена" (many items) we fall back to text-only. That matches how the sheet renders too:
// one attachment slot per intent.
function sharedImagePath(items) {
  if (!items || items.length !== 1) return null;
  const q = items[0].q;
  return q && q.img ? `images/exhibits/${q.img}` : null;
}

async function shareViaIntent(text, imageAssetPath) {
  const ShareIntent = window.Capacitor?.Plugins?.ShareIntent;
  if (ShareIntent?.share) {
    try {
      await ShareIntent.share({ text, imageAssetPath: imageAssetPath || undefined, title: 'Разобрать с ИИ' });
      return { ok: true, mode: 'native' };
    } catch (e) {
      console.warn('ShareIntent failed', e);
      return { ok: false, mode: 'native', error: e };
    }
  }
  // Dev browser fallback — no native plugin. Copy the text and open the picked target.
  const copied = await copyText(text);
  const target = AI_TARGETS.find(t => t.id === store.profile.aiTarget) || AI_TARGETS[0];
  openExternally(target.url);
  return { ok: copied, mode: 'fallback', target };
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
          <button class="btn primary grow" data-act="share" type="button">Поделиться с ИИ</button>
        </div>
        <div class="ai-secondary">
          <button class="btn small" data-act="copy" type="button">Только скопировать</button>
          ${ctx.params.moreItems?.length ? '<button class="btn small" data-act="all" type="button">Все ошибки домена</button>' : ''}
        </div>
      </div>`);

    const text = withImages => promptFor(ctx, parts, withImages);

    node.querySelector('[data-act="copy"]').addEventListener('click', async () => {
      // Text-only copy — the sentence about the schema should say it is NOT here.
      toast(await copyText(text(false)) ? 'Скопировано' : 'Не удалось скопировать');
    });

    node.querySelector('[data-act="share"]').addEventListener('click', async () => {
      const imagePath = sharedImagePath(ctx.params.items);
      // When we ship the schema through the intent, tell the model so — otherwise the
      // prompt tells it the picture is missing while the picture is right there.
      const result = await shareViaIntent(text(!!imagePath), imagePath);
      if (result.mode === 'fallback') {
        toast(result.ok ? `Скопировано · открываю ${result.target.label}` : 'Не удалось скопировать');
      } else if (!result.ok) {
        // Native chooser dismissed or crashed — leave a copy in the clipboard so the
        // press is never wasted.
        const copied = await copyText(text());
        toast(copied ? 'Скопировано — вставьте в чат' : 'Не удалось поделиться');
      }
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
    const count = ctx.params.items.length;
    const imagePath = sharedImagePath(ctx.params.items);

    const chips = PROMPT_PARTS.map(p =>
      `<button class="pill${parts.has(p.id) ? ' on' : ''}" data-part="${p.id}" type="button">${esc(p.label)}</button>`
    ).join('');

    const attachedStrip = imagePath
      ? `<div class="ai-attached" role="note"><span class="mono">🖼</span> К вопросу приложена схема — она уйдёт вместе с текстом</div>`
      : '';

    const node = h(`
      <p class="muted lead">${count === 1
        ? 'Промпт собирается на устройстве. Кнопка «Поделиться» откроет системное окно — выберите ChatGPT, Claude, Telegram, что угодно.'
        : `В промпт войдут ${count} вопросов, на которые ты ответил неправильно. Схемы вопросов в этот режим не идут — только текст.`}</p>
      <div class="label">Что включить</div>
      <div class="ai-chips">${chips}</div>
      ${attachedStrip}
      <div class="label spaced">Куда открывать (для «Только скопировать»)</div>
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

  // Deliberately does NOT reset `parts` — the user's toggles survive dismiss + reopen
  // inside the session, matching the requirement in feature/share-ii-ux-testbuild.
  unmount() { /* keep parts */ },
};

function promptFor(ctx, enabled, imagesAttached = false) {
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
    imagesAttached,
  });
}
