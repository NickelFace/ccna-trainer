#!/usr/bin/env node
// The other half of the `?v=N` promise.
//
// tests/asset-version.test.js already insists that every import of a shared module names
// the same stamp as index.html. What it cannot know is whether that stamp should have
// moved: the files agree with each other perfectly well after an edit that nobody bumped
// for, and the browser then pairs a fresh store.js with a shared module it still has in
// cache. That has now happened twice — once losing a whole branch of progress through a
// stale merge.js, once quietly dropping the textbook link because a cached store.js had no
// sectionOf on it — and both times every test was green.
//
// So the content gets a fingerprint, committed beside the stamp it belongs to. Change the
// code without moving the stamp and the fingerprint no longer matches, which is the one
// thing a test can check.
//
//   npm run assets:lock            record the current state (after a deliberate bump)
//   npm run assets:lock -- --bump  move every stamp to the next number, then record
//
// The lock is not shipped and not bundled — it lives beside the test that reads it.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));      // ccna-mobile/
const REPO = join(ROOT, '..');
const WEB = join(REPO, 'ccna-exam-simulator');

export const LOCK = join(ROOT, 'tests', 'asset-version.lock.json');

// What the store's stamp actually governs: the entry point the browser fetches, and the
// modules it imports. app.js and styles.css carry their own counters — nothing imports
// them, so they cannot be paired with a stale anything.
const jsUnder = dir => readdirSync(dir, { withFileTypes: true, recursive: true })
  .filter(e => e.isFile() && e.name.endsWith('.js'))
  .map(e => join(e.parentPath, e.name));

const governed = () => [
  join(WEB, 'assets/js/store.js'),
  ...jsUnder(join(WEB, 'assets/js/shared')),
].sort();

// Stamps are stripped before hashing, so the fingerprint describes the code and not the
// number written in front of it. A bump on its own therefore leaves every hash alone, and
// a mismatch always means the code moved.
const STAMPED = /\.js\?v=\d+/g;
const fingerprint = src =>
  createHash('sha256').update(src.replace(STAMPED, '.js')).digest('hex').slice(0, 16);

export function stampFromIndex() {
  const html = readFileSync(join(WEB, 'index.html'), 'utf8');
  const m = html.match(/assets\/js\/store\.js\?v=(\d+)/);
  if (!m) throw new Error('index.html does not stamp store.js at all');
  return m[1];
}

export function currentLock() {
  const files = {};
  for (const file of governed()) {
    files[relative(REPO, file)] = fingerprint(readFileSync(file, 'utf8'));
  }
  return { version: stampFromIndex(), files };
}

export const readLock = () => JSON.parse(readFileSync(LOCK, 'utf8'));

// Which files stopped matching, named — "something under shared/ changed" is a worse
// answer than a list, and the list is what says whether the change was deliberate.
export function driftedFiles(locked, now) {
  const names = new Set([...Object.keys(locked.files || {}), ...Object.keys(now.files)]);
  return [...names].sort().flatMap(name => {
    const was = (locked.files || {})[name], is = now.files[name];
    if (was === is) return [];
    return [`${name}: ${!was ? 'new file' : !is ? 'removed' : 'changed'}`];
  });
}

// ---------------------------------------------------------------- writing

const writeLock = lock => {
  writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`);
  return lock;
};

// Every place the stamp is written: index.html's script tag, and every import of a shared
// module — from store.js, between the modules, from the app that bundles them, and from
// the tests that import them directly. Doing this by hand across twenty files is the step
// that gets forgotten, which is the whole reason this exists.
//
// Anchored on `from '` so it only ever rewrites an import specifier. A stamp-shaped string
// anywhere else is prose — a comment illustrating the convention, most likely — and
// renumbering that on every bump is noise in the diff at best.
const IMPORT_STAMP = /(from '[^']*(?:shared\/[\w-]+|\.\/[\w-]+)\.js)\?v=\d+/g;

function bumpTo(next) {
  const touched = [];
  const rewrite = (file, re, replacement) => {
    const src = readFileSync(file, 'utf8');
    const out = src.replace(re, replacement);
    if (out === src) return;
    writeFileSync(file, out);
    touched.push(relative(REPO, file));
  };

  rewrite(join(WEB, 'index.html'),
    /(assets\/js\/store\.js)\?v=\d+/g, `$1?v=${next}`);

  const sources = [
    join(WEB, 'assets/js/store.js'),
    ...jsUnder(join(WEB, 'assets/js/shared')),
    ...jsUnder(join(ROOT, 'src')),
    ...jsUnder(join(ROOT, 'tests')),
  ];
  for (const file of sources) rewrite(file, IMPORT_STAMP, `$1?v=${next}`);
  return touched;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const bump = args.includes('--bump');
  const asked = args[args.indexOf('--bump') + 1];
  const explicit = bump && /^\d+$/.test(asked || '') ? asked : null;

  if (bump) {
    const next = explicit || String(Number(stampFromIndex()) + 1);
    const touched = bumpTo(next);
    console.log(`stamp → ?v=${next}  (${touched.length} file${touched.length === 1 ? '' : 's'})`);
    for (const f of touched) console.log(`  ${f}`);
  }

  let before = null;
  try { before = readLock(); } catch { /* first run, or a lock nobody committed yet */ }
  const now = writeLock(currentLock());
  const moved = before ? driftedFiles(before, now) : [];
  console.log(`locked ?v=${now.version} over ${Object.keys(now.files).length} files`);
  for (const line of moved) console.log(`  ${line}`);
  if (!bump && before && moved.length && before.version === now.version) {
    console.log('\nnote: content moved but the stamp did not — was a bump meant here?');
  }
}
