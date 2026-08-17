// Keeps the screen on while an exam is running.
//
// The Screen Wake Lock API is built into the Android WebView, so this needs no plugin and
// no WAKE_LOCK permission — the WebView sets FLAG_KEEP_SCREEN_ON itself. It also works in
// the dev browser, which a Capacitor plugin would not.
//
// The lock is released by the system whenever the page is hidden, so it has to be
// re-acquired when the app comes back; that is what the visibilitychange handler is for.
let sentinel = null;
let wanted = false;

const supported = () => 'wakeLock' in navigator;

async function acquire() {
  if (!wanted || sentinel || !supported()) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch {
    // Denied (battery saver, no user gesture yet) — the exam still runs, the screen just
    // dims like any other app. Not worth bothering the user about.
    sentinel = null;
  }
}

export async function keepScreenOn() {
  wanted = true;
  await acquire();
}

export async function releaseScreen() {
  wanted = false;
  const held = sentinel;
  sentinel = null;
  try { await held?.release(); } catch { /* already gone */ }
}

export const screenIsHeld = () => sentinel !== null;

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') acquire();
});
