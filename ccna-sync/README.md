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
GET  /v1/health                       → 200 {"ok":true}
GET  /v1/state                        → 200 {"rev":N,"blob":"…"}    (rev 0, blob null if nothing stored)
PUT  /v1/state {"rev":N,"blob":"…"}   → 200 {"rev":N+1}
                                      → 409 {"rev":M,"blob":"…"}    (someone else wrote first)
```

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
| `ALLOWED_KEY_HASHES` | whitespace- or comma-separated SHA-256 hex. Set it and only those keys work. This is the lock. |
| `MAX_KEYS` | how many distinct keys may ever be created (default 8). A backstop for the window before the allowlist is set, not a way to choose who gets in. |

A key that is not on the list gets the same 401 a wrong key gets, so a stranger cannot tell
a list exists. The cap only ever refuses to *create* a key; an existing one keeps working.

The hashes are safe to write down — they are what the table already stores, and a 192-bit
key cannot be recovered from one. To find yours without touching the key itself:

```sql
SELECT key_hash, rev, datetime(updated_at / 1000, 'unixepoch') FROM state;
```

`GET /v1/health` answers `{"ok":true,"locked":true}` once a list is in place — which is how
you check the setting took effect without revealing what is in it.

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

The account-side setup (D1 database, `database_id` in `wrangler.jsonc`, API token, custom
domain) is written up step by step in `../HANDOFF-cowork-cloudflare.md`.
