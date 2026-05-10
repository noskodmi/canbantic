/**
 * @kanbantic/swarm-verified-fetch
 *
 * Verified fetch primitive for Ethereum Swarm.
 *
 * Swarm content references are BMT (Binary Merkle Tree) keccak256 root hashes.
 * A "verified fetch" pulls bytes from a Swarm gateway, recomputes the BMT root
 * locally, and compares it against the requested reference. On match, the bytes
 * are returned. On mismatch — which means the gateway tampered with or
 * misdelivered the payload — an `IntegrityError` is thrown.
 *
 * v0.1 scope: single-chunk payloads only (length ≤ 4096 bytes), which covers
 * Kanbantic's small JSON proof bundles. Multi-chunk BMT (the binary tree of
 * 4096-byte chunks) is a v0.2 follow-up; today it throws an explicit error.
 */

import { keccak_256 } from "@noble/hashes/sha3";

/** Default Swarm gateway. Returns raw bytes for a given BMT reference. */
export const DEFAULT_GATEWAY = "https://api.gateway.ethswarm.org/bzz/";

/** Maximum chunk size in bytes for the Swarm BMT scheme. */
export const SWARM_CHUNK_SIZE = 4096;

/** Length of the span prefix prepended to a chunk before hashing (8 bytes, LE). */
export const SWARM_SPAN_SIZE = 8;

/** Segment size of the per-chunk binary Merkle tree (32 bytes). */
export const SWARM_SEGMENT_SIZE = 32;

export interface VerifiedFetchOptions {
  /** Gateway base URL. Trailing slash is required. Defaults to DEFAULT_GATEWAY. */
  gateway?: string;
  /** Optional AbortSignal to cancel the in-flight fetch. */
  signal?: AbortSignal;
}

/**
 * Thrown when a gateway returns bytes whose BMT root does not match the
 * requested reference. Indicates the bytes are NOT trustworthy.
 */
export class IntegrityError extends Error {
  override readonly name = "IntegrityError";
  readonly expected: string;
  readonly actual: string;

  constructor(expected: string, actual: string) {
    super(`Swarm integrity check failed: expected BMT root ${expected}, got ${actual}`);
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * Compute the BMT keccak256 root of a single Swarm chunk.
 *
 * The Swarm chunk address is:
 *   keccak256( span (8 bytes LE length) || BMT_root(payload_padded_to_4096) )
 *
 * Where `BMT_root` is the binary Merkle tree (BMT) hash of the 4096-byte
 * payload split into 128 segments of 32 bytes each, with pairwise keccak256
 * up the tree (7 levels) yielding a 32-byte root. The final chunk hash adds
 * the 8-byte span and hashes once more.
 *
 * For payloads with `length > 4096`, the full Swarm content reference is the
 * root of a *higher-level* BMT built from chunk hashes. v0.1 does NOT
 * implement that — it throws.
 *
 * @param bytes Raw payload bytes (length must be ≤ 4096 in v0.1).
 * @returns 32-byte BMT chunk hash as a Uint8Array.
 */
export function bmtRoot(bytes: Uint8Array): Uint8Array {
  if (bytes.length > SWARM_CHUNK_SIZE) {
    throw new Error(
      `multi-chunk BMT not yet implemented in v0.1 (received ${String(bytes.length)} bytes; max ${String(SWARM_CHUNK_SIZE)}). See https://github.com/noskodmi/kanbantic for v0.2 status.`,
    );
  }

  // Span: 8-byte little-endian length of the actual (unpadded) payload.
  const span = new Uint8Array(SWARM_SPAN_SIZE);
  let len = bytes.length;
  for (let i = 0; i < SWARM_SPAN_SIZE; i++) {
    span[i] = len & 0xff;
    len = Math.floor(len / 256);
  }

  // Payload padded with zeros to SWARM_CHUNK_SIZE.
  const padded = new Uint8Array(SWARM_CHUNK_SIZE);
  padded.set(bytes, 0);

  // Build the binary Merkle tree over 32-byte segments. Each level halves
  // the buffer by hashing pairs (keccak256(left || right)).
  let level = padded;
  while (level.length > SWARM_SEGMENT_SIZE) {
    const next = new Uint8Array(level.length / 2);
    for (let offset = 0; offset < level.length; offset += SWARM_SEGMENT_SIZE * 2) {
      const pair = level.subarray(offset, offset + SWARM_SEGMENT_SIZE * 2);
      const hash = keccak_256(pair);
      next.set(hash, offset / 2);
    }
    level = next;
  }
  const bmtTreeRoot = level; // 32 bytes

  // Final chunk hash: keccak256(span || bmtTreeRoot).
  const finalInput = new Uint8Array(SWARM_SPAN_SIZE + SWARM_SEGMENT_SIZE);
  finalInput.set(span, 0);
  finalInput.set(bmtTreeRoot, SWARM_SPAN_SIZE);
  return keccak_256(finalInput);
}

/**
 * Hex-encode a byte array as a lowercase string WITHOUT a `0x` prefix
 * (Swarm references are conventionally written without `0x`).
 */
export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * Decode a hex string into a Uint8Array. Accepts an optional `0x` prefix and
 * is case-insensitive.
 */
export function hexToBytes(hex: string): Uint8Array {
  const stripped = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (stripped.length % 2 !== 0) {
    throw new Error(`invalid hex string: odd length (${String(stripped.length)})`);
  }
  const out = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byteStr = stripped.slice(i * 2, i * 2 + 2);
    const parsed = parseInt(byteStr, 16);
    if (Number.isNaN(parsed)) {
      throw new Error(`invalid hex string at offset ${String(i * 2)}: "${byteStr}"`);
    }
    out[i] = parsed;
  }
  return out;
}

/**
 * Normalize a user-supplied reference string to the canonical form used for
 * comparison: lowercase hex without `0x` prefix.
 */
function normalizeReference(ref: string): string {
  const stripped = ref.startsWith("0x") || ref.startsWith("0X") ? ref.slice(2) : ref;
  return stripped.toLowerCase();
}

/**
 * Fetch a Swarm reference from a gateway and verify integrity.
 *
 * @param reference Hex-encoded BMT root. May be prefixed with `0x` or not.
 * @param options.gateway Gateway base URL. Must end with a slash. Defaults to
 *   the public ethswarm.org gateway.
 * @param options.signal Optional AbortSignal forwarded to the underlying fetch.
 * @returns The verified bytes.
 * @throws {IntegrityError} If the BMT root of the returned bytes does not
 *   equal the requested reference.
 * @throws {Error} If the HTTP response is not OK, or for multi-chunk payloads
 *   in v0.1.
 */
export async function verifiedFetch(
  reference: string,
  options: VerifiedFetchOptions = {},
): Promise<Uint8Array> {
  const gateway = options.gateway ?? DEFAULT_GATEWAY;
  const expected = normalizeReference(reference);

  if (!/^[0-9a-f]+$/.test(expected)) {
    throw new Error(`invalid Swarm reference (non-hex): "${reference}"`);
  }

  const url = `${gateway}${expected}`;
  const init: RequestInit = {};
  if (options.signal !== undefined) {
    init.signal = options.signal;
  }
  const res = await fetch(url, init);

  if (!res.ok) {
    throw new Error(
      `Swarm gateway returned HTTP ${String(res.status)} ${res.statusText} for ${url}`,
    );
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  const root = bmtRoot(buf);
  const actual = bytesToHex(root);

  if (actual !== expected) {
    throw new IntegrityError(expected, actual);
  }

  return buf;
}
