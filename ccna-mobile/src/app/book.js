// The chapter reader's markup lives in shared/ — the web trainer renders the same
// chapters and they have to come out identical. Only the click wiring and the locale pass-
// through are local.
import { bodyMarkup as sharedBodyMarkup } from '../../../ccna-exam-simulator/assets/js/shared/book.js?v=22';
import { getLang } from './i18n.js';

export { inline, sectionMarkup } from '../../../ccna-exam-simulator/assets/js/shared/book.js?v=22';

// The chapter body itself (headings, paragraphs, tables, self-checks) is already in
// whichever language its JSON was compiled for — see ccna-book/build.mjs's `en` tree and
// theory.js's locale-aware loadTopic/loadIndex. Only the note-kind labels ("Запомнить" /
// "Remember" etc.) are chrome the renderer adds, so that is the one thing this needs to
// pass the current language through for.
export const bodyMarkup = topic => sharedBodyMarkup(topic, getLang());

// Self-check answers reveal on tap. Delegated from the screen root so re-renders don't
// have to rebind anything.
export function bindChecks(node) {
  node.addEventListener('click', e => {
    const head = e.target.closest('[data-check]');
    if (!head || !node.contains(head)) return;
    const open = head.getAttribute('aria-expanded') === 'true';
    head.setAttribute('aria-expanded', String(!open));
    head.nextElementSibling.hidden = open;
  });
}
