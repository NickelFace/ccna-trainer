-- The cap in src/worker.js counts rows, not allowlisted hashes, so a row nobody can
-- authenticate as still occupies a slot. That is what a real APK hit while the app-side
-- sync was being verified on a device: creating a key returned 403 for a key that is on
-- the allowlist, because the table already held three rows against MAX_KEYS = 2.
--
-- What was in it on 2026-08-24, read from the D1 console:
--
--   0a4ed2b8...c9df   rev 10   2026-08-24 08:35   the owner's progress, in daily use
--   159bb7f7...514c   rev  1   2026-08-23 15:16   created once, never written again
--   2ec662b0...b367   rev  1   2026-08-24 00:37   created once, never written again
--
-- The two rev-1 rows fall in the window when the key rotation was started and called off
-- (see wrangler.jsonc) and the site's "make a key" button was being exercised against the
-- live server. Neither hash is on the allowlist, so neither can be reached: the server
-- answers 401 before it ever reads the table. Deleting them loses nothing that could be
-- used again. The rows outlived 0002 because they were made after it, while the cap still
-- allowed more keys than it does now.
--
-- Unlike 0002 this deletes by exclusion, which is the one shape that catches a leftover
-- whose hash nobody wrote down -- and there was one more of those than anybody expected.
-- The two hashes below are copied verbatim from wrangler.jsonc -> vars.ALLOWED_KEY_HASHES;
-- if they ever disagree with the deployed config, this statement is what takes the row
-- that matters, so check them, not the count.
DELETE FROM state WHERE key_hash NOT IN (
  '0a4ed2b862a3fc750d792deedc8d65ce79133e6d84911246c3001dc9f0e2c9df',   -- the owner's key
  '0543a5c346606e6860f4a2eb95bffba4b436aada0af745518072175762ca3f12'    -- the key this project's development uses
);
