#!/usr/bin/env bash
# Verify all 5 Phase 1A contracts on Sourcify (full match).
#
# Reads addresses from packages/contracts/deployments/sepolia.json.
# Re-runnable: Sourcify accepts re-verification of identical bytecode.
#
# Requires: forge on PATH, jq.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_JSON="$REPO_ROOT/packages/contracts/deployments/sepolia.json"
CHAIN_ID=11155111

if [[ ! -f "$DEPLOY_JSON" ]]; then
  echo "ERROR: $DEPLOY_JSON not found. Did you run the deploy?" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required (brew install jq)." >&2
  exit 1
fi

cd "$REPO_ROOT/packages/contracts"

declare -a CONTRACTS=(
  "WorkspaceRegistry:src/WorkspaceRegistry.sol:WorkspaceRegistry"
  "AgentRegistry:src/AgentRegistry.sol:AgentRegistry"
  "BountyBoard:src/BountyBoard.sol:BountyBoard"
  "ReputationAttestor:src/ReputationAttestor.sol:ReputationAttestor"
  "ArbiterCouncil:src/ArbiterCouncil.sol:ArbiterCouncil"
)

for entry in "${CONTRACTS[@]}"; do
  IFS=':' read -r name path contractName <<< "$entry"
  addr=$(jq -r ".${name}" "$DEPLOY_JSON")
  if [[ -z "$addr" || "$addr" == "null" ]]; then
    echo "ERROR: no address for ${name} in $DEPLOY_JSON" >&2
    exit 1
  fi
  echo
  echo "=== Verifying ${name} at ${addr} ==="
  forge verify-contract \
    --verifier sourcify \
    --chain "$CHAIN_ID" \
    "$addr" \
    "${path}:${contractName}" \
    || { echo "verification failed for $name"; exit 1; }
done

echo
echo "All 5 contracts submitted to Sourcify."
echo "Inspect at:"
for entry in "${CONTRACTS[@]}"; do
  IFS=':' read -r name _ _ <<< "$entry"
  addr=$(jq -r ".${name}" "$DEPLOY_JSON")
  echo "  ${name}:  https://repo.sourcify.dev/server/contracts/full_match/${CHAIN_ID}/${addr}/"
done
