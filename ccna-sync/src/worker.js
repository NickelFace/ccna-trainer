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
//   GET  /v1/health -> 200 { ok: true }             no auth, for CI and uptime checks
//
// Auth is one long random key per user, sent as `Authorization: Bearer <key>`. There is no
// account, no e-mail and no password: the key IS the identity, generated on the first
// device and typed (or scanned) into the second. Only its SHA-256 is stored, so the
// database itself cannot be used to sync as anyone.

const MAX_BLOB_BYTES = 1_000_000;   // D1 caps a row at 2 MB; a year of one user's history is tens of KB

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
  env.DB.prepare('SELECT rev, blob FROM state WHERE key_hash = ?').bind(hash).first();

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
  const { rev, blob } = body || {};
  if (!Number.isInteger(rev) || rev < 0) return json({ error: 'rev must be a whole number >= 0' }, 400, origin);
  if (typeof blob !== 'string') return json({ error: 'blob must be a string' }, 400, origin);
  if (new TextEncoder().encode(blob).length > MAX_BLOB_BYTES) {
    return json({ error: `blob exceeds ${MAX_BLOB_BYTES} bytes` }, 413, origin);
  }

  const now = Date.now();

  // rev 0 means "I believe nothing is stored yet". INSERT … DO NOTHING settles the race
  // between two devices claiming that at the same moment: exactly one of them changes a row.
  if (rev === 0) {
    const res = await env.DB
      .prepare('INSERT INTO state (key_hash, rev, blob, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT (key_hash) DO NOTHING')
      .bind(hash, blob, now)
      .run();
    if (res.meta.changes === 1) return json({ rev: 1 }, 200, origin);
    return conflict(env, hash, origin);
  }

  // Everything else is a compare-and-set on the revision. One statement, so two devices
  // writing at the same instant cannot both win.
  const res = await env.DB
    .prepare('UPDATE state SET rev = rev + 1, blob = ?, updated_at = ? WHERE key_hash = ? AND rev = ?')
    .bind(blob, now, hash, rev)
    .run();
  if (res.meta.changes === 1) return json({ rev: rev + 1 }, 200, origin);
  return conflict(env, hash, origin);
}

export async function handle(request, env) {
  const origin = request.headers.get('origin');
  const { pathname } = new URL(request.url);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (pathname === '/v1/health') return json({ ok: true }, 200, origin);
  if (pathname !== '/v1/state') return json({ error: 'not found' }, 404, origin);

  const key = bearer(request);
  if (!key) return json({ error: 'missing or malformed sync key' }, 401, origin);
  const hash = await keyHash(key);

  if (request.method === 'GET') {
    const row = await readState(env, hash);
    return json({ rev: row ? row.rev : 0, blob: row ? row.blob : null }, 200, origin);
  }
  if (request.method === 'PUT') return put(request, env, hash, origin);

  return json({ error: 'method not allowed' }, 405, origin);
}

export default { fetch: handle };
