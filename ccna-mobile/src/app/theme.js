// Light, dark, or the OS's own choice.
//
// The theme lives in the profile as 'light' | 'dark' | 'system', but the CSS only ever
// has to know one of two things: tokens.css declares a plain :root (dark) and a
// [data-theme="light"] override, nothing keyed to a media query. 'system' is resolved
// to one of those two right here, so the stylesheet never has to ask the OS itself.
import { store } from './store.js';

const lightQuery = () => window.matchMedia('(prefers-color-scheme: light)');

// Pure and exported on its own so the six pref×OS combinations are a table, not a click
// path — see tests/theme.test.js.
export const resolveTheme = (pref, prefersLight) =>
  pref === 'system' ? (prefersLight ? 'light' : 'dark') : (pref === 'light' ? 'light' : 'dark');

// Sets the one attribute tokens.css reads. No matching `style.colorScheme` write: the
// CSS already declares `color-scheme` inside :root and [data-theme="light"], and that
// declaration takes effect the moment the attribute does — a second, JS-driven copy of
// the same value would just be two places for it to go out of sync.
export function applyTheme(pref = store.profile.theme) {
  const mode = resolveTheme(pref, lightQuery().matches);
  document.documentElement.dataset.theme = mode;
  syncSystemBars(mode);
  return mode;
}

// The status bar and nav bar icons are drawn by Android, not the WebView, so a light
// page with light (invisible-on-white) icons needs telling separately. Capacitor's own
// Style is the inverse of the app's theme name: Style.Dark asks for dark icons, which is
// what a *light* page needs; Style.Light is white icons, for a dark one. Web has no
// native chrome to recolour, hence the platform guard.
async function syncSystemBars(mode) {
  if (!window.Capacitor?.isNativePlatform?.()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: mode === 'light' ? Style.Dark : Style.Light });
  } catch (err) {
    // Never worth failing boot over a status-bar colour.
    console.warn('theme: could not set the status-bar style:', err.message);
  }
}

// While the pref is 'system' the OS can change underneath a running app (a scheduled
// dark-mode switch, a quick-settings toggle) — this is what makes that repaint live
// instead of waiting for the next launch. Bound once, from main.js's boot().
export function bindSystemTheme() {
  lightQuery().addEventListener('change', () => {
    if (store.profile.theme === 'system') applyTheme();
  });
}
