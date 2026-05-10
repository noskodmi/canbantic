import type { D1Database, DurableObjectNamespace } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  INDEXER: DurableObjectNamespace;
  SEPOLIA_RPC: string;
  SEPOLIA_CHAIN_ID: string;
  INDEXER_CHUNK_BLOCKS: string;
  /** OpenRouter API key for the Contract Intelligence runner. Set via wrangler secret. */
  OPENROUTER_API_KEY?: string;
  /** OpenRouter model id (default: anthropic/claude-sonnet-4.5). */
  OPENROUTER_MODEL?: string;
}
