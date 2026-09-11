// Command output: the double-tap that opens it full screen, and the full-screen viewer
// itself. The block in the page flow is plain markup (see cliMarkup); everything here is
// the interaction around it.
//
// Two things this has to get right on a phone:
//   • The horizontal scroll of a `show ip route` must not become a question swipe. That
//     is not fixed here but in bindSwipe, which refuses to start a gesture that began
//     inside .cli-wrap — the swipe is measured between touchstart and touchend, so
//     stopping the *start* is the only thing that helps; stopPropagation on touchmove is
//     too late.
//   • ondblclick does not fire reliably in a WebView, so the taps are counted by hand.

import { esc } from './dom.js';
import { t } from './i18n.js';

const TAP_MS = 300;      // two taps further apart than this are two single taps
const TAP_PX = 30;       // ...and further apart than this are two taps on different things

let viewer = null;

export const cliZoomOpen = () => viewer !== null;

// Full screen, and nothing behind it moves: `body` has `overflow: hidden` in this app and
// the scroller is #scroll, which the overlay covers whole — so there is no page scroll to
// lock and nothing to restore on the way out. `overscroll-behavior: contain` on .cli-full
// is what keeps the scroll from chaining out to #scroll once the output hits its edge.
export function openCliZoom(text) {
  closeCliZoom();

  const root = document.createElement('div');
  root.className = 'cli-zoom';
  root.innerHTML = `
    <div class="cli-zoom-bar">
      <span class="cli-zoom-title mono">${esc(t('question.cliTitle'))}</span>
      <button class="cli-zoom-close" type="button" aria-label="${esc(t('question.close'))}">✕</button>
    </div>
    <pre class="cli-full">${esc(text)}</pre>`;

  const onKey = e => { if (e.key === 'Escape') closeCliZoom(); };
  root.querySelector('.cli-zoom-close').addEventListener('click', closeCliZoom);
  document.addEventListener('keydown', onKey);
  document.getElementById('app').append(root);

  viewer = { root, onKey };
  return { close: closeCliZoom };
}

export function closeCliZoom() {
  if (!viewer) return;
  const { root, onKey } = viewer;
  viewer = null;
  root.remove();
  document.removeEventListener('keydown', onKey);
}

// Wire every .cli-wrap inside `node` — the question body and each row of the review list
// hand their whole subtree over at once, so the listeners are delegated.
export function wireCli(node) {
  let last = { at: 0, x: 0, y: 0 };
  let moved = false;

  const textOf = el => el.closest('.cli-wrap')?.querySelector('.cli')?.textContent ?? '';

  node.addEventListener('click', e => {
    const btn = e.target.closest('.cli-expand');
    if (btn) openCliZoom(textOf(btn));
  });

  node.addEventListener('touchstart', e => {
    if (e.target.closest('.cli')) moved = false;
  }, { passive: true });

  // A finger that travelled was scrolling the output, and the release that ends a scroll
  // must not be counted as the second tap of a pair.
  node.addEventListener('touchmove', () => { moved = true; }, { passive: true });

  // Not passive: the second tap is prevented so the WebView cannot also read it as its
  // own double-tap gesture.
  node.addEventListener('touchend', e => {
    const pre = e.target.closest('.cli');
    if (!pre || moved || e.changedTouches.length !== 1) return;

    const { clientX: x, clientY: y } = e.changedTouches[0];
    const at = e.timeStamp;
    if (at - last.at < TAP_MS && Math.hypot(x - last.x, y - last.y) < TAP_PX) {
      e.preventDefault();
      last = { at: 0, x: 0, y: 0 };
      openCliZoom(pre.textContent);
      return;
    }
    last = { at, x, y };
  }, { passive: false });

  // Desktop, and the only path a mouse has to the viewer besides the button.
  node.addEventListener('dblclick', e => {
    const pre = e.target.closest('.cli');
    if (pre) openCliZoom(pre.textContent);
  });
}
