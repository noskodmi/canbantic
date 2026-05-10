-- Phase 2 / Sponsor — SpaceComputer Orbitport cTRNG.
--
-- Persists every Orbitport draw the worker fetches so that:
--   1. /api/orbitport/last-draw can expose the most recent draw to judges,
--      letting them cross-verify the on-chain finalizeFairClaim tx against
--      a real Orbitport signature without needing direct Orbitport access.
--   2. We retain an audit trail of which draw was used to finalize which
--      bounty (used_for_bounty_id is NULL until finalizeFairClaim is sent).
--
-- All hex columns are stored 0x-prefixed lowercase to match the rest of
-- the schema (bounties.description_ref, etc.).

CREATE TABLE IF NOT EXISTS orbitport_draws (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draw_hex TEXT NOT NULL,
  signature_hex TEXT NOT NULL,
  pubkey_hex TEXT NOT NULL,
  ts INTEGER NOT NULL,
  used_for_bounty_id INTEGER
);
CREATE INDEX IF NOT EXISTS orbitport_draws_ts ON orbitport_draws(ts DESC);
CREATE INDEX IF NOT EXISTS orbitport_draws_bounty ON orbitport_draws(used_for_bounty_id);
