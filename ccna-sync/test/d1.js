// The slice of the D1 client API the Worker uses — prepare().bind().first()/.run() — over
// a real in-memory SQLite. Real SQL, because the compare-and-set on `rev` is the whole
// server and a stub that just remembers the last value would pass while the statement was
// wrong. node:sqlite is experimental in Node 22, hence the flag in the test script.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const HERE = dirname(fileURLToPath(import.meta.url));

// Every migration, in order — the schema under test is the one that will be deployed, not
// a hand-kept copy of it. Data-only migrations (deleting rows of keys that no longer
// matter) are harmless against an empty database.
const SCHEMA = readdirSync(join(HERE, '..', 'migrations')).filter(f => f.endsWith('.sql')).sort();

export const d1 = () => {
  const db = new DatabaseSync(':memory:');
  for (const file of SCHEMA) db.exec(readFileSync(join(HERE, '..', 'migrations', file), 'utf8'));

  const prepare = sql => {
    const stmt = db.prepare(sql);
    let args = [];
    const api = {
      bind(...values) { args = values; return api; },
      async first() { return stmt.get(...args) ?? null; },
      async all() { return { results: stmt.all(...args) }; },
      async run() { const r = stmt.run(...args); return { success: true, meta: { changes: r.changes } }; },
    };
    return api;
  };

  return {
    prepare,
    // D1 runs a batch as one transaction; sequential is close enough for what the Worker
    // uses it for, which is "write the history row and trim the tail".
    async batch(statements) { return Promise.all(statements.map(s => s.run())); },
  };
};
