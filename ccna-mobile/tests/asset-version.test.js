// The site has no build step, so a browser decides for itself which of these files it
// already has. `index.html` therefore stamps store.js with `?v=N` — but a stamp on the
// entry point alone is worse than none: the browser then loads a fresh store.js that
// imports `./shared/merge.js` from cache, and a new store paired with an old merge is
// exactly how a whole branch of progress disappears on the next sync. (It did, on a dev
// server, while the bookmark tombstones were being tested.)
//
// So every import of these modules — from store.js, between them, and from the Android
// app that bundles the same files — carries the same stamp, and this is what says so.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB = join(import.meta.dirname, '../../ccna-exam-simulator');
const APP = join(import.meta.dirname, '../src');

const jsFiles = dir => readdirSync(dir, { withFileTypes: true, recursive: true })
  .filter(e => e.isFile() && e.name.endsWith('.js'))
  .map(e => join(e.parentPath, e.name));

// `from './shared/x.js?v=13'` and the app's `from '../../../…/shared/x.js?v=13'`.
const IMPORT = /from '([^']*(?:shared\/[\w-]+|\.\/[\w-]+)\.js)(\?v=(\d+))?'/g;

const stampFromIndex = () => {
  const html = readFileSync(join(WEB, 'index.html'), 'utf8');
  const m = html.match(/assets\/js\/store\.js\?v=(\d+)/);
  assert.ok(m, 'index.html does not stamp store.js at all');
  return m[1];
};

test('every import of a shared module carries the same version as index.html', () => {
  const want = stampFromIndex();
  const bad = [];
  const files = [
    join(WEB, 'assets/js/store.js'),
    ...jsFiles(join(WEB, 'assets/js/shared')),
    ...jsFiles(APP),
  ];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const [, spec, , got] of src.matchAll(IMPORT)) {
      // Only the shared modules are served to a browser; an app-internal import is
      // bundled by esbuild and never fetched.
      const shared = spec.includes('shared/') || file.includes('/assets/js/');
      if (!shared) continue;
      if (got !== want) bad.push(`${file.replace(/.*CCNA-trainer\//, '')}: ${spec}${got ? `?v=${got}` : ' (no stamp)'}`);
    }
  }
  assert.deepEqual(bad, [], `these must all be ?v=${want}:\n${bad.join('\n')}`);
});

test('the version is bumped by hand, so it is worth seeing it in one place', () => {
  const html = readFileSync(join(WEB, 'index.html'), 'utf8');
  // app.js and styles.css have their own counters — they are plain <script>/<link> tags
  // and nothing imports them — but store.js's is the one the modules follow.
  assert.match(html, /assets\/js\/store\.js\?v=\d+/);
});
