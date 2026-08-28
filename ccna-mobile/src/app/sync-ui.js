// The sync card on the Progress tab.
//
// One key, one button, one line of news. Everything underneath it — the protocol, the
// merge, the retry on a conflict — is in ccna-exam-simulator/assets/js/shared/, imported
// by the store and shared byte for byte with the web trainer, so the phone and the browser
// cannot disagree about what merging means.
import { store } from './store.js';
import { toast } from './toast.js';
import { t, getLang } from './i18n.js';

// "Не удалось синхронизировать" tells nobody what to do next. Each of these does.
const SYNC_ERR = () => ({
  key: t('sync.err.key'),
  auth: t('sync.err.auth'),
  closed: t('sync.err.closed'),
  shrink: t('sync.err.shrink'),
  offline: t('sync.err.offline'),
  server: t('sync.err.server'),
  corrupt: t('sync.err.corrupt'),
  conflict: t('sync.err.conflict'),
});

const stamp = ts => new Date(ts).toLocaleString(getLang() === 'en' ? 'en-US' : 'ru-RU', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

const status = () => store.sync.syncedAt
  ? t('sync.syncedAt', { stamp: stamp(store.sync.syncedAt) })
  : t('sync.neverSynced');

export function syncCard() {
  const key = store.sync.key || '';
  return `
    <div class="card sync-card">
      <div class="card-head"><span>${t('sync.title')}</span></div>
      <p class="muted">${t('sync.body')}</p>
      <input class="sync-key" type="text" inputmode="latin" autocomplete="off"
             autocapitalize="none" autocorrect="off" spellcheck="false"
             placeholder="${t('sync.keyPlaceholder')}" value="${key.replace(/"/g, '&quot;')}">
      <div class="backup-actions">
        <button class="btn" data-act="sync" type="button">${t('sync.action')}</button>
        <button class="btn" data-act="newkey" type="button">${t('sync.newKey')}</button>
      </div>
      <p class="muted sync-status">${status()}</p>
    </div>`;
}

export function wireSync(node, ctx) {
  const input = node.querySelector('.sync-key');
  const line = node.querySelector('.sync-status');
  const button = node.querySelector('[data-act="sync"]');

  node.querySelector('[data-act="newkey"]')?.addEventListener('click', () => {
    store.setSync({ key: store.newSyncKey(), syncedAt: 0, rev: 0 });
    ctx.router.render();
    toast(t('sync.keyCreated'));
  });

  button?.addEventListener('click', async () => {
    const key = (input?.value || '').trim();
    if (!store.isSyncKey(key)) return toast(SYNC_ERR().key);
    if (key !== store.sync.key) store.setSync({ key, syncedAt: 0, rev: 0 });

    // The button is the only thing that says work is happening — a sync over a slow
    // connection is otherwise indistinguishable from a tap that missed.
    button.disabled = true;
    if (line) line.textContent = t('sync.syncing');
    try {
      // "Nothing to do" is only true when nothing moved in either direction — a sync
      // that brought the other device's work down writes nothing, and saying it matched
      // already would be saying the opposite of what just happened.
      const { wrote, pulled } = await store.syncNow();
      toast(wrote || pulled
        ? t('sync.done', { n: store.attempts.length })
        : t('sync.upToDate'));
      // The chart, the history and the weak topics above are someone else's now too.
      ctx.router.render();
    } catch (err) {
      if (line) line.textContent = status();
      toast(SYNC_ERR()[err && err.code] || SYNC_ERR().server);
    } finally {
      button.disabled = false;
    }
  });
}
