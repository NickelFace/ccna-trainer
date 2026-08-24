// The sync card on the Progress tab.
//
// One key, one button, one line of news. Everything underneath it — the protocol, the
// merge, the retry on a conflict — is in ccna-exam-simulator/assets/js/shared/, imported
// by the store and shared byte for byte with the web trainer, so the phone and the browser
// cannot disagree about what merging means.
import { store } from './store.js';
import { toast } from './toast.js';

// "Не удалось синхронизировать" tells nobody what to do next. Each of these does.
const SYNC_ERR = {
  key: 'Ключ не подходит: нужно 32–128 символов — латиница, цифры, «-» и «_».',
  auth: 'Сервер не принял этот ключ.',
  closed: 'Сервер не заводит новые ключи. Введи тот, который уже используется на другом устройстве.',
  shrink: 'Сервер отклонил запись: в ней меньше прогресса, чем уже сохранено. Ничего не потеряно — на сервере осталась прежняя версия.',
  offline: 'Нет связи с сервером синхронизации.',
  server: 'Сервер ответил ошибкой. Попробуй позже — прогресс на месте.',
  corrupt: 'На сервере лежит что-то нечитаемое. Синхронизация остановлена, чтобы не затереть прогресс.',
  conflict: 'Второе устройство пишет прямо сейчас. Попробуй ещё раз.',
};

const stamp = ts => new Date(ts).toLocaleString('ru-RU', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

const status = () => store.sync.syncedAt
  ? `Синхронизировано: ${stamp(store.sync.syncedAt)}`
  : 'Ещё ни разу не синхронизировано.';

export function syncCard() {
  const key = store.sync.key || '';
  return `
    <div class="card sync-card">
      <div class="card-head"><span>Синхронизация с сайтом</span></div>
      <p class="muted">Один ключ на телефон и сайт: создай его здесь и введи на
      ccna.maks.top (Прогресс → Синхронизация) — после этого попытки, повторения и
      закладки будут сходиться сами. Ключ и есть доступ к прогрессу: храни его как
      пароль, аккаунта у сервера нет.</p>
      <input class="sync-key" type="text" inputmode="latin" autocomplete="off"
             autocapitalize="none" autocorrect="off" spellcheck="false"
             placeholder="ключ синхронизации" value="${key.replace(/"/g, '&quot;')}">
      <div class="backup-actions">
        <button class="btn" data-act="sync" type="button">Синхронизировать</button>
        <button class="btn" data-act="newkey" type="button">Создать ключ</button>
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
    toast('Ключ создан. Введи его на сайте: Прогресс → Синхронизация.');
  });

  button?.addEventListener('click', async () => {
    const key = (input?.value || '').trim();
    if (!store.isSyncKey(key)) return toast(SYNC_ERR.key);
    if (key !== store.sync.key) store.setSync({ key, syncedAt: 0, rev: 0 });

    // The button is the only thing that says work is happening — a sync over a slow
    // connection is otherwise indistinguishable from a tap that missed.
    button.disabled = true;
    if (line) line.textContent = 'Синхронизирую…';
    try {
      // "Nothing to do" is only true when nothing moved in either direction — a sync
      // that brought the other device's work down writes nothing, and saying it matched
      // already would be saying the opposite of what just happened.
      const { wrote, pulled } = await store.syncNow();
      toast(wrote || pulled
        ? `Готово. Попыток в истории: ${store.attempts.length}`
        : 'Всё уже совпадает.');
      // The chart, the history and the weak topics above are someone else's now too.
      ctx.router.render();
    } catch (err) {
      if (line) line.textContent = status();
      toast(SYNC_ERR[err && err.code] || SYNC_ERR.server);
    } finally {
      button.disabled = false;
    }
  });
}
