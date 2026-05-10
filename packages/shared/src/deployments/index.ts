import { sepoliaDeployment, UNDEPLOYED_PLACEHOLDER } from "./sepolia.js";

export { sepoliaDeployment, type SepoliaDeployment, UNDEPLOYED_PLACEHOLDER } from "./sepolia.js";

/**
 * `true` once the controller deploys `OffchainResolver` to Sepolia and
 * replaces the zero-address placeholder in `sepoliaDeployment`. Mirrors
 * the AgentVenture pattern — web docs / CTAs gate on this so the UX
 * degrades gracefully until the resolver address is real.
 */
export const isOffchainResolverDeployed: boolean =
  sepoliaDeployment.contracts.OffchainResolver !== UNDEPLOYED_PLACEHOLDER;

export const DEPLOYMENTS = {
  [sepoliaDeployment.chainId]: sepoliaDeployment,
} as const;

export type ChainId = keyof typeof DEPLOYMENTS;

/**
 * Look up a deployment by chain id. Throws if the chain isn't supported.
 *
 * Phase 1B ships only Sepolia (`11155111`). Phase 7+ may add mainnet.
 */
export function deploymentFor(chainId: number): typeof sepoliaDeployment {
  if (chainId !== sepoliaDeployment.chainId) {
    throw new Error(
      `No deployment for chain id ${String(chainId)}. Supported: ${String(sepoliaDeployment.chainId)}`,
    );
  }
  return sepoliaDeployment;
}
