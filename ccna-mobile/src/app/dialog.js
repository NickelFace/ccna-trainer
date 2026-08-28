// In-app confirm. window.confirm() in a Capacitor WebView renders as
// «localhost говорит…», which looks like a browser leaking through the app — this is the
// same thing in the app's own palette.
//
// Resolves true for ok, false for cancel, and null when it was dismissed by tapping
// outside. Most callers only ask «yes?» and treat the last two alike, but a dialog whose
// both buttons do something needs to tell «chose the other one» from «asked to be left
// alone» — see tryFinish in the question screen.
import { esc } from './dom.js';
import { t } from './i18n.js';

// Every live dialog, so the app can take one down itself. The exam clock does not stop for
// a dialog: it can run out while «Остались вопросы без ответа» or «Выйти из экзамена?» is
// up, and the tap that lands afterwards would be acting on a session that is already
// scored and filed. See closeDialogs.
const openDialogs = new Set();

export function confirmDialog({ title, text, ok = t('common.yes'), cancel = t('common.cancel') }) {
  return new Promise(resolve => {
    const root = document.createElement('div');
    root.className = 'dialog-backdrop';
    root.innerHTML = `
      <div class="dialog" role="dialog" aria-modal="true">
        <div class="dialog-title">${esc(title)}</div>
        ${text ? `<p class="dialog-text">${esc(text)}</p>` : ''}
        <div class="dialog-actions">
          <button class="btn" data-act="cancel" type="button">${esc(cancel)}</button>
          <button class="btn primary" data-act="ok" type="button">${esc(ok)}</button>
        </div>
      </div>`;

    const close = answer => { openDialogs.delete(dismiss); root.remove(); resolve(answer); };
    const dismiss = () => close(null);
    openDialogs.add(dismiss);

    root.addEventListener('click', e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act) close(act === 'ok');
      else if (e.target === root) close(null);         // tap outside dismisses
    });
    document.getElementById('app').append(root);
  });
}

// Dismiss whatever is up, as if the user had tapped outside it. `null` is deliberately the
// same answer that gives, because every caller already reads it as «asked to be left
// alone» and does nothing — which is exactly right when the question underneath is gone.
export function closeDialogs() {
  for (const dismiss of [...openDialogs]) dismiss();
}
