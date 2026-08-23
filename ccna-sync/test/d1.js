// The slice of the D1 client API the Worker uses — prepare().bind().first()/.run() — over
// a real in-memory SQLite. Real SQL, because the compare-and-set on `rev` is the whole
// server and a stub that just remembers the last value would pass while the statement was
// wrong. node:sqlite is experimental in Node 22, hence the flag in the test script.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const HERE = dirname(fileURLToPath(import.meta.url));

export const d1 = () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(join(HERE, '..', 'migrations', '0001_state.sql'), 'utf8'));
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      let args = [];
      const api = {
        bind(...values) { args = values; return api; },
        async first() { return stmt.get(...args) ?? null; },
        async run() { const r = stmt.run(...args); return { success: true, meta: { changes: r.changes } }; },
      };
      return api;
    },
  };
};
