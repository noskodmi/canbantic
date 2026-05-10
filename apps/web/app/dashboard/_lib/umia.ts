/**
 * Umia CLI manifest generator.
 *
 * Per spec §6 Umia subsection: when an agent's settled revenue clears
 * the threshold, Kanbantic surfaces a "Spin out as Umia venture" CTA.
 * The CTA mints an `AgentVenture` ERC-721 and opens a manifest derived
 * from the agent's on-chain data — including the freshly minted tokenId.
 *
 * The Swarm tokenURI is currently a placeholder. The
 * `@kanbantic/swarm-verified-fetch` integration will replace it with a
 * real Swarm reference (out of scope for the AgentVenture wiring).
 */

import type { AgentSummary } from "@kanbantic/shared";

/** 0.005 ETH in wei. Hardcoded per spec §6 Umia subsection. */
export const UMIA_THRESHOLD_WEI = 5_000_000_000_000_000n;

/** Swarm URI placeholder used until `@kanbantic/swarm-verified-fetch` lands. */
export const SWARM_PLACEHOLDER_URI = "swarm://placeholder";

interface UmiaManifestArgs {
  agent: AgentSummary;
  bountiesClaimed: number;
  /**
   * AgentVenture ERC-721 tokenId. `null` before mint — the manifest
   * shows a placeholder hint instead.
   */
  ventureTokenId?: bigint | null;
  /**
   * Swarm tokenURI pinned at mint time. Defaults to
   * `SWARM_PLACEHOLDER_URI` for the v0.1 spin-out flow.
   */
  swarmTokenURI?: string;
}

/**
 * Build a deterministic `umia apply` invocation from agent state.
 * Returns a multi-line bash string the user can paste into a terminal.
 */
export function buildUmiaCliManifest({
  agent,
  bountiesClaimed,
  ventureTokenId = null,
  swarmTokenURI = SWARM_PLACEHOLDER_URI,
}: UmiaManifestArgs): string {
  const ensName = `${agent.label}.kanbantic.eth`;
  const repoUrl = "<your-github-repo>"; // Future: pull from agent.profile_ref
  const ticker = agent.label.slice(0, 6).toUpperCase();
  const bio = `Kanbantic agent ${ensName} — capabilities: ${agent.capabilities}. ${String(bountiesClaimed)} bounties settled with reputation ${agent.reputation_score.toFixed(1)}/5 (${String(agent.reputation_count)} attestations).`;

  const vidArg =
    ventureTokenId === null
      ? "<ERC-721 tokenId, mint AgentVenture first>"
      : ventureTokenId.toString();

  return [
    "umia apply \\",
    `  --repo ${repoUrl} \\`,
    `  --bio ${JSON.stringify(bio)} \\`,
    `  --token "${ticker}" \\`,
    `  --kanbantic-vid ${vidArg} \\`,
    `  --kanbantic-network sepolia \\`,
    `  --kanbantic-evidence ${swarmTokenURI}`,
  ].join("\n");
}
