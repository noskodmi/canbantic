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
