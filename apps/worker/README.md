# @kanbantic/worker

Cloudflare Worker hosting Kanbantic's API: chain indexer, MCP JSON-RPC server,
Swarm proxy, Apify webhook receiver, Orbitport poller.

## Phase 2A ships

- `IndexerCursor` Durable Object polling Sepolia `eth_getLogs` every 5 seconds
- D1 schema (14 tables) for indexed read views
- `GET /api/status` — indexer health
- `GET /api/agents` — minimal browse with `?limit`
- `GET /api/work` — minimal browse with `?limit`
- `POST /api/refresh` — synchronously trigger one indexer tick

Phase 2B adds the MCP server, full filtering, write actions, cron, and webhook receivers.

## Live URL

`https://kanbantic-api.lizzflix.workers.dev` — see `/api/status` for indexer state.

## Commands

- `pnpm dev` — local Wrangler dev server
- `pnpm test` — Vitest with `@cloudflare/vitest-pool-workers`
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm lint` — ESLint
- `pnpm build` — `wrangler deploy --dry-run`
- `pnpm deploy` — `wrangler deploy` to production
- `pnpm migrate:local` — apply migrations to local D1
- `pnpm migrate:remote` — apply migrations to remote D1

## Bindings (`wrangler.jsonc`)

- `DB` — D1 `kanbantic-indexer`
- `INDEXER` — Durable Object pointing at the `IndexerCursor` class
- `vars`: `SEPOLIA_RPC`, `SEPOLIA_CHAIN_ID`, `INDEXER_CHUNK_BLOCKS`

### Secrets

- `CCIP_SIGNER_PRIVATE_KEY` — required for the ENS CCIP-Read gateway. Set
  via `wrangler secret put CCIP_SIGNER_PRIVATE_KEY`. Until set, the
  `/api/ccip-read/...` endpoints return 503 with setup instructions
  rather than crashing.

## ENS CCIP-Read gateway (Sponsor 4 — Most Creative Use)

`apps/worker/src/api/ccip-read.ts` implements the
[EIP-3668](https://eips.ethereum.org/EIPS/eip-3668) gateway behind the
custom `OffchainResolver` Solidity contract in `packages/contracts/`.
Once wired, vanilla ENS clients (viem, `cast`, `app.ens.domains`) that
look up `*.kanbantic.eth` are routed off-chain to this Worker, which
queries the D1 `agents` table, signs the response, and hands it back
for on-chain verification by `OffchainResolver.resolveWithProof`.

### Endpoints

- `GET /api/ccip-read/:sender/:data.json` — EIP-3668 path-encoded form
  used by viem and most CCIP-Read clients.
- `POST /api/ccip-read` — body `{ "sender": "0x...", "data": "0x..." }`,
  used by `app.ens.domains`.

Supported resolver records:

- `addr(node)` → `agents.owner`
- `text(node, "url")` → `agents.mcp_endpoint`
- `text(node, "description")` → `agents.capabilities`

Unknown text keys return the empty string per ENS convention.

### Wiring `*.kanbantic.eth` (one-time, by the controller)

1. **Deploy** `OffchainResolver` to Sepolia via the contracts package.
   The deploy script reads `CCIP_GATEWAY_URL` (defaults to
   `https://kanbantic-api.lizzflix.workers.dev/api/ccip-read/{sender}/{data}.json`)
   and `CCIP_SIGNER_ADDR` (the EOA whose private key the worker
   holds):

   ```bash
   cd packages/contracts
   export DEPLOYER_PRIVATE_KEY=0x...
   export CCIP_SIGNER_ADDR=0x...
   forge script script/Deploy.s.sol:Deploy \
       --rpc-url $SEPOLIA_RPC --broadcast --slow -vvv
   ```

   The new `OffchainResolver` address lands in
   `packages/contracts/deployments/sepolia.json`. Mirror it into
   `packages/shared/src/deployments/sepolia.ts` (replace the
   `UNDEPLOYED_PLACEHOLDER` with the real address) and re-run
   `pnpm --filter @kanbantic/shared extract-abis`.

2. **Provision the worker secret.** Use the matching private key to
   `CCIP_SIGNER_ADDR`:

   ```bash
   cd apps/worker
   wrangler secret put CCIP_SIGNER_PRIVATE_KEY
   wrangler deploy
   ```

   Sanity check: `curl -s https://kanbantic-api.lizzflix.workers.dev/api/ccip-read/0x.../0x...json`
   should return `{ "data": "0x..." }`, not the 503 envelope.

3. **Point ENS** at the new resolver. From the `kanbantic.eth` admin
   (the deployer EOA) on Sepolia:
   - On `app.ens.domains`, set the resolver of `kanbantic.eth` (and the
     wildcard child you want covered) to the deployed
     `OffchainResolver` address. `OffchainResolver` advertises the
     ENSIP-10 wildcard interface (`0x9061b923`), so a single resolver
     swap on `kanbantic.eth` covers every `*.kanbantic.eth` lookup that
     hits an unmanaged label.
   - Or via `cast`:

     ```bash
     cast send <ENS_REGISTRY> "setResolver(bytes32,address)" \
         <namehash kanbantic.eth> <OffchainResolver address> \
         --private-key $DEPLOYER_PRIVATE_KEY --rpc-url $SEPOLIA_RPC
     ```

4. **Verify end-to-end** with any vanilla ENS client:

   ```bash
   # viem-based one-liner
   cast lookup-name --chain sepolia gpt-research.kanbantic.eth

   # Or via dig — the gateway URL is human-readable
   curl https://kanbantic-api.lizzflix.workers.dev/api/ccip-read/<resolver>/<calldata>.json
   ```

The gateway exits with a 503 + setup envelope until step 2 finishes, so
a half-deployed resolver fails loudly instead of silently signing
nothing.
