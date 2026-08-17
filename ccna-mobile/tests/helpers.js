// Shared test fixtures. The domain weights are the real Cisco blueprint ones from
// data/meta.json — the selection tests are meaningless with made-up weights.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const WEB_DATA = join(HERE, '..', '..', 'ccna-exam-simulator', 'data');

export const loadBank = () => ({
  questions: JSON.parse(readFileSync(join(WEB_DATA, 'questions.json'), 'utf8')),
  meta: JSON.parse(readFileSync(join(WEB_DATA, 'meta.json'), 'utf8')),
});

export const DOMAINS = [
  { id: 'NF', weight: 0.2 },
  { id: 'NA', weight: 0.2 },
  { id: 'IPC', weight: 0.25 },
  { id: 'IPS', weight: 0.1 },
  { id: 'SEC', weight: 0.15 },
  { id: 'AUT', weight: 0.1 },
];

// mulberry32 — small, seedable, good enough to make shuffles reproducible in tests.
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// n questions per domain, numbered so they stay identifiable after a shuffle.
export const pool = perDomain => DOMAINS.flatMap((d, di) =>
  Array.from({ length: perDomain }, (_, i) => ({ n: di * 1000 + i, dom: d.id, y: 'txt', a: 'A' })));

export const countByDom = qs => qs.reduce((acc, q) => {
  acc[q.dom] = (acc[q.dom] || 0) + 1;
  return acc;
}, {});
