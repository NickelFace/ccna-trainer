#!/usr/bin/env node
// src/ -> dist/ with esbuild. One JS bundle, one CSS bundle, static files copied.
//
// No framework and no CDN by design: the app must run with the device offline, so every
// byte it loads ships inside the APK. dist/data and dist/images come from sync-data.mjs
// and are left untouched here.
import * as esbuild from 'esbuild';
import { cp, mkdir, rm, watch } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

const args = process.argv.slice(2);
const isWatch = args.includes('--watch');
const serveAt = args.includes('--serve') ? Number(args[args.indexOf('--serve') + 1]) : 0;

async function copyStatic() {
  await mkdir(DIST, { recursive: true });
  await cp(join(SRC, 'index.html'), join(DIST, 'index.html'));
  await rm(join(DIST, 'assets'), { recursive: true, force: true });
  await cp(join(SRC, 'assets'), join(DIST, 'assets'), { recursive: true });
}

const staticCopy = {
  name: 'static-copy',
  setup: build => build.onEnd(result => {
    if (!result.errors.length) return copyStatic();
  }),
};

const options = {
  entryPoints: [join(SRC, 'app', 'main.js'), join(SRC, 'styles', 'main.css')],
  outdir: DIST,
  entryNames: 'app',
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  // Fonts are copied verbatim by copyStatic(); leave the url() references alone so the
  // paths in CSS keep matching what ships in dist/assets/fonts.
  external: ['*.woff2'],
  minify: !isWatch,
  // Inline, not a sidecar .map: a watching dev server would otherwise keep dropping
  // app.js.map into dist/, and `cap sync` copies whatever is in dist/ into the APK.
  sourcemap: isWatch ? 'inline' : false,
  logLevel: 'info',
  plugins: [staticCopy],
};

if (isWatch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  // esbuild only rebuilds on graph changes; index.html isn't in the graph.
  (async () => {
    for await (const _ of watch(join(SRC, 'index.html'))) await copyStatic();
  })().catch(() => {});
  if (serveAt) {
    const { host, port } = await ctx.serve({ servedir: DIST, port: serveAt });
    console.log(`dev server: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    if (!existsSync(join(DIST, 'data', 'questions.json'))) {
      console.warn('warning: dist/data is empty — run `npm run sync-data` first');
    }
  }
} else {
  await esbuild.build(options);
  // A previous `npm run dev` leaves sourcemaps in dist/, and `cap sync` copies whatever
  // is there straight into the APK. Production builds sweep them out.
  await Promise.all(['app.js.map', 'app.css.map'].map(f => rm(join(DIST, f), { force: true })));
}
