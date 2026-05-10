declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    INDEXER: DurableObjectNamespace;
    SEPOLIA_RPC: string;
    SEPOLIA_CHAIN_ID: string;
    INDEXER_CHUNK_BLOCKS: string;
    X402_PAY_TO_ADDRESS?: string;
  }
}

export {};
