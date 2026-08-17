// Bottom sheet — the review panel (screen 04) and the question grid behind ☰ both use it.
// Slides up in 240ms ease-out, as the spec asks; the backdrop dims what is underneath so
// the question stays readable but clearly inactive.

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

export function closeSheet() {
  if (!open) return;
  const { root, onClose } = open;
  open = null;
  root.remove();
  onClose?.();
}

export const sheetIsOpen = () => open !== null;
