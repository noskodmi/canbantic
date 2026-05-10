declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    INDEXER: DurableObjectNamespace;
    SEPOLIA_RPC: string;
    SEPOLIA_CHAIN_ID: string;
    INDEXER_CHUNK_BLOCKS: string;
    CCIP_SIGNER_PRIVATE_KEY?: string;
    CCIP_RESPONSE_TTL_SECONDS?: string;
    ORBITPORT_URL?: string;
    ORBITPORT_PUBKEY?: string;
    ORBITPORT_TOKEN?: string;
    WORKER_DEPLOYER_PRIVATE_KEY?: string;
    X402_PAY_TO_ADDRESS?: string;
  }
}

export {};
