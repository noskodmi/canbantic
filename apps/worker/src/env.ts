import type { D1Database, DurableObjectNamespace } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  INDEXER: DurableObjectNamespace;
  SEPOLIA_RPC: string;
  SEPOLIA_CHAIN_ID: string;
  INDEXER_CHUNK_BLOCKS: string;
  /**
   * Orbitport cTRNG endpoint. Default points at the public hosted draw
   * endpoint; override per-environment in `wrangler.jsonc` `vars` if
   * SpaceComputer publishes a regional URL.
   */
  ORBITPORT_URL: string;
  /**
   * Orbitport's pinned Ed25519 public key (32 bytes, hex, 0x-prefixed).
   * Every draw signature is verified against this key before the worker
   * accepts the result. Rotate by re-deploying the worker — never accept
   * a draw whose pubkey doesn't match.
   */
  ORBITPORT_PUBKEY: string;
  /**
   * Optional bearer token if SpaceComputer requires auth on the cTRNG
   * endpoint. Set via `wrangler secret put ORBITPORT_TOKEN`. Empty/unset
   * means the request goes out unauthenticated.
   */
  ORBITPORT_TOKEN?: string;
  /**
   * Hex private key (0x-prefixed, 32 bytes) for the worker's deployer
   * wallet. When set, the Orbitport finalizer will submit
   * `BountyBoard.finalizeFairClaim` transactions directly. When unset
   * (Phase 7 v0.1 default), the finalizer logs the draw + skips the tx,
   * so judges can hand-fire it via cast/etherscan.
   *
   * Provision via `wrangler secret put WORKER_DEPLOYER_PRIVATE_KEY`.
   */
  WORKER_DEPLOYER_PRIVATE_KEY?: string;
}
