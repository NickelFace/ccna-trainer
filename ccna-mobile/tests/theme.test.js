import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheme } from '../src/app/theme.js';
import { validTheme } from '../src/app/store.js';

// The whole point of resolveTheme being its own pure function: this is six cases, not a
// click path through applyTheme()/matchMedia. 'light' and 'dark' ignore what the OS says;
// only 'system' looks at it.
test('resolveTheme: pref wins over the OS unless pref is system', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('light', false), 'light');
  assert.equal(resolveTheme('dark', true), 'dark');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('system', true), 'light');
  assert.equal(resolveTheme('system', false), 'dark');
});

// Anything that isn't exactly 'light' or 'system' resolves dark — matching
// DEFAULT_PROFILE.theme, so a corrupt pref degrades to the same thing an unset one does.
test('resolveTheme: garbage falls back to dark, same as an unset pref', () => {
  for (const junk of [undefined, null, 'Light', 'auto', 42, '']) {
    assert.equal(resolveTheme(junk, true), 'dark', `junk: ${JSON.stringify(junk)}`);
    assert.equal(resolveTheme(junk, false), 'dark', `junk: ${JSON.stringify(junk)}`);
  }
});

test('validTheme: the three real values pass', () => {
  assert.equal(validTheme('light'), true);
  assert.equal(validTheme('dark'), true);
  assert.equal(validTheme('system'), true);
});

test('validTheme: garbage from a backup or an older build does not', () => {
  for (const junk of [undefined, null, 'Light', 'sepia', 42, '', {}, []]) {
    assert.equal(validTheme(junk), false, `junk: ${JSON.stringify(junk)}`);
  }
});
