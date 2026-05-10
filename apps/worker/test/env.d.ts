declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    INDEXER: DurableObjectNamespace;
    ORBITPORT_URL: string;
    ORBITPORT_PUBKEY: string;
    ORBITPORT_TOKEN?: string;
    WORKER_DEPLOYER_PRIVATE_KEY?: string;
  }
}

export {};
