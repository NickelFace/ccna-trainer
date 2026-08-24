# ccna-sync — progress sync for the CCNA trainer

A single Cloudflare Worker with a D1 table behind `sync.maks.top`. It exists so a exam
passed in the browser shows up on the phone and the other way round, without accounts,
passwords or a server to run.

The server is deliberately dumb: **it stores one opaque string per sync key and a revision
number, and never looks inside.** Every rule about what progress means — which attempt is
newer, how two SRS boxes combine — lives in the clients, in
`ccna-exam-simulator/assets/js/shared/`. That is what keeps the two apps from drifting
apart and the server from needing a deploy every time the format grows a field.

## Protocol

```
GET  /v1/health                       → 200 {"ok":true,"locked":true}
GET  /v1/state                        → 200 {"rev":N,"blob":"…","stats":{…}}  (rev 0, blob null if nothing stored)
PUT  /v1/state {"rev":N,"blob":"…",   → 200 {"rev":N+1}
                "stats":{…}}          → 409 {"rev":M,"blob":"…"}    (someone else wrote first)
                                      → 422 {"error":"…"}           (this write would lose history)
GET  /v1/history                      → 200 {"revisions":[{"rev":N,"created_at":…,"bytes":…}]}
POST /v1/restore {"rev":N}            → 200 {"rev":M+1}
```

`stats` is what the write claims it holds — how many attempts, how many questions in
repetition, how many chapters read, and the oldest attempt's date. The server does not
read the blob, so this is the only way it can notice that a client is about to replace a
full history with an emptier one; when it would, the write is refused with 422 instead of
succeeding quietly. A deliberate prune passes `prune: true` and goes through. A client that
sends no `stats` is not blocked — the guard simply has nothing to compare, which is why an
old build can still write.

`/v1/history` lists what can be rolled back to — revisions with their dates and sizes,
never the blobs, so asking the question does not download twenty copies of the progress.
`/v1/restore` puts one of them back as a new revision, so restoring is itself undoable.

Authentication is one header, `Authorization: Bearer <sync key>`, where the key is a long
random string the user generates on one device and types into the other. The database
stores only its SHA-256, so a copy of the table is not a copy of anyone's keys.

`rev` is optimistic concurrency, not a timestamp: you send the revision you started from,
and the write only lands if the row is still there. A 409 hands back the current state in
the same response, so the loser can merge and retry without another round trip. `rev: 0`
means "I believe nothing is stored yet" and fails the same way if something is.

Limits: the blob is capped at 1 MB (D1 allows 2 MB per row), origins are limited to the
Pages site and the Capacitor WebView.

## Who may use it

The trainer is a public site, so a key on its own is not a door — anyone who opens the page
can make one. Two environment settings decide who actually gets in:

| setting | effect |
|---|---|
| `ALLOWED_KEY_HASHES` | whitespace- or comma-separated SHA-256 hex, in `wrangler.jsonc` under `vars`. Set it and only those keys work. This is the lock. |
| `MAX_KEYS` | how many distinct keys may ever be created (default 8). A backstop for the window before the allowlist is set, not a way to choose who gets in. |

The deployed configuration sets both: two hashes in `ALLOWED_KEY_HASHES` and `MAX_KEYS: 2`,
so the list is the lock and the cap cannot let a third key in behind it.

To lock the server to your own key:

```bash
npm run keyhash        # type the key; it is not echoed and never leaves the process
```

Put the 64-character hash it prints into `vars.ALLOWED_KEY_HASHES` and push — CI deploys it.
Several keys go in one string, separated by spaces or commas. The hash is safe to commit:
it is what the table already holds, and the key cannot be worked back out of it.

A key that is not on the list gets the same 401 a wrong key gets, so a stranger cannot tell
a list exists. The cap only ever refuses to *create* a key; an existing one keeps working.

The hashes are safe to write down — they are what the table already stores, and a 192-bit
key cannot be recovered from one. To find yours without touching the key itself:

```sql
SELECT key_hash, rev, datetime(updated_at / 1000, 'unixepoch') FROM state;
```

`GET /v1/health` answers `{"ok":true,"locked":true}` once a list is in place — which is how
you check the setting took effect without revealing what is in it.

## If the key is lost

Losing the key does not lose the progress. Every device keeps its own full copy — the
server is a meeting point, not the original — so a forgotten key costs the ability of two
devices to keep meeting, not the history itself. Make a new key on both and carry on.

The one case that hurts is a forgotten key *and* a device that is gone. Three ways out, in
the order you would reach for them:

1. **The exported file.** Progress → Export writes the same `v:1` JSON the phone reads.
   It depends on no key and no server, and it is the only copy that survives all of this
   going wrong at once. Worth doing before anything is rotated.
2. **The database.** The blob is plain JSON and the account owner can read it: D1 console →
   `SELECT blob FROM state;`, save what comes back as a `.json` file, and load it with
   Progress → Import. Nothing here is encrypted against the person who owns the account —
   that is a deliberate trade for exactly this recoverability.
3. **D1 Time Travel** restores the whole database to any point in the last 30 days, which
   covers "I overwrote it" rather than "I lost the key".

Keep the key itself where passwords go. It is 32 characters of randomness with no recovery
question behind it, because there is no account it belongs to.

## Development

```bash
npm install
npm test                       # node:sqlite runs the real migration and the real SQL
npm run migrate:local          # apply migrations to the local D1
npm run dev                    # wrangler dev on :8787, no Cloudflare login needed
```

## Deployment

Automatic, from `.github/workflows/sync-deploy.yml` on every push to `main` that touches
this directory — but only once the repository has the `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` secrets. Until then the workflow just runs the tests.

The account side is set up once, by hand:

1. **D1 database** named `ccna-sync` (Storage & Databases → D1 → Create). Copy its
   Database ID — it is not a secret.
2. Put that UUID in `wrangler.jsonc` in place of `PASTE_DATABASE_ID_HERE`, commit, push.
3. **API token** (My Profile → API Tokens → Create Custom Token) with exactly three
   rights: Account · *Workers Scripts: Edit*, Account · *D1: Edit*, Zone · *Workers
   Routes: Edit* for the zone the custom domain lives in. The "Edit Cloudflare Workers"
   template does not always include D1 — check the list before creating. Never a Global
   API Key.
4. **Repository secrets** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (Settings →
   Secrets and variables → Actions).
5. The next push deploys; `sync.maks.top` is declared in `wrangler.jsonc` as a custom
   domain, so the Workers Routes right is enough for Cloudflare to bind it and write the
   DNS record itself.
