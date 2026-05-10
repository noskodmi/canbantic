/**
 * Cross-stream API contract between `apps/web` and `apps/worker`.
 *
 * The worker (Phase 2A+) is the source of truth for these shapes — it
 * produces JSON via `Response.json(...)`. Web consumers import these types
 * to stay aligned. Field names are snake_case to match the worker's SQL
 * columns; we don't transform on read.
 */

export interface StatusResponse {
  chainId: number;
  lastBlock: number;
  contracts: Record<string, string>;
  ens: {
    rootName: string;
    rootNamehash: string;
  };
}

export interface AgentSummary {
  node: string;
  parent: string;
  owner: string;
  label: string;
  mcp_endpoint: string;
  capabilities: string;
  profile_ref: string | null;
  registered_at_block: number;
  registered_at_ts: number;
  reputation_score: number;
  reputation_count: number;
}

export interface AgentListResponse {
  agents: AgentSummary[];
  limit: number;
}

export interface BountySummary {
  id: string;
  poster: string;
  capability: string;
  /** Wei as decimal string — bigint-safe transport. */
  reward: string;
  description_ref: string;
  expires_at: number;
  claim_window_blocks: number;
  /**
   * Block at which the commit window opened. Together with
   * `claim_window_blocks` this lets the UI show whether the window
   * has closed, even before the indexer picks up `BountyClaimFinalized`.
   * Always present on read but typed as nullable to keep older snapshots
   * (pre-Phase 7) deserializing cleanly.
   */
  claim_window_start_block: number | null;
  status: string;
  claimer_node: string | null;
  claimer_address: string | null;
  workspace_node: string;
  arbiter_council: string;
  created_at_block: number;
  created_at_ts: number;
  resolved_at_block: number | null;
}

export interface BountyListResponse {
  bounties: BountySummary[];
  limit: number;
}

/**
 * SpaceComputer Orbitport cTRNG draw — what the worker stores in
 * `orbitport_draws` and what `/api/orbitport/last-draw` returns under
 * `last`. Hex strings are 0x-prefixed lowercase. `used_for_bounty_id` is
 * non-null only after the worker submits a `finalizeFairClaim` tx using
 * this draw.
 */
export interface OrbitportDrawSummary {
  id: number;
  draw_hex: string;
  signature_hex: string;
  pubkey_hex: string;
  /** Unix seconds. */
  ts: number;
  used_for_bounty_id: number | null;
}

export interface OrbitportLastDrawResponse {
  last: OrbitportDrawSummary | null;
}

/**
 * Apify-discovered repository surfaced via the GitHub-discovery Actor.
 * Lifecycle: `discovered` (just observed by the Actor) → `claimed`
 * (its suggested label has been registered on Kanbantic and the row
 * carries the resulting `claimed_node`) → `rejected` (manual triage).
 */
export interface DiscoveredAgentSummary {
  repo_url: string;
  mcp_path: string | null;
  suggested_label: string;
  status: "discovered" | "claimed" | "rejected";
  claimed_node: string | null;
  /** Unix seconds — when the Actor first observed this repo. */
  discovered_at: number;
}

export interface DiscoveredAgentsResponse {
  discovered: DiscoveredAgentSummary[];
  limit: number;
}
