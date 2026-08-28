import test from 'node:test';
import assert from 'node:assert/strict';

// setLang() persists through store.patchProfile()/store.flush(), which lands in Capacitor
// Preferences — that falls back to window.localStorage off-device, same as every other
// store-touching test (see tests/answer.test.js).
globalThis.window = {
  localStorage: {
    _m: new Map(),
    getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
    setItem(k, v) { this._m.set(k, String(v)); },
    removeItem(k) { this._m.delete(k); },
  },
};

const { t, getLang, setLang, initLang, pluralWord, WORDS } = await import('../src/app/i18n.js');
const { store } = await import('../src/app/store.js');

test.afterEach(() => initLang('ru'));

test('defaults to Russian', () => {
  initLang('ru');
  assert.equal(getLang(), 'ru');
  assert.equal(t('common.cancel'), 'Отмена');
});

test('setLang switches the active language and t() follows', async () => {
  setLang('en');
  assert.equal(getLang(), 'en');
  assert.equal(t('common.cancel'), 'Cancel');
  setLang('ru');
  assert.equal(t('common.cancel'), 'Отмена');
  await store.flush();
});

test('setLang persists into store.profile.lang', async () => {
  setLang('en');
  assert.equal(store.profile.lang, 'en');
  setLang('ru');
  assert.equal(store.profile.lang, 'ru');
  await store.flush();
});

test('setLang treats anything other than exactly "en" as Russian', async () => {
  setLang('en');
  setLang('fr');
  assert.equal(getLang(), 'ru');   // no third language exists yet — unrecognised input is not English
  await store.flush();
});

test('initLang adopts a stored profile language without side effects', () => {
  initLang('en');
  assert.equal(getLang(), 'en');
  initLang('garbage');
  assert.equal(getLang(), 'ru');   // anything but exactly 'en' is Russian
});

test('placeholders are substituted', () => {
  initLang('en');
  assert.equal(t('home.stats.total').includes('{'), false);
  assert.equal(t('home.plan.today', { today: 3, goal: 10 }), "Today's plan · 3 of 10");
});

test('a missing key falls back to the key itself rather than throwing', () => {
  assert.equal(t('nonexistent.key.xyz'), 'nonexistent.key.xyz');
});

test('pluralWord picks the Russian three-way form', () => {
  initLang('ru');
  assert.equal(pluralWord(1, WORDS.days), 'день');
  assert.equal(pluralWord(2, WORDS.days), 'дня');
  assert.equal(pluralWord(5, WORDS.days), 'дней');
  assert.equal(pluralWord(11, WORDS.days), 'дней');   // the -надцать exception
  assert.equal(pluralWord(21, WORDS.days), 'день');
});

test('pluralWord picks the English two-way form', () => {
  initLang('en');
  assert.equal(pluralWord(1, WORDS.days), 'day');
  assert.equal(pluralWord(0, WORDS.days), 'days');
  assert.equal(pluralWord(5, WORDS.days), 'days');
});

test('every Russian string has an English translation and vice versa', async () => {
  const mod = await import('../src/app/i18n.js');
  // Re-import the internal table indirectly via t()/pluralWord is not enough to enumerate
  // keys, so this test walks the exported default table instead.
  const STRINGS = mod.default;
  const missing = [];
  for (const [key, row] of Object.entries(STRINGS)) {
    if (!row.ru) missing.push(`${key}: no ru`);
    if (!row.en) missing.push(`${key}: no en`);
  }
  assert.deepEqual(missing, []);
});

test('no English string is a byte-for-byte copy of a Russian one', async () => {
  // Catches an entry that was added and never actually translated — a coarse check, not a
  // quality gate. Placeholder names ({mistakes}, {days}, ...) are stripped before looking
  // for a real word, since matching inside the braces themselves is not a translation gap.
  // A short explicit allow-list covers language endonyms shown the same way in both UIs
  // ("English" reads as "English" whether the surrounding chrome is Russian or English).
  const ALLOW = new Set(['onboarding.lang.en', 'profile.language.en']);
  const mod = await import('../src/app/i18n.js');
  const STRINGS = mod.default;
  const suspicious = [];
  for (const [key, row] of Object.entries(STRINGS)) {
    if (ALLOW.has(key)) continue;
    const bare = row.ru.replace(/\{\w+\}/g, '');
    if (row.ru === row.en && /[a-zA-Zа-яА-ЯёЁ]{3,}/.test(bare)) suspicious.push(key);
  }
  assert.deepEqual(suspicious, []);
});
