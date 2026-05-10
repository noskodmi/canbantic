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
 */
interface OrbitportResponse {
  // Variant A — `{ data: { random: hex } }`.
  data?: {
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
  if (obj.data) {
    for (const name of names) {
      const v = (obj.data as Record<string, unknown>)[name as string];
      if (typeof v === "string" && v.length > 0) return v;
    }
  }
  return null;
}

/**
 * Fetch + verify a fresh Orbitport cTRNG draw.
 *
 * @throws {OrbitportError} on network / shape / decoding failures.
 * @throws {OrbitportSignatureError} when the Ed25519 verification fails.
 */
export async function fetchOrbitportDraw(env: Env): Promise<OrbitportDraw> {
  const headers: Record<string, string> = { accept: "application/json" };
  const token = env.ORBITPORT_TOKEN;
  if (token !== undefined && token.length > 0) {
    headers["authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(env.ORBITPORT_URL, { method: "GET", headers });
  } catch (err) {
    throw new OrbitportError(`network error fetching Orbitport draw`, err);
  }
  if (!response.ok) {
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

  const drawHex = pickField(payload, "random", "draw", "message");
  const signatureHex = pickField(payload, "signature");
  const responsePubkeyHex = pickField(payload, "publicKey", "pubkey");

  if (drawHex === null) {
    throw new OrbitportError(`Orbitport response missing draw bytes`);
  }
  if (signatureHex === null) {
    throw new OrbitportError(`Orbitport response missing signature`);
  }

  // Draw must be exactly 32 bytes — that's the size BountyBoard's
  // `finalizeFairClaim` expects for `ctrngDraw` (bytes32). If Orbitport
  // ever returns a different size we want to fail loud at this layer
  // rather than at viem's calldata encoder.
  const draw = hexToBytes(drawHex, 32);
  const signature = hexToBytes(signatureHex, 64);

  // Pin the pubkey to the env value (the trust anchor). If the response
  // also includes a pubkey, sanity-check that it matches — a mismatch
  // means the upstream service rotated keys without our config catching
  // up, which we treat as a verification failure rather than silently
  // trusting the new key.
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

  const tsRaw = payload.timestamp ?? payload.ts ?? payload.data?.timestamp;
  const timestamp = typeof tsRaw === "number" ? tsRaw : Math.floor(Date.now() / 1000);

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
