-- X402 paywall (Phase 7 / Sponsor Apify v0.1).
--
-- `x402_redemptions` provides replay protection for the Sepolia
-- `eth-direct` payment scheme — once a tx hash funds a successful call
-- to a paywalled endpoint, it can't fund a second one. The middleware
-- inserts the row before invoking the wrapped handler, so a racing
-- retry hits the UNIQUE constraint instead of double-spending the
-- payment.
--
-- `endpoint` is the request pathname (or a caller-supplied label) so
-- operators can audit which endpoints a given tx hash has funded.

CREATE TABLE IF NOT EXISTS x402_redemptions (
  tx_hash TEXT PRIMARY KEY,
  redeemed_at_ts INTEGER NOT NULL,
  endpoint TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS x402_redemptions_endpoint ON x402_redemptions(endpoint);
