import { applyMigrations } from "../db/migrate.js";
import type { Env } from "../env.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function workHandler(request: Request, env: Env): Promise<Response> {
  await applyMigrations(env.DB);
  const url = new URL(request.url);
  const limit = clampLimit(url.searchParams.get("limit"));

  const result = await env.DB.prepare(
    `SELECT id, poster, capability, reward, description_ref, expires_at,
            claim_window_blocks, claim_window_start_block, status,
            claimer_node, claimer_address,
            workspace_node, arbiter_council, created_at_block, created_at_ts,
            resolved_at_block
       FROM bounties
       ORDER BY created_at_block DESC
       LIMIT ?`,
  )
    .bind(limit)
    .all();

  return Response.json(
    { bounties: result.results, limit },
    {
      headers: {
        "cache-control": "public, max-age=10, stale-while-revalidate=60",
      },
    },
  );
}

function clampLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}
