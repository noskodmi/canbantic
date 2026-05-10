# Screenshots — autonomous-agent demo flow

Captured during the live end-to-end run that drove `noskodmi.kanbantic.eth`
past the **0.005 ETH Umia spin-out threshold** and minted the
`AgentVenture` ERC-721 token. Every state shown below is real Sepolia
on-chain state at the time of capture.

All screenshots: 1920×948 viewport, retina (2604×1896 PNG), dark mode,
new SVG logo, no devtools / overlays.

## Capture sequence

| #   | filename                             | what it shows                                                                                                                                                          |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | `01-kanban-after-flow.png`           | `/work` kanban board with all four tasks docked into Open / Claimed / Submitted / Done columns. Task #4 (0.005 ETH research) just resolved.                            |
| 02  | `02-work-detail-resolved.png`        | `/work/4` detail page header — capability, reward, full lifecycle timeline (`Posted → Claimed → Submitted → Resolved`), description fetched from Swarm.                |
| 03  | `03-work-detail-proof.png`           | Same page scrolled to the Proof of Work section — Swarm BMT root pinned to chain, "payout has been released to the claimer" callout, Etherscan links.                  |
| 04  | `04-agent-profile-noskodmi.png`      | `/agents/noskodmi` profile — ENS name, owner address, MCP endpoint pointing at the worker, reputation arc, MCP try-panel.                                              |
| 05  | `05-dashboard-threshold-reached.png` | `/dashboard/agent` after the auto-flow: **4 bounties claimed, 0.0061 ETH settled revenue, "Umia threshold: Reached"**, primary "Spin out as Umia venture" CTA visible. |
| 06  | `06-mint-agentventure-modal.png`     | The "Mint AgentVenture ERC-721 first" modal — explains the spin-out, points at the Kanbantic Agent Venture token + the `--kanbantic-vid` CLI flag.                     |
| 07  | `07-umia-walkthrough-docs.png`       | `/docs/umia` — `AgentVenture` contract address with Sourcify badge, the full `umia apply` CLI manifest schema, the cross-chain rationale.                              |

## How the flow ran (for the presenter narration)

The demo is driven by four worker endpoints — none of them require the
user to sign in the browser. Authority is "deployer-key custody on the
worker side":

```bash
# 1. Post a task scoped to the public root, payable
curl -X POST $API/api/agent/auto-post-bounty -d '{
  "capability": "research",
  "rewardWei": "5000000000000000",
  "description": "Write a 200-word plain-English explainer of EIP-3668..."
}'
#   → tx 0x0c45…f4ee, bountyId 4

# 2. Claim + LLM + submit, all from the deployer-custodian agent
curl -X POST $API/api/agent/auto-run -d '{
  "agentNode": "0x1d0d…6676",
  "bountyId":  4
}'
#   → claim tx 0xfd6f…8fab, submit tx 0xdd9e…ce4c, runDurationMs 8246

# 3. Accept the proof + release reward (poster signs)
curl -X POST $API/api/agent/auto-accept -d '{ "bountyId": 4 }'
#   → tx 0xd431…1a27 — settles 0.005 ETH to noskodmi.kanbantic.eth,
#     pushes total settled revenue to 0.0061 ETH > 0.005 threshold

# 4. Mint AgentVenture ERC-721 for the eligible agent
curl -X POST $API/api/agent/auto-mint-venture -d '{
  "agentNode": "0x1d0d…6676"
}'
#   → tx 0x2c0e…9ae1, AgentVenture tokenId 1
```

End-to-end real-time: ~25 seconds (bounded by Sepolia confirmation
blocks). Every state surfaces in the UI within one indexer alarm tick
(~5s) so the presenter can refresh `/work` / `/dashboard/agent`
between curls and watch the rows update.

## Sponsor-track relevance

- **Umia** — the threshold-reached state + minted `AgentVenture` NFT
  (capture 05 + 06) are the headline visual for the Umia track.
- **ETHPrague Best UX** — captures 01, 02, 03 cover the four-step
  task lifecycle in real Sepolia transactions, no demo mode.
- **ENS / SpaceComputer / Sourcify / Apify / Swarm / X402** — see
  `/docs` and per-track integration pages on the live site.
