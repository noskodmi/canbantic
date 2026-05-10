declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    INDEXER: DurableObjectNamespace;
    CCIP_SIGNER_PRIVATE_KEY?: string;
    CCIP_RESPONSE_TTL_SECONDS?: string;
    ORBITPORT_URL: string;
    ORBITPORT_PUBKEY: string;
    ORBITPORT_TOKEN?: string;
    WORKER_DEPLOYER_PRIVATE_KEY?: string;
  }
}

export {};
