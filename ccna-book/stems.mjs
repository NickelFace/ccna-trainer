#!/usr/bin/env node
// Writing aid, not part of the build: print what the bank actually asks about a topic, so
// a chapter is written against the real question shapes instead of a guess at them.
//
//   node ccna-book/stems.mjs "ospf" --dom IPC --n 40      # stems matching a pattern
//   node ccna-book/stems.mjs --unmapped                   # what the fallback chapters caught
//   node ccna-book/stems.mjs --topic ipc-04-ospf --full   # everything bound to one chapter
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, buildBook } from './build.mjs';

const args = process.argv.slice(2);
const flag = (name, def = null) => args.includes(name) ? args[args.indexOf(name) + 1] : def;
const has = name => args.includes(name);
const pattern = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') !== true);

const questions = JSON.parse(await readFile(join(ROOT, '..', 'ccna-exam-simulator', 'data', 'questions.json'), 'utf8'));
const limit = Number(flag('--n', 40));
const full = has('--full');

let pool = questions;
if (has('--topic') || has('--unmapped')) {
  const book = await buildBook({});
  const id = flag('--topic');
  pool = questions.filter(q => has('--unmapped')
    ? book.map[q.n] && book.topics.find(t => t.id === book.map[q.n])?.fallback
    : book.map[q.n] === id);
}
if (flag('--dom')) pool = pool.filter(q => q.dom === flag('--dom'));
if (pattern) {
  const re = new RegExp(pattern, 'i');
  pool = pool.filter(q => re.test(`${q.t} ${Object.values(q.o || {}).join(' ')} ${q.cli || ''}`));
}

console.log(`${pool.length} questions${pattern ? ` matching /${pattern}/i` : ''}\n`);
for (const q of pool.slice(0, limit)) {
  console.log(`#${q.n} [${q.dom}/${q.tp}${q.y === 'dd' ? '/dd' : ''}] ${q.t.replace(/\s+/g, ' ').slice(0, full ? 600 : 190)}`);
  if (full && q.o) console.log(Object.entries(q.o).map(([k, v]) => `    ${k}) ${v}`).join('\n'), `\n    → ${q.a}`);
}
