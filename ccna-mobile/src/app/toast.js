// Brief confirmation strip above the bottom panel. The web app swaps the button's own
// label for 1.5s, which loses the button's meaning while it is showing; the spec asks for
// a toast, and a toast does not disturb what the user was looking at.
let current = null;

export function toast(message, ms = 1800) {
  current?.remove();
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  document.getElementById('app').append(node);
  current = node;

  requestAnimationFrame(() => node.classList.add('in'));
  setTimeout(() => {
    node.classList.remove('in');
    // Let the fade finish before the node goes, but never leak it if the screen changed.
    setTimeout(() => { if (current === node) { node.remove(); current = null; } }, 200);
  }, ms);
}
