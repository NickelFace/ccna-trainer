// Bottom sheet — the review panel (screen 04) and the question grid behind ☰ both use it.
// Slides up in 500ms ease-out; the backdrop dims what is underneath so the question stays
// readable but clearly inactive.

const EXIT_MS = 500;                       // must match .sheet's transition in screens.css

let open = null;

export function openSheet(content, { onClose = null, dimBehind = true } = {}) {
  closeSheet();

  const root = document.createElement('div');
  root.className = 'sheet-backdrop' + (dimBehind ? ' dim' : '');
  const panel = document.createElement('div');
  panel.className = 'sheet';
  panel.innerHTML = '<div class="sheet-handle"></div>';
  panel.append(content);
  root.append(panel);

  root.addEventListener('click', e => { if (e.target === root) closeSheet(); });
  document.getElementById('app').append(root);

  // One frame on the closed transform, then flip — otherwise the browser collapses both
  // styles into one paint and nothing animates.
  requestAnimationFrame(() => root.classList.add('in'));

  open = { root, onClose };
  return { close: closeSheet, panel };
}

// Closing runs the same 500ms in reverse. The node is detached only when the slide is
// done, and stops taking taps immediately so nothing lands on a sheet that is leaving.
export function closeSheet() {
  if (!open) return;
  const { root, onClose } = open;
  open = null;
  root.classList.remove('in');
  root.style.pointerEvents = 'none';
  const drop = () => root.remove();
  root.addEventListener('transitionend', drop, { once: true });
  setTimeout(drop, EXIT_MS + 60);          // transitionend never fires under reduced motion
  onClose?.();
}

export const sheetIsOpen = () => open !== null;
