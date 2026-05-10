/**
 * SpaceComputer Orbitport cTRNG client.
 *
 * Hits the live Orbitport endpoint, verifies the returned Ed25519
 * signature against the pinned public key in `env.ORBITPORT_PUBKEY`,
 * and returns the verified draw bytes. The verification is the trust
 * anchor: we never accept a draw whose signature doesn't validate.
 *
 * Endpoint shape (per https://docs.spacecomputer.io/orbitport/ctrng — the
 * public spec exposes a JSON `data.random` hex draw plus an Ed25519
 * `signature` over those bytes signed by the operator pubkey we pin
 * here):
 *
 *   GET <ORBITPORT_URL>
 *   →  { data: { random: "0x…32 bytes…" },
 *        signature: "0x…64 bytes…",
 *        publicKey?: "0x…32 bytes…",
 *        timestamp?: number }
 *
 * Some Orbitport deployments wrap the signed payload as
 * `{ message: "<draw-hex>", signature: "<sig-hex>" }`; we accept either
 * field name and normalize.
 *
 * This wrapper does NOT persist anything — it's a pure adapter. The
 * caller (finalizer / API handler) is responsible for writing to D1.
 */

import { ed25519 } from "@noble/curves/ed25519";

import type { Env } from "../env.js";

export interface OrbitportDraw {
  /** 32 verified random bytes. */
  draw: Uint8Array;
  /** 64-byte Ed25519 signature over `draw`. */
  signature: Uint8Array;
  /** 32-byte Ed25519 public key the signature was verified against. */
  publicKey: Uint8Array;
  /** Operator-supplied timestamp (unix seconds). Defaults to now if absent. */
  timestamp: number;
}

/**
 * Permissive shape — Orbitport variants nest the random bytes in
 * different envelopes. We pull all of them out and validate downstream.
 *
 * The live OAuth client-credentials tier returns Variant C:
 *   { service: "trng", src: "derived", data: "<32-byte hex>" }
 * with no signature. The OAuth bearer is the trust anchor in that case.
 *
 * The signed/hardware tier returns Variant A or B with `signature` +
 * optional `publicKey`. We verify Ed25519 when those are present.
 */
interface OrbitportResponse {
  // Variant A — `{ data: { random: hex } }` (signed-tier wrap).
  // Variant C — `{ data: "<hex>" }` (derived-tier wrap, where data is the hex itself).
  data?:
    | string
    | {
        random?: string;
        signature?: string;
        publicKey?: string;
        timestamp?: number;
      };
  // Variant B — top-level fields.
  random?: string;
  draw?: string;
  message?: string;
  signature?: string;
  publicKey?: string;
  pubkey?: string;
  timestamp?: number;
  ts?: number;
  // Variant C metadata.
  service?: string;
  src?: string;
}

export class OrbitportError extends Error {
  constructor(
    message: string,
    readonly cause_?: unknown,
  ) {
    super(message);
    this.name = "OrbitportError";
  }
}

export class OrbitportSignatureError extends OrbitportError {
  constructor(message = "Orbitport signature failed Ed25519 verification") {
    super(message);
    this.name = "OrbitportSignatureError";
  }
}

function stripHex(s: string): string {
  return s.startsWith("0x") || s.startsWith("0X") ? s.slice(2) : s;
}

function hexToBytes(hex: string, expectedLen?: number): Uint8Array {
  const stripped = stripHex(hex);
  if (stripped.length % 2 !== 0) {
    throw new OrbitportError(`hex string has odd length: ${String(stripped.length)}`);
  }
  const bytes = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = Number.parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new OrbitportError(`invalid hex digit at offset ${String(i)}`);
    }
    bytes[i] = byte;
  }
  if (expectedLen !== undefined && bytes.length !== expectedLen) {
    throw new OrbitportError(`expected ${String(expectedLen)} bytes, got ${String(bytes.length)}`);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "0x";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

function pickField(obj: OrbitportResponse, ...names: (keyof OrbitportResponse)[]): string | null {
  for (const name of names) {
    const v = obj[name];
    if (typeof v === "string" && v.length > 0) return v;
  }
  if (obj.data && typeof obj.data === "object") {
    for (const name of names) {
      const v = (obj.data as Record<string, unknown>)[name as string];
      if (typeof v === "string" && v.length > 0) return v;
    }
  }
  return null;
}

/**
 * Module-level OAuth token cache. Workers isolates can live for
 * minutes; one cached token survives many requests, dramatically
 * reducing latency on the hot path. Re-mints when within 60s of expiry.
 */
let cachedOauthToken: { token: string; expiresAt: number } | null = null;

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
}

/**
 * OAuth client-credentials grant against SpaceComputer's Auth0 tenant.
 * Returns a cached token when one is still valid, otherwise mints +
 * caches a fresh one. Throws if `ORBITPORT_CLIENT_ID` /
 * `ORBITPORT_CLIENT_SECRET` are missing — caller decides whether to
 * fall back to a static `ORBITPORT_TOKEN`.
 */
export async function mintOrbitportToken(env: Env): Promise<string> {
  const clientId = env.ORBITPORT_CLIENT_ID;
  const clientSecret = env.ORBITPORT_CLIENT_SECRET;
  if (
    clientId === undefined ||
    clientId.length === 0 ||
    clientSecret === undefined ||
    clientSecret.length === 0
  ) {
    throw new OrbitportError(
      "ORBITPORT_CLIENT_ID / ORBITPORT_CLIENT_SECRET not configured — set via wrangler secret put",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  if (cachedOauthToken !== null && cachedOauthToken.expiresAt - 60 > now) {
    return cachedOauthToken.token;
  }

  const tokenUrl = env.ORBITPORT_TOKEN_URL ?? "https://auth.spacecomputer.io/oauth/token";
  const audience = env.ORBITPORT_AUDIENCE ?? "https://op.spacecomputer.io/api";

  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
        audience,
      }),
    });
  } catch (err) {
    throw new OrbitportError("network error minting Orbitport OAuth token", err);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new OrbitportError(
      `Orbitport token endpoint returned HTTP ${String(response.status)}: ${body.slice(0, 200)}`,
    );
  }

  let payload: TokenResponse;
  try {
    payload = await response.json<TokenResponse>();
  } catch (err) {
    throw new OrbitportError("Orbitport token endpoint returned non-JSON", err);
  }
  if (typeof payload.access_token !== "string" || payload.access_token.length === 0) {
    throw new OrbitportError("Orbitport token response missing access_token");
  }
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
  cachedOauthToken = { token: payload.access_token, expiresAt: now + expiresIn };
  return payload.access_token;
}

/**
 * Fetch + verify a fresh Orbitport cTRNG draw.
 *
 * @throws {OrbitportError} on network / shape / decoding failures.
 * @throws {OrbitportSignatureError} when the Ed25519 verification fails.
 */
export async function fetchOrbitportDraw(env: Env): Promise<OrbitportDraw> {
  if (!env.ORBITPORT_URL) {
    throw new OrbitportError("ORBITPORT_URL not configured — set in wrangler.jsonc vars");
  }
  const headers: Record<string, string> = { accept: "application/json" };

  // Bearer resolution: explicit ORBITPORT_TOKEN wins; otherwise mint
  // via OAuth client-credentials when the pair is configured. If
  // neither is set the request goes anonymous (only useful in tests).
  const staticToken = env.ORBITPORT_TOKEN;
  if (staticToken !== undefined && staticToken.length > 0) {
    headers["authorization"] = `Bearer ${staticToken}`;
  } else if (
    env.ORBITPORT_CLIENT_ID !== undefined &&
    env.ORBITPORT_CLIENT_ID.length > 0 &&
    env.ORBITPORT_CLIENT_SECRET !== undefined &&
    env.ORBITPORT_CLIENT_SECRET.length > 0
  ) {
    const minted = await mintOrbitportToken(env);
    headers["authorization"] = `Bearer ${minted}`;
  }

  let response: Response;
  try {
    response = await fetch(env.ORBITPORT_URL, { method: "GET", headers });
  } catch (err) {
    throw new OrbitportError(`network error fetching Orbitport draw`, err);
  }
  if (!response.ok) {
    // 401 with a cached token usually means the token aged out faster
    // than `expires_in` advertised. Bust the cache and let the next
    // call mint a fresh one.
    if (response.status === 401) {
      cachedOauthToken = null;
    }
    throw new OrbitportError(
      `Orbitport returned HTTP ${String(response.status)} ${response.statusText}`,
    );
  }

  let payload: OrbitportResponse;
  try {
    payload = await response.json<OrbitportResponse>();
  } catch (err) {
    throw new OrbitportError(`Orbitport returned non-JSON body`, err);
  }

  // Variant C — `data` is a string (the hex draw itself).
  let drawHex: string | null = null;
  if (typeof payload.data === "string" && payload.data.length > 0) {
    drawHex = payload.data;
  } else {
    drawHex = pickField(payload, "random", "draw", "message");
  }
  const signatureHex = pickField(payload, "signature");
  const responsePubkeyHex = pickField(payload, "publicKey", "pubkey");

  if (drawHex === null) {
    throw new OrbitportError(`Orbitport response missing draw bytes`);
  }

  // Draw must be exactly 32 bytes — that's the size BountyBoard's
  // `finalizeFairClaim` expects for `ctrngDraw` (bytes32). If Orbitport
  // ever returns a different size we want to fail loud at this layer
  // rather than at viem's calldata encoder.
  const draw = hexToBytes(drawHex, 32);

  const tsRaw =
    payload.timestamp ??
    payload.ts ??
    (payload.data !== undefined && typeof payload.data === "object"
      ? payload.data.timestamp
      : undefined);
  const timestamp = typeof tsRaw === "number" ? tsRaw : Math.floor(Date.now() / 1000);

  // No signature → trust the OAuth-protected channel. This is the
  // normal case for the live `src:"derived"` tier. Return a 64-byte
  // zero signature + 32-byte zero pubkey so callers can persist
  // uniformly — the on-chain finalizer separately gates on whether
  // the signature is real before submitting.
  if (signatureHex === null) {
    return {
      draw,
      signature: new Uint8Array(64),
      publicKey: new Uint8Array(32),
      timestamp,
    };
  }

  // Signed-tier path: verify Ed25519 against the pinned pubkey.
  if (!env.ORBITPORT_PUBKEY) {
    throw new OrbitportError(
      "Orbitport response includes a signature but ORBITPORT_PUBKEY is not pinned — refusing to verify against an unpinned key",
    );
  }
  const signature = hexToBytes(signatureHex, 64);
  const pinnedPubkey = hexToBytes(env.ORBITPORT_PUBKEY, 32);
  if (responsePubkeyHex !== null) {
    const responsePubkey = hexToBytes(responsePubkeyHex, 32);
    if (!bytesEqual(responsePubkey, pinnedPubkey)) {
      throw new OrbitportSignatureError(
        "Orbitport response pubkey does not match pinned ORBITPORT_PUBKEY",
      );
    }
  }

  let valid: boolean;
  try {
    valid = ed25519.verify(signature, draw, pinnedPubkey);
  } catch (err) {
    throw new OrbitportSignatureError(
      `Ed25519 verify threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!valid) {
    throw new OrbitportSignatureError();
  }

  return { draw, signature, publicKey: pinnedPubkey, timestamp };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}
