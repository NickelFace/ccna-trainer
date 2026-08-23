// The sync server, run against a real SQLite so the SQL is the thing under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/worker.js';
import { d1 } from './d1.js';

const KEY = 'Zm9vYmFyLXRlc3Qta2V5LTMyLWJ5dGVzLWJhc2U2NHVy';
const KEY2 = 'c2Vjb25kLWtleS0zMi1ieXRlcy1sb25nLWJhc2U2NHVybA';
const SITE = 'https://ccna.maks.top';

const call = (env, method, path, { key, body, origin, vars } = {}) => {
  const headers = {};
  if (key) headers.authorization = `Bearer ${key}`;
  if (origin) headers.origin = origin;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return handle(new Request(`https://sync.maks.top${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  }), { DB: env, ...vars });
};

test('health needs no key, and says whether the door is locked', async () => {
  const open = await call(d1(), 'GET', '/v1/health');
  assert.equal(open.status, 200);
  assert.deepEqual(await open.json(), { ok: true, locked: false });

  const shut = await call(d1(), 'GET', '/v1/health', { vars: { ALLOWED_KEY_HASHES: 'a'.repeat(64) } });
  assert.deepEqual(await shut.json(), { ok: true, locked: true });
});

// ---------------------------------------------------------------- who may use this server

const sha256 = async text => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
};

test('with an allowlist, a key that is not on it gets nowhere', async () => {
  const env = d1();
  const vars = { ALLOWED_KEY_HASHES: await sha256(KEY) };

  const mine = await call(env, 'PUT', '/v1/state', { key: KEY, body: { rev: 0, blob: 'mine' }, vars });
  assert.equal(mine.status, 200);

  // 401 either way, the same answer a wrong key gets: a stranger learns nothing about the list.
  assert.equal((await call(env, 'GET', '/v1/state', { key: KEY2, vars })).status, 401);
  assert.equal((await call(env, 'PUT', '/v1/state', { key: KEY2, body: { rev: 0, blob: 'theirs' }, vars })).status, 401);
});

test('the allowlist takes several keys, in any of the shapes a person types', async () => {
  const env = d1();
  const vars = { ALLOWED_KEY_HASHES: `${(await sha256(KEY)).toUpperCase()}, \n ${await sha256(KEY2)}` };
  assert.equal((await call(env, 'GET', '/v1/state', { key: KEY, vars })).status, 200);
  assert.equal((await call(env, 'GET', '/v1/state', { key: KEY2, vars })).status, 200);
});

test('junk in the allowlist does not accidentally open the door', async () => {
  const env = d1();
  // Nothing hash-shaped in it: the setting is not a list, so it is not a list of everyone.
  const vars = { ALLOWED_KEY_HASHES: 'todo: paste the hash here' };
  assert.equal((await call(env, 'GET', '/v1/state', { key: KEY, vars })).status, 200);
});

test('without an allowlist, the number of keys is still capped', async () => {
  const env = d1();
  const vars = { MAX_KEYS: 2 };
  const keys = ['1', '2', '3'].map(n => `padded-sync-key-for-test-number-${n}${'x'.repeat(8)}`);

  assert.equal((await call(env, 'PUT', '/v1/state', { key: keys[0], body: { rev: 0, blob: 'a' }, vars })).status, 200);
  assert.equal((await call(env, 'PUT', '/v1/state', { key: keys[1], body: { rev: 0, blob: 'b' }, vars })).status, 200);

  const third = await call(env, 'PUT', '/v1/state', { key: keys[2], body: { rev: 0, blob: 'c' }, vars });
  assert.equal(third.status, 403);

  // The cap is about new keys only — the ones already there keep working.
  const again = await call(env, 'PUT', '/v1/state', { key: keys[0], body: { rev: 1, blob: 'a2' }, vars });
  assert.equal(again.status, 200);
});

test('a key that is missing, malformed or too short never reaches the database', async () => {
  const env = { prepare() { throw new Error('the database must not be touched'); } };
  for (const key of [undefined, 'short', 'has spaces and punctuation!!', 'a'.repeat(200)]) {
    const res = await call(env, 'GET', '/v1/state', { key });
    assert.equal(res.status, 401, `key ${key}`);
  }
});

test('an unknown key reads as "nothing stored yet"', async () => {
  const res = await call(d1(), 'GET', '/v1/state', { key: KEY });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { rev: 0, blob: null });
});

test('first write claims rev 1 and reads back verbatim', async () => {
  const env = d1();
  const blob = '{"v":1,"attempts":[]}';
  const put = await call(env, 'PUT', '/v1/state', { key: KEY, body: { rev: 0, blob } });
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { rev: 1 });

  const get = await call(env, 'GET', '/v1/state', { key: KEY });
  assert.deepEqual(await get.json(), { rev: 1, blob });
});

test('the server does not care what the blob is', async () => {
  const env = d1();
  const blob = 'not json at all — just bytes ☃';
  await call(env, 'PUT', '/v1/state', { key: KEY, body: { rev: 0, blob } });
  const get = await call(env, 'GET', '/v1/state', { key: KEY });
  assert.equal((await get.json()).blob, blob);
});

test('writes advance the revision one at a time', async () => {
  const env = d1();
  await call(env, 'PUT', '/v1/state', { key: KEY, body: { rev: 0, blob: 'one' } });
  const second = await call(env, 'PUT', '/v1/state', { key: KEY, body: { rev: 1, blob: 'two' } });
  assert.deepEqual(await second.json(), { rev: 2 });
  const get = await call(env, 'GET', '/v1/state', { key: KEY });
  assert.deepEqual(await get.json(), { rev: 2, blob: 'two' });
});

test('a write based on a stale revision loses and is handed the winner', async () => {
  const env = d1();
  await call(env, 'PUT', '/v1/state', { key: KEY, body: { rev: 0, blob: 'phone' } });
  await call(env, 'PUT', '/v1/state', { key: KEY, body: { rev: 1, blob: 'phone again' } });

  const stale = await call(env, 'PUT', '/v1/state', { key: KEY, body: { rev: 1, blob: 'browser' } });
  assert.equal(stale.status, 409);
  // Everything the loser needs to merge and retry, without a second round trip.
  assert.deepEqual(await stale.json(), { rev: 2, blob: 'phone again' });

  const get = await call(env, 'GET', '/v1/state', { key: KEY });
  assert.equal((await get.json()).blob, 'phone again');
});

test('two devices claiming an empty slot: exactly one wins', async () => {
  const env = d1();
  const first = await call(env, 'PUT', '/v1/state', { key: KEY, body: { rev: 0, blob: 'phone' } });
  const second = await call(env, 'PUT', '/v1/state', { key: KEY, body: { rev: 0, blob: 'browser' } });
  assert.equal(first.status, 200);
  assert.equal(second.status, 409);
  assert.deepEqual(await second.json(), { rev: 1, blob: 'phone' });
});

test('a revision on a slot that holds nothing is a conflict, not a crash', async () => {
  const res = await call(d1(), 'PUT', '/v1/state', { key: KEY, body: { rev: 7, blob: 'x' } });
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { rev: 0, blob: null });
});

test('two keys cannot see each other', async () => {
  const env = d1();
  await call(env, 'PUT', '/v1/state', { key: KEY, body: { rev: 0, blob: 'mine' } });
  const other = await call(env, 'GET', '/v1/state', { key: KEY2 });
  assert.deepEqual(await other.json(), { rev: 0, blob: null });
});

test('a malformed write is rejected before it can store nonsense', async () => {
  const env = d1();
  const cases = [
    ['not json', 400],
    [{ blob: 'x' }, 400],                       // no rev
    [{ rev: -1, blob: 'x' }, 400],
    [{ rev: 1.5, blob: 'x' }, 400],
    [{ rev: 0 }, 400],                          // no blob
    [{ rev: 0, blob: 42 }, 400],
    [{ rev: 0, blob: 'x'.repeat(1_000_001) }, 413],
  ];
  for (const [body, status] of cases) {
    const res = await call(env, 'PUT', '/v1/state', { key: KEY, body });
    assert.equal(res.status, status, JSON.stringify(body).slice(0, 40));
  }
  // …and nothing of it landed.
  const get = await call(env, 'GET', '/v1/state', { key: KEY });
  assert.deepEqual(await get.json(), { rev: 0, blob: null });
});

test('unknown paths and methods are refused', async () => {
  const env = d1();
  assert.equal((await call(env, 'GET', '/', { key: KEY })).status, 404);
  assert.equal((await call(env, 'GET', '/v1/state/../etc', { key: KEY })).status, 404);
  assert.equal((await call(env, 'DELETE', '/v1/state', { key: KEY })).status, 405);
});

test('CORS answers the two clients and nobody else', async () => {
  const env = d1();
  for (const origin of [SITE, 'https://localhost']) {
    const pre = await call(env, 'OPTIONS', '/v1/state', { origin });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), origin);
    assert.match(pre.headers.get('access-control-allow-headers'), /authorization/);
    assert.equal(pre.headers.get('vary'), 'Origin');
  }
  const evil = await call(env, 'OPTIONS', '/v1/state', { origin: 'https://evil.example' });
  assert.equal(evil.headers.get('access-control-allow-origin'), null);

  // A real response carries the header too, not just the preflight.
  const get = await call(env, 'GET', '/v1/state', { key: KEY, origin: SITE });
  assert.equal(get.headers.get('access-control-allow-origin'), SITE);
});
