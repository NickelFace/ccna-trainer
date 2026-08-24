-- Two things the server needs before the clients start deleting anything of their own.
--
-- `stats` is a handful of counts the client sends with each write — enough to notice a
-- write that loses history, without the server having to understand the blob it stores.
-- `history` keeps the last few revisions, so a write that loses history anyway can be
-- undone rather than mourned.
ALTER TABLE state ADD COLUMN stats TEXT;

CREATE TABLE IF NOT EXISTS history (
  key_hash   TEXT    NOT NULL,
  rev        INTEGER NOT NULL,
  blob       TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (key_hash, rev)
);

CREATE INDEX IF NOT EXISTS history_by_key ON history (key_hash, rev DESC);
