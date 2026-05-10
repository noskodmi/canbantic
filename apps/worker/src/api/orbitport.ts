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
import { bytesToHex, fetchOrbitportDraw, OrbitportError } from "../orbitport/client.js";

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

/**
 * GET /api/orbitport/live-draw
 *
 * Performs a live OAuth client-credentials handshake against
 * SpaceComputer's Auth0 tenant and pulls a fresh cTRNG draw. Lets
 * judges verify the integration works without waiting for a fair-claim
 * window to close. Read-only — does not persist to D1.
 *
 * The token is cached at module level inside the worker isolate, so
 * repeated hits in the same isolate don't re-mint.
 */
export async function orbitportLiveDrawHandler(_request: Request, env: Env): Promise<Response> {
  let draw: Awaited<ReturnType<typeof fetchOrbitportDraw>>;
  try {
    draw = await fetchOrbitportDraw(env);
  } catch (err) {
    const message = err instanceof OrbitportError ? err.message : String(err);
    return Response.json({ error: "orbitport_unavailable", message }, { status: 502 });
  }

  const sigZero = draw.signature.every((b) => b === 0);
  return Response.json(
    {
      draw_hex: bytesToHex(draw.draw),
      signed: !sigZero,
      signature_hex: sigZero ? null : bytesToHex(draw.signature),
      pubkey_hex: sigZero ? null : bytesToHex(draw.publicKey),
      timestamp: draw.timestamp,
      provider: "spacecomputer-orbitport",
      auth: "oauth-client-credentials",
    },
    {
      // Don't cache — judges should see a fresh draw on every load.
      headers: { "cache-control": "no-store" },
    },
  );
}
