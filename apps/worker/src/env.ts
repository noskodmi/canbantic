import type { D1Database, DurableObjectNamespace } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  INDEXER: DurableObjectNamespace;
  SEPOLIA_RPC: string;
  SEPOLIA_CHAIN_ID: string;
  INDEXER_CHUNK_BLOCKS: string;
}
