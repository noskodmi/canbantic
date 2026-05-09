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
