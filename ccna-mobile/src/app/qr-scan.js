// Reading the sync key off a QR code with the phone's camera.
//
// No plugin and no library: Android's WebView is Chromium, which brings both halves —
// getUserMedia for the camera and BarcodeDetector for the decoding. That keeps the APK the
// same size it was and adds no native dependency, at the cost of a capability that can
// simply be absent. Everything here is written around that: `canScan()` is asked first,
// the button does not appear when the answer is no, and typing the key stays the path that
// always works.
import { toast } from './toast.js';

const Detector = globalThis.BarcodeDetector;

export const canScan = () =>
  !!Detector && !!navigator.mediaDevices?.getUserMedia;

// Opens the camera over the app and resolves with the first QR code that satisfies
// `accept`, or null if the user backed out or the camera refused. Never throws: a scanner
// that cannot open is a scanner the user types past.
export function scanQr({ accept = () => true, hint = '' } = {}) {
  if (!canScan()) return Promise.resolve(null);

  return new Promise(resolve => {
    const root = document.createElement('div');
    root.className = 'scan-backdrop';
    root.innerHTML = `
      <div class="scan" role="dialog" aria-modal="true">
        <video class="scan-view" playsinline muted></video>
        <div class="scan-frame"></div>
        ${hint ? `<p class="scan-hint">${hint}</p>` : ''}
        <button class="btn" data-act="cancel" type="button">Отмена</button>
      </div>`;

    const video = root.querySelector('.scan-view');
    let stream = null;
    let timer = null;
    let done = false;

    const close = value => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // Letting the camera keep running behind a removed element leaves the indicator lit
      // and the sensor warm — both of which read as the app spying.
      stream?.getTracks().forEach(track => track.stop());
      root.remove();
      resolve(value);
    };

    root.addEventListener('click', e => {
      if (e.target.closest('[data-act="cancel"]') || e.target === root) close(null);
    });
    document.getElementById('app').append(root);

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },   // the back camera, where a QR is pointed
          audio: false,
        });
        if (done) { stream.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = stream;
        await video.play();
      } catch {
        // Refused, taken by another app, or no camera behind the capability check.
        toast('Камера недоступна — введи ключ вручную.');
        return close(null);
      }

      const detector = new Detector({ formats: ['qr_code'] });
      const look = async () => {
        if (done) return;
        try {
          for (const code of await detector.detect(video)) {
            const value = (code.rawValue || '').trim();
            if (accept(value)) return close(value);
          }
        } catch {
          // A frame the detector could not handle; the next one is 200 ms away.
        }
        timer = setTimeout(look, 200);
      };
      look();
    })();
  });
}
