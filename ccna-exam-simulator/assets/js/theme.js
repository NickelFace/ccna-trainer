// Theme controller for the web trainer. Three choices — 'system' (default), 'light',
// 'dark' — persisted in localStorage.
//
// The pre-paint fallback is a tiny inline script in index.html that runs before this
// module loads (modules are deferred). Everything below wires up the interactive side:
// the setter for the Settings picker, and a live listener for the System option so a
// browser or OS theme flip retints the page without a reload.
//
// Exposed on window.Theme so app.js (a classic script) can talk to it.
'use strict';

const KEY = 'ccna_theme';
const VALID = new Set(['system', 'light', 'dark']);

let current = read();
let mql = null;
let onChange = null;
const subs = new Set();

function read() {
  try {
    const v = localStorage.getItem(KEY);
    return VALID.has(v) ? v : 'system';
  } catch { return 'system'; }
}

function resolve(choice) {
  if (choice === 'light' || choice === 'dark') return choice;
  if (typeof matchMedia !== 'function') return 'light';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  let m = document.querySelector('meta[name="theme-color"]');
  if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
  m.content = mode === 'dark' ? '#0E1319' : '#F7F9FB';
  subs.forEach(fn => { try { fn(mode); } catch { /* subscriber is on its own */ } });
}

function rebindSystem() {
  if (mql && onChange) {
    if (mql.removeEventListener) mql.removeEventListener('change', onChange);
    else if (mql.removeListener) mql.removeListener(onChange);
    mql = null; onChange = null;
  }
  if (current !== 'system' || typeof matchMedia !== 'function') return;
  mql = matchMedia('(prefers-color-scheme: dark)');
  onChange = () => apply(resolve('system'));
  if (mql.addEventListener) mql.addEventListener('change', onChange);
  else if (mql.addListener) mql.addListener(onChange);
}

function setTheme(choice) {
  if (!VALID.has(choice)) return;
  current = choice;
  try { localStorage.setItem(KEY, choice); } catch { /* soldier on */ }
  apply(resolve(current));
  rebindSystem();
}

function getTheme() { return current; }
function getResolvedTheme() { return resolve(current); }
function onThemeChange(fn) { subs.add(fn); return () => subs.delete(fn); }

// Boot: the inline pre-paint script has already set data-theme so nothing here is
// racing paint. This module upgrades that guess to the live listener when System is on.
apply(resolve(current));
rebindSystem();

window.Theme = { get: getTheme, resolved: getResolvedTheme, set: setTheme, subscribe: onThemeChange };
