import type { D1Database, DurableObjectNamespace } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  INDEXER: DurableObjectNamespace;
  SEPOLIA_RPC: string;
  SEPOLIA_CHAIN_ID: string;
  INDEXER_CHUNK_BLOCKS: string;
  /**
   * Address that receives X402 payments for paywalled endpoints. When
   * unset (preview/dev) the worker falls back to the zero-address
   * sentinel — production must set this via wrangler vars/secrets.
   */
  X402_PAY_TO_ADDRESS?: string;
}
