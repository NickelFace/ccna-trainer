// Full-screen exhibit viewer with pinch zoom, pan and double-tap zoom.
//
// The web app has no zoom at all — on a phone a routing table cropped out of a PDF is
// unreadable, and routing tables are half of what the exhibits are. Page zoom is off
// (user-scalable=no keeps the app chrome from stretching), so the gesture lives here.
//
// Two things learned on the device and worth keeping written down:
//   • setPointerCapture retargets the click that follows, so `event.target === stage` is
//     not a reliable "did they tap the backdrop" test — it reported the backdrop for taps
//     that clearly landed on the image, and the first tap closed the viewer every time.
//     The hit test is geometric instead.
//   • Zooming toward the centre is nearly useless for reading an address in a corner;
//     the double tap zooms toward the point that was tapped.

const MIN = 1, MAX = 5;
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_SCALE = 2.5;

export function openExhibit(src, alt = '') {
  const root = document.createElement('div');
  root.className = 'exhibit-viewer';
  root.innerHTML = `
    <button class="exhibit-close" type="button" aria-label="Закрыть">✕</button>
    <div class="exhibit-stage"><img src="${src}" alt="${alt}" draggable="false"></div>
    <div class="exhibit-hint">двойной тап — приблизить · щипок — точнее</div>`;

  const stage = root.querySelector('.exhibit-stage');
  const img = root.querySelector('img');

  let scale = 1, tx = 0, ty = 0;
  const pointers = new Map();
  let startDist = 0, startScale = 1, startTx = 0, startTy = 0, startMid = null;
  let lastTap = 0, tapTimer = null;

  // `eased` is for the jumps the fingers are not driving — double-tap zoom and the settle
  // back to fit. A live pinch or pan must stay at 1:1 with the fingers, so it passes false.
  const apply = (eased = false) => {
    // Pan is bounded by how much bigger than the stage the image currently is, so it can
    // never be dragged off screen entirely.
    const maxX = Math.max(0, (stage.clientWidth * scale - stage.clientWidth) / 2);
    const maxY = Math.max(0, (stage.clientHeight * scale - stage.clientHeight) / 2);
    tx = Math.min(maxX, Math.max(-maxX, tx));
    ty = Math.min(maxY, Math.max(-maxY, ty));
    img.style.transition = eased ? 'transform 220ms cubic-bezier(.22,.9,.3,1)' : 'none';
    img.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
    root.classList.toggle('zoomed', scale > 1.01);
  };

  // Is this screen point on the picture itself, rather than the black around it?
  const hitsImage = (x, y) => {
    const r = img.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  // Scale about a point: keep whatever is under the finger under the finger.
  const zoomTo = (next, clientX, clientY) => {
    const box = stage.getBoundingClientRect();
    const px = clientX - (box.left + box.width / 2);
    const py = clientY - (box.top + box.height / 2);
    const ratio = next / scale;
    tx = px - (px - tx) * ratio;
    ty = py - (py - ty) * ratio;
    scale = next;
    apply(true);
  };

  const dist = ([a, b]) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = ([a, b]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  stage.addEventListener('pointerdown', e => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.values()];
    if (pts.length === 2) {
      startDist = dist(pts);
      startMid = mid(pts);
      startScale = scale; startTx = tx; startTy = ty;
    } else if (pts.length === 1) {
      startTx = tx; startTy = ty; startMid = { x: e.clientX, y: e.clientY };
    }
  });

  stage.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.values()];
    if (pts.length === 2) {
      scale = Math.min(MAX, Math.max(MIN, startScale * (dist(pts) / startDist)));
      const m = mid(pts);
      tx = startTx + (m.x - startMid.x);
      ty = startTy + (m.y - startMid.y);
      apply();
    } else if (pts.length === 1 && scale > 1.01) {
      tx = startTx + (e.clientX - startMid.x);
      ty = startTy + (e.clientY - startMid.y);
      apply();
    }
  });

  const release = e => {
    pointers.delete(e.pointerId);
    // Settle back to a clean fit once the fingers are off and nothing is zoomed in.
    if (pointers.size === 0 && scale <= 1.01) { scale = 1; tx = 0; ty = 0; apply(true); }
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  stage.addEventListener('click', e => {
    const now = Date.now();
    const onImage = hitsImage(e.clientX, e.clientY);

    if (now - lastTap < DOUBLE_TAP_MS) {
      clearTimeout(tapTimer);
      lastTap = 0;
      if (onImage) {
        if (scale > 1.01) { scale = 1; tx = 0; ty = 0; apply(true); }
        else zoomTo(DOUBLE_TAP_SCALE, e.clientX, e.clientY);
      }
      return;
    }
    lastTap = now;

    // A tap on the black around the picture dismisses, the way every photo viewer does —
    // but only at fit size, so a stray tap while reading a zoomed corner does not throw
    // the whole thing away.
    if (!onImage && scale <= 1.01) {
      tapTimer = setTimeout(close, DOUBLE_TAP_MS);
    }
  });

  const close = () => {
    clearTimeout(tapTimer);
    root.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  root.querySelector('.exhibit-close').addEventListener('click', close);
  document.addEventListener('keydown', onKey);

  document.getElementById('app').append(root);
  return { close };
}
