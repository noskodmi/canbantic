/**
 * `GET /api/discovered` — paginated list of repos surfaced by the
 * Apify discoverer Actor (see `apify/`).
 *
 * `POST /api/discovered/suggest` (SIWE-gated) — lets a wallet-holder
 * surface their own MCP repo without waiting for the Apify cron.
 *
 * Paging shape mirrors `/api/agents` — same `limit` clamp + cache.
 */

import { requireSiwe, SiweAuthError } from "../auth/siwe.js";
import { applyMigrations } from "../db/migrate.js";
import type { Env } from "../env.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function discoveredHandler(request: Request, env: Env): Promise<Response> {
  await applyMigrations(env.DB);
  const url = new URL(request.url);
  const limit = clampLimit(url.searchParams.get("limit"));

  const result = await env.DB.prepare(
    `SELECT repo_url, mcp_path, suggested_label, status, claimed_node, discovered_at
       FROM discovered_agents_apify
       ORDER BY discovered_at DESC
       LIMIT ?`,
  )
    .bind(limit)
    .all();

  return Response.json(
    { discovered: result.results, limit },
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

const REPO_URL_REGEX = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/;
const LABEL_REGEX = /^[a-z0-9-]{1,42}$/;

interface SuggestBody {
  repoUrl?: unknown;
  suggestedLabel?: unknown;
  mcpPath?: unknown;
}

/**
 * SIWE-gated insert. The caller's wallet address isn't stored — the
 * suggestion is anonymous on chain — but SIWE prevents drive-by spam
 * insertion from unauthenticated callers.
 *
 * Idempotent: a repeat POST with the same `repoUrl` updates the
 * `suggested_label` and `mcp_path` (admin can fix typos). Status
 * stays at whatever it was (`discovered` on first insert; preserved
 * on update so a `claimed` row doesn't get rewound).
 */
export async function discoveredSuggestHandler(request: Request, env: Env): Promise<Response> {
  await applyMigrations(env.DB);

  try {
    await requireSiwe(request, env);
  } catch (err) {
    if (err instanceof SiweAuthError) return err.toResponse();
    throw err;
  }

  let body: SuggestBody;
  try {
    body = (await request.json());
  } catch {
    return Response.json(
      { error: "invalid_json", message: "Body must be valid JSON." },
      { status: 400 },
    );
  }

  const repoUrl = typeof body.repoUrl === "string" ? body.repoUrl.trim() : "";
  const suggestedLabel =
    typeof body.suggestedLabel === "string" ? body.suggestedLabel.trim().toLowerCase() : "";
  const mcpPath = typeof body.mcpPath === "string" ? body.mcpPath.trim() : null;

  if (!REPO_URL_REGEX.test(repoUrl)) {
    return Response.json(
      { error: "invalid_request", message: "repoUrl must be https://github.com/<owner>/<repo>." },
      { status: 400 },
    );
  }
  if (!LABEL_REGEX.test(suggestedLabel)) {
    return Response.json(
      {
        error: "invalid_request",
        message:
          "suggestedLabel must be 1-42 chars, lowercase alphanumeric or dashes (matches ENS label rules).",
      },
      { status: 400 },
    );
  }

  // Strip optional trailing slash.
  const normalisedRepo = repoUrl.replace(/\/$/, "");
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    `INSERT INTO discovered_agents_apify
       (repo_url, mcp_path, suggested_label, status, claimed_node, discovered_at)
     VALUES (?, ?, ?, 'discovered', NULL, ?)
     ON CONFLICT(repo_url) DO UPDATE SET
       mcp_path = excluded.mcp_path,
       suggested_label = excluded.suggested_label`,
  )
    .bind(normalisedRepo, mcpPath, suggestedLabel, now)
    .run();

  const row = await env.DB.prepare(
    `SELECT repo_url, mcp_path, suggested_label, status, claimed_node, discovered_at
       FROM discovered_agents_apify
      WHERE repo_url = ?`,
  )
    .bind(normalisedRepo)
    .first();

  return Response.json({ ok: true, row });
}
