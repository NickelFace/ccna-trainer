// CCNA Trainer sync — one blob per user, guarded by a revision number.
//
// The server is deliberately stupid: it stores an opaque string and the revision it is at,
// and refuses a write that is not based on the revision it currently holds. It never looks
// inside the blob, so the save format can change without touching or redeploying this.
// Merging is the clients' job (shared/merge.js) — see ../HANDOFF-sync.md §3.
//
//   GET  /v1/state  -> 200 { rev, blob }            rev 0 and blob null when nothing is stored
//   PUT  /v1/state  <- { rev, blob }
//                   -> 200 { rev }                  accepted, rev is the new one
//                   -> 409 { rev, blob }            someone else wrote first; here is theirs
//   GET  /v1/history-> 200 { revisions: [...] }     what can be rolled back to
//   POST /v1/restore<- { rev }
//                   -> 200 { rev }                  an old revision written back as a new one
//   GET  /v1/health -> 200 { ok: true }             no auth, for CI and uptime checks
//
// Auth is one long random key per user, sent as `Authorization: Bearer <key>`. There is no
// account, no e-mail and no password: the key IS the identity, generated on the first
// device and typed (or scanned) into the second. Only its SHA-256 is stored, so the
// database itself cannot be used to sync as anyone.
//
// That alone would make this open house: the trainer is a public site, so anyone who opens
// it can press "make a key" and start keeping their progress in someone else's database.
// Two settings close it, both read from the environment so neither needs a code change:
//
//   ALLOWED_KEY_HASHES  whitespace/comma-separated SHA-256 hex. Set it and only those keys
//                       work — this is the actual lock. The hashes are safe to write down:
//                       they are what the database already holds, and a 192-bit key cannot
//                       be recovered from one.
//   MAX_KEYS            how many distinct keys may ever be created (default below). This is
//                       only a backstop for the window before the allowlist is set — it
//                       caps the damage, it does not choose who gets in.

const MAX_BLOB_BYTES = 1_000_000;   // D1 caps a row at 2 MB; a year of one user's history is tens of KB
const DEFAULT_MAX_KEYS = 8;         // one user, a handful of devices and a re-key or two

// How many past revisions stay recoverable. Twenty writes of a heavy year of progress is
// under a megabyte, against 500 MB of free database — the cost of an undo is nothing, and
// the alternative to having one is a support conversation with yourself.
const MAX_HISTORY = 20;

// The two clients, plus the two ways they run in development. Everything else gets no CORS
// headers at all — the browser then refuses the response, which is the point.
const ALLOWED_ORIGINS = new Set([
  'https://ccna.maks.top',            // the site
  'https://nickelface.github.io',     // the Pages address the site also answers on
  'https://localhost',                // Android WebView (Capacitor androidScheme: https)
  'http://localhost:8099',            // local site
  'http://localhost:8100',            // local app build
]);

const KEY_RE = /^[A-Za-z0-9_-]{32,128}$/;   // base64url, 32 bytes -> 43 chars

// The allowlist, or null when the server is still open to any key.
const allowList = env => {
  const found = String(env.ALLOWED_KEY_HASHES || '').toLowerCase().match(/[0-9a-f]{64}/g);
  return found && found.length ? new Set(found) : null;
};

const maxKeys = env => {
  const n = Number(env.MAX_KEYS);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_MAX_KEYS;
};

// The counts a client sends with a write. The server cannot read the blob — that is the
// whole design — so this is the only way it can tell "here is more progress" from "here is
// less". Deliberately small: three things that only ever grow, and the age of the oldest
// attempt, which only ever moves forward.
const COUNTERS = ['attempts', 'srs', 'read'];

const validStats = v =>
  !!v && typeof v === 'object' && !Array.isArray(v)
  && [...COUNTERS, 'oldest'].every(k => Number.isInteger(v[k]) && v[k] >= 0);

// Is this write losing something? `prune` is the client saying "yes, on purpose, I dropped
// attempts that aged out" — which is allowed only if the oldest one really did move
// forward, and never excuses losing a repetition or a read chapter.
function losesHistory(before, after, prune) {
  if (!before || !after) return null;                  // nothing to compare against
  for (const k of COUNTERS) {
    if (after[k] >= before[k]) continue;
    if (k === 'attempts' && prune && after.oldest > before.oldest) continue;
    return k;
  }
  return null;
}

const json = (body, status, origin) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...cors(origin) },
});

function cors(origin) {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, PUT, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '86400',
    // Two clients on two origins share this URL; without this a cache could hand one of
    // them the other's allow-origin header.
    vary: 'Origin',
  };
}

async function keyHash(key) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// The bearer key, or null. Format is checked before the database is touched: an unauthorized
// flood should cost a regex, not a query.
function bearer(request) {
  const header = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match && KEY_RE.test(match[1]) ? match[1] : null;
}

const readState = (env, hash) =>
  env.DB.prepare('SELECT rev, blob, stats FROM state WHERE key_hash = ?').bind(hash).first();

const safeParse = text => { try { return JSON.parse(text); } catch { return null; } };

// Put an old revision back as a new one. The history is never rewritten — going back is
// itself a write, and staying able to undo the undo is the point of keeping it.
async function restore(request, env, hash, origin) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400, origin); }
  const rev = body?.rev;
  if (!Number.isInteger(rev) || rev < 1) return json({ error: 'rev must be a whole number >= 1' }, 400, origin);

  const old = await env.DB.prepare('SELECT blob FROM history WHERE key_hash = ? AND rev = ?').bind(hash, rev).first();
  if (!old) return json({ error: 'no such revision' }, 404, origin);

  const now = Date.now();
  const res = await env.DB
    // stats go to NULL: the counts of a revision from before are not recorded, and a stale
    // comparison would refuse the very next honest write.
    .prepare('UPDATE state SET rev = rev + 1, blob = ?, updated_at = ?, stats = NULL WHERE key_hash = ?')
    .bind(old.blob, now, hash)
    .run();
  if (res.meta.changes !== 1) return json({ error: 'nothing stored under this key' }, 404, origin);

  const row = await readState(env, hash);
  await remember(env, hash, row.rev, old.blob, now);
  return json({ rev: row.rev }, 200, origin);
}

// What a conflicting writer needs to merge and try again: the revision that won and what it
// wrote. Returns the "nothing stored" pair when the row was deleted in between.
async function conflict(env, hash, origin) {
  const row = await readState(env, hash);
  return json({ rev: row ? row.rev : 0, blob: row ? row.blob : null }, 409, origin);
}

async function put(request, env, hash, origin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'body must be JSON' }, 400, origin);
  }
  const { rev, blob, stats, prune } = body || {};
  if (!Number.isInteger(rev) || rev < 0) return json({ error: 'rev must be a whole number >= 0' }, 400, origin);
  if (typeof blob !== 'string') return json({ error: 'blob must be a string' }, 400, origin);
  if (new TextEncoder().encode(blob).length > MAX_BLOB_BYTES) {
    return json({ error: `blob exceeds ${MAX_BLOB_BYTES} bytes` }, 413, origin);
  }
  if (stats !== undefined && !validStats(stats)) {
    return json({ error: 'stats must be whole numbers: attempts, srs, read, oldest' }, 400, origin);
  }

  const now = Date.now();

  // Refuse a write that would lose progress. This guards against a broken client and a
  // half-restored backup, not against whoever holds the key — they could send any counts
  // they like. What protects against them is the allowlist, and nothing else pretends to.
  const current = await env.DB.prepare('SELECT stats FROM state WHERE key_hash = ?').bind(hash).first();
  if (stats && current?.stats) {
    let before = null;
    try { before = JSON.parse(current.stats); } catch { before = null; }
    const lost = losesHistory(before, stats, prune === true);
    if (lost) {
      return json({ error: `this write drops ${lost} and did not say it was pruning`, stats: before }, 422, origin);
    }
  }
  const packed = stats ? JSON.stringify(stats) : (current?.stats ?? null);

  // rev 0 means "I believe nothing is stored yet". INSERT … DO NOTHING settles the race
  // between two devices claiming that at the same moment: exactly one of them changes a row.
  if (rev === 0) {
    // Creating a key is the only operation that grows the database, so it is the only one
    // the cap applies to — and only when there is no allowlist. With one, the number of
    // keys is already bounded by the list, while the cap counts *rows*: a row nobody can
    // authenticate as still occupies a slot, and that is how an allowed key came to be
    // refused with 403 on a real phone.
    if (!allowList(env)) {
      const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM state').first();
      if (n >= maxKeys(env)) {
        return json({ error: 'this server is not taking new sync keys' }, 403, origin);
      }
    }
    const res = await env.DB
      .prepare('INSERT INTO state (key_hash, rev, blob, updated_at, stats) VALUES (?, 1, ?, ?, ?) ON CONFLICT (key_hash) DO NOTHING')
      .bind(hash, blob, now, packed)
      .run();
    if (res.meta.changes !== 1) return conflict(env, hash, origin);
    await remember(env, hash, 1, blob, now);
    return json({ rev: 1 }, 200, origin);
  }

  // Everything else is a compare-and-set on the revision. One statement, so two devices
  // writing at the same instant cannot both win.
  const res = await env.DB
    .prepare('UPDATE state SET rev = rev + 1, blob = ?, updated_at = ?, stats = ? WHERE key_hash = ? AND rev = ?')
    .bind(blob, now, packed, hash, rev)
    .run();
  if (res.meta.changes !== 1) return conflict(env, hash, origin);
  await remember(env, hash, rev + 1, blob, now);
  return json({ rev: rev + 1 }, 200, origin);
}

// Keep the accepted revision, drop everything past the last MAX_HISTORY. Failing to record
// history must not fail the write: the progress is already stored, and an undo nobody can
// reach is a smaller loss than a sync that reports failure after succeeding.
async function remember(env, hash, rev, blob, now) {
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT OR REPLACE INTO history (key_hash, rev, blob, created_at) VALUES (?, ?, ?, ?)')
        .bind(hash, rev, blob, now),
      env.DB.prepare(`DELETE FROM history WHERE key_hash = ? AND rev <= ?`).bind(hash, rev - MAX_HISTORY),
    ]);
  } catch (err) {
    console.warn('history: could not record revision', rev, err?.message);
  }
}

export async function handle(request, env) {
  const origin = request.headers.get('origin');
  const { pathname } = new URL(request.url);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  // `locked` is how the owner checks from a terminal that the allowlist actually took
  // effect after setting the secret. It says whether there is a list, never what is in it.
  if (pathname === '/v1/health') return json({ ok: true, locked: !!allowList(env) }, 200, origin);
  const known = pathname === '/v1/state' || pathname === '/v1/history' || pathname === '/v1/restore';
  if (!known) return json({ error: 'not found' }, 404, origin);

  const key = bearer(request);
  if (!key) return json({ error: 'missing or malformed sync key' }, 401, origin);
  const hash = await keyHash(key);

  // Indistinguishable from a wrong key on purpose: a stranger learns only that their key
  // is not this server's, not whether they were close or whether a list exists at all.
  const allowed = allowList(env);
  if (allowed && !allowed.has(hash)) return json({ error: 'unknown sync key' }, 401, origin);

  if (pathname === '/v1/history') {
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, origin);
    // Sizes and dates, never the blobs: this answers "what can I go back to", and a list
    // that carries twenty copies of the progress would be a heavy way to ask it.
    const { results } = await env.DB
      .prepare('SELECT rev, created_at, LENGTH(blob) AS bytes FROM history WHERE key_hash = ? ORDER BY rev DESC')
      .bind(hash)
      .all();
    return json({ revisions: results || [] }, 200, origin);
  }

  if (pathname === '/v1/restore') {
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405, origin);
    return restore(request, env, hash, origin);
  }

  if (request.method === 'GET') {
    const row = await readState(env, hash);
    return json({
      rev: row ? row.rev : 0,
      blob: row ? row.blob : null,
      // What the last write claimed it held. The client compares its own counts against
      // this to know whether it is about to shrink anything, and says so if it is.
      stats: row?.stats ? safeParse(row.stats) : null,
    }, 200, origin);
  }
  if (request.method === 'PUT') return put(request, env, hash, origin);

  return json({ error: 'method not allowed' }, 405, origin);
}

export default { fetch: handle };
