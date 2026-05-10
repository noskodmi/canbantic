/**
 * Auto-claim matcher — wired into the indexer DO alarm.
 *
 * Scans for new `Open` bounties whose `capability` matches one of
 * the capabilities listed on a deployer-custodian agent (an agent
 * whose `agents.owner` equals the wallet derived from
 * `WORKER_DEPLOYER_PRIVATE_KEY`). Fires the existing auto-run
 * pipeline against the first match by invoking
 * `agentAutoRunHandler` with a synthetic Request — same code path
 * as a manual `curl POST /api/agent/auto-run`, no SIWE.
 *
 * Picks at most ONE bounty per tick to keep the DO alarm bounded
 * (auto-run waits up to 30s for the claim tx to surface in D1).
 * Multiple matches drain across consecutive ~5s ticks.
 */

import { type Hex } from "viem";

import type { Env } from "./env.js";
import { agentAutoRunHandler } from "./api/agent-run.js";

interface DeployerAgent {
  node: string;
  capabilities: string;
}

interface OpenBounty {
  id: number;
  capability: string;
}

function tokenize(csv: string): string[] {
  return csv
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
}

function bountyMatchesAgent(bountyCap: string, agentCaps: string[]): boolean {
  // Empty capability filter on a bounty means "any agent" — match
  // unconditionally. Otherwise the bounty's capability string must
  // appear in the agent's capability set OR be a substring of any
  // single agent capability (forgiving CSV variations).
  const cap = bountyCap.trim().toLowerCase();
  if (cap.length === 0) return true;
  if (agentCaps.includes(cap)) return true;
  return agentCaps.some((agentCap) => agentCap.includes(cap) || cap.includes(agentCap));
}

export async function runAutoClaimMatcher(env: Env): Promise<void> {
  const pk = env.WORKER_DEPLOYER_PRIVATE_KEY;
  if (pk === undefined || pk.length === 0) return;

  const { privateKeyToAccount } = await import("viem/accounts");
  const deployerAddress = privateKeyToAccount(pk as Hex).address.toLowerCase();

  const agentsResult = await env.DB.prepare(
    "SELECT node, capabilities FROM agents WHERE LOWER(owner) = ?",
  )
    .bind(deployerAddress)
    .all<DeployerAgent>();
  const agents = agentsResult.results;
  if (agents.length === 0) return;

  // Two passes: first the Open-and-unclaimed queue, then bounties
  // we already claimed but haven't submitted a proof for yet (the
  // claim tx may have outraced the indexer, leaving a ticked-out
  // auto-run that never reached the run phase). For each bounty we
  // call agentAutoRunHandler — the handler is idempotent on status
  // (skips claim if Claimed already, runs the work loop, submits).
  const agentNodes = agents.map((a) => a.node.toLowerCase());
  const placeholders = agentNodes.map(() => "?").join(",");
  const claimedByUs = await env.DB.prepare(
    `SELECT id, capability
       FROM bounties
      WHERE status = 'Claimed'
        AND LOWER(claimer_node) IN (${placeholders})
        AND COALESCE(submission_ref, '') = ''
      ORDER BY created_at_block ASC
      LIMIT 10`,
  )
    .bind(...agentNodes)
    .all<OpenBounty>();

  const openResult = await env.DB.prepare(
    `SELECT id, capability
       FROM bounties
      WHERE status = 'Open'
        AND claim_window_blocks = 0
      ORDER BY created_at_block ASC
      LIMIT 25`,
  ).all<OpenBounty>();

  const openBounties = [...claimedByUs.results, ...openResult.results];
  if (openBounties.length === 0) return;

  // Pragmatic match policy: if there's only one deployer-custodian agent,
  // it claims everything (any Open instant-claim bounty). With multiple
  // agents, we fall back to capability-tag matching. This unblocks the
  // demo where noskodmi was registered with meta-capabilities
  // (`registry,owner,demo`) that don't overlap with task tags like
  // "research" or "security advisor".
  const onlyAgent: DeployerAgent | null = agents.length === 1 ? (agents[0] ?? null) : null;

  for (const bounty of openBounties) {
    let matchedAgent: DeployerAgent | null = null;
    if (onlyAgent !== null) {
      matchedAgent = onlyAgent;
    } else {
      for (const agent of agents) {
        const agentCaps = tokenize(agent.capabilities);
        if (bountyMatchesAgent(bounty.capability, agentCaps)) {
          matchedAgent = agent;
          break;
        }
      }
    }
    if (matchedAgent === null) continue;
    const agent = matchedAgent;

    console.log("auto-claim: matched bounty to agent — firing auto-run", {
      bountyId: bounty.id,
      agentNode: agent.node,
    });

    // Synthetic POST so we reuse the exact handler the public
    // /api/agent/auto-run endpoint runs. The handler does its own
    // claim → wait-for-indexer → run → submit, so we just await it.
    const req = new Request("https://internal/api/agent/auto-run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentNode: agent.node, bountyId: bounty.id }),
    });
    const response = await agentAutoRunHandler(req, env);
    if (!response.ok) {
      const detail = await response.text().catch(() => "<unreadable>");
      console.warn("auto-claim: auto-run returned non-OK", {
        bountyId: bounty.id,
        status: response.status,
        detail: detail.slice(0, 200),
      });
    }

    // Bounded to one per tick. Return without trying more matches.
    return;
  }
}
