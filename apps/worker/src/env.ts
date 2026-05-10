import type { D1Database, DurableObjectNamespace } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  INDEXER: DurableObjectNamespace;
  SEPOLIA_RPC: string;
  SEPOLIA_CHAIN_ID: string;
  INDEXER_CHUNK_BLOCKS: string;
  /**
   * Hex-encoded private key (with or without `0x` prefix) used by the
   * CCIP-Read gateway to sign offchain resolver responses. Provisioned via
   *     wrangler secret put CCIP_SIGNER_PRIVATE_KEY
   * The matching public address must be passed to OffchainResolver's
   * constructor (`CCIP_SIGNER_ADDR` for the deploy script). Optional —
   * when unset, the gateway returns 503 with setup instructions instead
   * of crashing.
   */
  CCIP_SIGNER_PRIVATE_KEY?: string;
  /**
   * Optional override for the response TTL window in seconds. Defaults to
   * 300 (five minutes); the OffchainResolver compares the signed
   * `expires` field against `block.timestamp` and reverts past it.
   */
  CCIP_RESPONSE_TTL_SECONDS?: string;
}
