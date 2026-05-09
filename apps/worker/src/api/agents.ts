import { applyMigrations } from "../db/migrate.js";
import type { Env } from "../env.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function agentsHandler(request: Request, env: Env): Promise<Response> {
  await applyMigrations(env.DB);
  const url = new URL(request.url);
  const limit = clampLimit(url.searchParams.get("limit"));

  const result = await env.DB.prepare(
    `SELECT a.node, a.parent, a.owner, a.label, a.mcp_endpoint, a.capabilities, a.profile_ref,
            a.registered_at_block, a.registered_at_ts,
            COALESCE(r.score, 0) AS reputation_score,
            COALESCE(r.attestation_count, 0) AS reputation_count
       FROM agents a
       LEFT JOIN agent_reputation r ON r.node = a.node
       ORDER BY a.registered_at_block DESC
       LIMIT ?`,
  )
    .bind(limit)
    .all();

  return Response.json(
    { agents: result.results, limit },
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
