#!/usr/bin/env node
// Copies the static web app into www/ — a clean staging dir for Capacitor.
// www/ is gitignored and regenerated (locally or in CI) before `cap sync`/`cap copy`,
// so the source of truth stays index.html/assets/data/images at the project root.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
// images/topo (unused legacy SVGs) and images/exhibits_backup are deliberately
// left out — app.js only ever reads images/exhibits/, see IMG() in assets/js/app.js.
const ENTRIES = ['index.html', 'assets', 'data', 'images/exhibits'];

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });

for (const entry of ENTRIES) {
  fs.cpSync(path.join(ROOT, entry), path.join(WWW, entry), { recursive: true });
}

console.log(`www/ synced (${ENTRIES.join(', ')})`);
