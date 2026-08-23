// Talking to the sync server — the client half of the protocol in ccna-sync/README.md.
//
// Pure and injectable: `fetch` is a parameter, there is no storage and no timer, so both
// clients drive it the same way and the whole exchange can be tested against a fake server
// instead of the network.
//
// The exchange is one round trip in the good case:
//
//   GET  /v1/state                      → what the other device left, and its revision
//   merge(local, remote)                → shared/merge.js decides everything about content
//   PUT  /v1/state {rev, blob}          → 200 if that revision is still current
//                                       → 409 with the newer state, which we merge and retry
//
// The server never parses the blob. It is the `v:1` object both clients already export to
// a file, minus the session — an exam with a running clock belongs to the device running it.
import { packBackup } from './backup.js';
import { merge } from './merge.js';

export const SYNC_BASE = 'https://sync.maks.top';

// Same shape the server enforces, checked here so a mistyped key fails in the UI rather
// than as a 401 from across the network.
export const KEY_RE = /^[A-Za-z0-9_-]{32,128}$/;
export const isSyncKey = key => typeof key === 'string' && KEY_RE.test(key);

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// 32 characters out of a 64-character alphabet — 192 bits, and the alphabet divides 256
// evenly so no character is more likely than another. This is the only secret in the
// system: whoever has it has the progress, which is why there is nothing else in it.
export function newSyncKey(fill) {
  const bytes = new Uint8Array(32);
  (fill || (b => globalThis.crypto.getRandomValues(b)))(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % 64];
  return out;
}

// Everything that can go wrong, named — the UI has to say something different for "this
// key is wrong" than for "the phone is on a train".
export class SyncError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = 'SyncError';
    this.code = code;       // 'key' | 'auth' | 'offline' | 'server' | 'conflict' | 'corrupt'
    this.status = status;
  }
}

const MAX_TRIES = 4;

// What travels. The session is dropped rather than sent as null-and-restored: it is the
// one branch a second device must never adopt.
export const toBlob = (state, now) => JSON.stringify(packBackup({ ...state, session: null }, now));

const parseBlob = blob => {
  if (blob == null) return null;
  try {
    const data = JSON.parse(blob);
    return data && typeof data === 'object' ? data : null;
  } catch {
    // Someone else's data under this key, or a half-written blob. Refusing is the only
    // safe answer: merging junk would write the junk back over both devices.
    throw new SyncError('corrupt', 'stored progress could not be read');
  }
};

async function call(fetchFn, base, key, init = {}) {
  let res;
  try {
    res = await fetchFn(`${base}/v1/state`, {
      ...init,
      headers: { authorization: `Bearer ${key}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
    });
  } catch (err) {
    throw new SyncError('offline', err?.message || 'no connection');
  }
  if (res.status === 401) throw new SyncError('auth', 'the server did not accept this key', 401);
  if (res.status !== 200 && res.status !== 409) {
    throw new SyncError('server', `server answered ${res.status}`, res.status);
  }
  let body;
  try {
    body = await res.json();
  } catch {
    throw new SyncError('server', 'server answered with something that is not JSON', res.status);
  }
  return { status: res.status, body };
}

// Read what the server holds without writing anything — used to show "last synced" and to
// check a key before adopting it.
export async function pull({ fetch, base = SYNC_BASE, key }) {
  if (!isSyncKey(key)) throw new SyncError('key', 'sync key is malformed');
  const { body } = await call(fetch, base, key, { method: 'GET' });
  return { rev: body.rev | 0, remote: parseBlob(body.blob) };
}

// One full exchange. Returns the state both devices now agree on, the revision it is
// stored under, and whether anything actually had to be written.
//
// `state` is this device's branches. The result is what the caller should adopt — it is a
// new object, and the caller's own session is left in it untouched.
export async function syncOnce({ fetch, base = SYNC_BASE, key, state, now = Date.now() }) {
  if (!isSyncKey(key)) throw new SyncError('key', 'sync key is malformed');

  let { rev, remote } = await pull({ fetch, base, key });

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const merged = remote ? merge(state, remote) : { ...state };
    const blob = toBlob(merged, now);

    // Nothing of ours to add: the server already holds exactly this. Skipping the write
    // keeps the revision from climbing on every idle sync, which is what makes a
    // background sync safe to run often.
    if (remote && blob === toBlob(remote, now)) return { state: merged, rev, wrote: false };

    const { status, body } = await call(fetch, base, key, {
      method: 'PUT',
      body: JSON.stringify({ rev, blob }),
    });
    if (status === 200) return { state: merged, rev: body.rev | 0, wrote: true };

    // 409: the other device wrote between our read and our write. Take what it wrote and
    // go round again — with two devices this settles on the first retry.
    rev = body.rev | 0;
    remote = parseBlob(body.blob);
  }
  throw new SyncError('conflict', 'the other device kept writing; try again');
}
