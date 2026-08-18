#!/usr/bin/env node
// Pulls the question bank and exhibit images from the web app into dist/.
//
// ccna-exam-simulator/data + images/exhibits are the single source of truth: a fix
// made in build/*.py lands in the web app and in the APK from one place. dist/ is
// gitignored, so nothing here is ever committed twice.
import { cp, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBook, coverageReport, writeBook } from '../../ccna-book/build.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WEB = join(ROOT, '..', 'ccna-exam-simulator');
const BOOK = join(ROOT, '..', 'ccna-book');
const DIST = join(ROOT, 'dist');

// [source, destination] — images/topo is deliberately excluded: the bank references
// only images/exhibits/ (see exhibit() in the web app's app.js), topo/ is a legacy archive.
const ENTRIES = [
  ['data/questions.json', 'data/questions.json'],
  ['data/meta.json', 'data/meta.json'],
  ['images/exhibits', 'images/exhibits'],
];

// Copying 298 exhibits on every build wastes a second or two; compare size+mtime and
// skip what hasn't moved. `force: false` in cpSync can't do this per-file, hence filter.
const unchanged = async (src, dst) => {
  if (!existsSync(dst)) return false;
  const [a, b] = await Promise.all([stat(src), stat(dst)]);
  return a.size === b.size && a.mtimeMs <= b.mtimeMs;
};

if (!existsSync(WEB)) {
  console.error(`sync-data: ${WEB} not found — ccna-mobile expects to sit next to ccna-exam-simulator`);
  process.exit(1);
}

let copied = 0, skipped = 0;
for (const [from, to] of ENTRIES) {
  const src = join(WEB, from), dst = join(DIST, to);
  if (!existsSync(src)) {
    console.error(`sync-data: missing source ${src}`);
    process.exit(1);
  }
  if ((await stat(src)).isDirectory()) {
    await mkdir(dst, { recursive: true });
    for (const name of await readdir(src)) {
      const f = join(src, name), t = join(dst, name);
      if (await unchanged(f, t)) { skipped++; continue; }
      await cp(f, t);
      copied++;
    }
  } else {
    await mkdir(dirname(dst), { recursive: true });
    if (await unchanged(src, dst)) { skipped++; continue; }
    await cp(src, dst);
    copied++;
  }
}

console.log(`sync-data: ${copied} copied, ${skipped} up to date → dist/`);

// The textbook is Markdown in ccna-book/topics; it is compiled here rather than copied,
// so an edited chapter reaches the APK through the same one command as a fixed question.
// The build also binds every chapter to the bank questions it covers — a chapter list and
// a question bank that disagree would make the Теория tab lie about its coverage.
const book = await buildBook({});
await writeBook(join(DIST, 'data', 'theory'), book);
await writeFile(join(BOOK, 'coverage.md'), coverageReport(book) + '\n');
const chapters = book.index.topics.length;
console.log(`sync-data: ${chapters} chapters → dist/data/theory/`
  + ` (${book.stats.matched} questions matched, ${book.stats.fallback} to a domain catch-all`
  + (book.stats.orphan ? `, ${book.stats.orphan} WITHOUT A CHAPTER` : '') + ')');
