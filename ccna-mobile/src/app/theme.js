// Theme controller: three choices — 'system' (default), 'light', 'dark' — persisted in
// Capacitor Preferences so the picker sticks across restarts and app updates.
//
// The pre-paint helper (init) is called from index.html BEFORE anything renders so the
// first frame already has the right --bg / --text / etc. — a flash of the wrong theme
// on every launch is the whole reason this file exists rather than a two-liner in main.
//
// System-follow is a live listener: rotating the phone at dusk when Android's own theme
// flips must retint the app without a relaunch. explicit picks tear the listener down
// so the user's choice actually holds.
import { Preferences } from '@capacitor/preferences';

const KEY = 'theme';                                // one of 'system' | 'light' | 'dark'
const VALID = new Set(['system', 'light', 'dark']);

let current = 'system';                             // the user's saved choice
let mql = null;                                     // active matchMedia binding when following system
let onChange = null;                                // listener attached to mql, kept so we can drop it
const subs = new Set();                             // notify Settings screen of external changes

/** Resolve to 'light' or 'dark' — what to actually apply. */
function resolve(choice) {
  if (choice === 'light' || choice === 'dark') return choice;
  // System — read prefers-color-scheme. Default to 'dark' when the media query is
  // unavailable, matching the design's dark-first history.
  if (typeof matchMedia !== 'function') return 'dark';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Write data-theme on <html>. Setting it drives every :root[data-theme] rule and,
 *  because color-scheme lives on the same block, retints native form controls too. */
function apply(mode) {
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
  // The <meta name="theme-color"> tag colours the Android status bar area under
  // edge-to-edge. Follow the applied surface so it does not stay in the old theme
  // after a swap.
  let m = document.querySelector('meta[name="theme-color"]');
  if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
  m.content = mode === 'dark' ? '#0E1319' : '#F7F9FB';
  subs.forEach(fn => { try { fn(mode); } catch { /* subscriber is on its own */ } });
}

/** Attach or detach the prefers-color-scheme listener based on current choice. */
function rebindSystem() {
  if (mql && onChange) {
    // matchMedia listeners survive across bind cycles if we don't drop them, so a
    // toggle from System → Light → System would fire twice on the next flip.
    if (mql.removeEventListener) mql.removeEventListener('change', onChange);
    else if (mql.removeListener) mql.removeListener(onChange);        // Safari <14
    mql = null; onChange = null;
  }
  if (current !== 'system' || typeof matchMedia !== 'function') return;
  mql = matchMedia('(prefers-color-scheme: dark)');
  onChange = () => apply(resolve('system'));
  if (mql.addEventListener) mql.addEventListener('change', onChange);
  else if (mql.addListener) mql.addListener(onChange);                // Safari <14
}

/** Read the saved choice and apply it. Called from init(); no-op after that.
 *  Kept async so we can await Preferences, which is real IPC on Android. */
async function loadAndApply() {
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (value && VALID.has(value)) current = value;
  } catch { /* first launch, or Preferences unavailable — the default holds */ }
  // Mirror to localStorage so the pre-paint guard on the next launch has the choice
  // available without waiting on Preferences.
  try { localStorage.setItem('ccna_theme', current); } catch { /* private WebView */ }
  apply(resolve(current));
  rebindSystem();
}

/** Kick things off. Idempotent — calling twice will not double-bind the system listener
 *  because rebindSystem() drops the old one first. */
export function initTheme() {
  return loadAndApply();
}

/** The picker in Settings calls this. Persists and re-applies in one step.
 *  Also mirrors to localStorage so the pre-paint script in index.html can find the
 *  choice on the next launch without an async Preferences round-trip — the app opens
 *  in the right theme immediately rather than after boot() resolves. */
export async function setTheme(choice) {
  if (!VALID.has(choice)) return;
  current = choice;
  try { await Preferences.set({ key: KEY, value: choice }); } catch { /* soldier on */ }
  try { localStorage.setItem('ccna_theme', choice); } catch { /* private WebView */ }
  apply(resolve(current));
  rebindSystem();
}

/** Which of the three the user picked (for painting the Settings segmented control). */
export function getTheme() { return current; }

/** What is actually on screen right now — 'light' or 'dark'. */
export function getResolvedTheme() { return resolve(current); }

/** Subscribe to theme changes — used by any UI that mirrors the choice (Settings). */
export function onThemeChange(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
