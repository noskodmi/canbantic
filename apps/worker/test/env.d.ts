declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    INDEXER: DurableObjectNamespace;
    CCIP_SIGNER_PRIVATE_KEY?: string;
    CCIP_RESPONSE_TTL_SECONDS?: string;
  }
}

export {};
