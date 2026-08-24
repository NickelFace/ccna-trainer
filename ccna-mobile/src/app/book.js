// The chapter reader's markup lives in shared/ — the web trainer renders the same
// chapters and they have to come out identical. Only the click wiring is local.
export { inline, sectionMarkup, bodyMarkup } from '../../../ccna-exam-simulator/assets/js/shared/book.js?v=15';

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
