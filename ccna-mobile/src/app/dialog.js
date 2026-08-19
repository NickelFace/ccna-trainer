// In-app confirm. window.confirm() in a Capacitor WebView renders as
// «localhost говорит…», which looks like a browser leaking through the app — this is the
// same thing in the app's own palette.
//
// Resolves true for ok, false for cancel, and null when it was dismissed by tapping
// outside. Most callers only ask «yes?» and treat the last two alike, but a dialog whose
// both buttons do something needs to tell «chose the other one» from «asked to be left
// alone» — see tryFinish in the question screen.
import { esc } from './dom.js';

export function confirmDialog({ title, text, ok = 'Да', cancel = 'Отмена' }) {
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

    const close = answer => { root.remove(); resolve(answer); };
    root.addEventListener('click', e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act) close(act === 'ok');
      else if (e.target === root) close(null);         // tap outside dismisses
    });
    document.getElementById('app').append(root);
  });
}
