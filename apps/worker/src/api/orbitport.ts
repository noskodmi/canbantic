/**
 * GET /api/orbitport/last-draw
 *
 * Returns the most recent Orbitport cTRNG draw the worker has fetched +
 * verified. Lets a judge cross-verify the on-chain `finalizeFairClaim`
 * tx against a real Orbitport signature without needing direct
 * Orbitport access.
 *
 * Cold-start (no draws yet) returns `{ last: null }` with a 200 — empty
 * is a valid steady state, not an error.
 */

import type { OrbitportDrawSummary, OrbitportLastDrawResponse } from "@kanbantic/shared";

import { applyMigrations } from "../db/migrate.js";
import type { Env } from "../env.js";

type DrawRow = OrbitportDrawSummary;

export async function orbitportLastDrawHandler(_request: Request, env: Env): Promise<Response> {
  await applyMigrations(env.DB);

  const row = await env.DB.prepare(
    `SELECT id, draw_hex, signature_hex, pubkey_hex, ts, used_for_bounty_id
       FROM orbitport_draws
      ORDER BY id DESC
      LIMIT 1`,
  ).first<DrawRow>();

  const body: OrbitportLastDrawResponse = { last: row ?? null };

  return Response.json(body, {
    headers: {
      "cache-control": "public, max-age=5, stale-while-revalidate=30",
    },
  });
}
