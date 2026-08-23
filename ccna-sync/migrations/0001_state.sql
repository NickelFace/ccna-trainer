-- One row per sync key. The server never reads inside `blob`: it is the client's save file
-- (the shared v:1 format) as one opaque string, and `rev` is what keeps two devices from
-- overwriting each other — see src/worker.js.
--
-- `key_hash` is SHA-256 of the user's sync key, hex. The key itself is never stored, so a
-- copy of this table cannot be used to sync as anybody.
CREATE TABLE IF NOT EXISTS state (
  key_hash   TEXT    PRIMARY KEY,
  rev        INTEGER NOT NULL,
  blob       TEXT    NOT NULL,
  updated_at INTEGER NOT NULL
);
