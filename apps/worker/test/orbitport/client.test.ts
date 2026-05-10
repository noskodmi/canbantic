import { ed25519 } from "@noble/curves/ed25519";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OrbitportError,
  OrbitportSignatureError,
  fetchOrbitportDraw,
} from "../../src/orbitport/client.js";

function bytesToHex(bytes: Uint8Array): string {
  let out = "0x";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

// Deterministic 32-byte seed → fixed Ed25519 keypair so the test is
// reproducible. Numbers chosen to be non-zero / non-identity to avoid
// any zero-special edge cases.
const SEED = new Uint8Array(32).fill(7);
const PUBKEY = ed25519.getPublicKey(SEED);
const PUBKEY_HEX = bytesToHex(PUBKEY);

const DRAW = new Uint8Array(32).map((_v, i) => (i * 11) & 0xff);
const DRAW_HEX = bytesToHex(DRAW);
const SIGNATURE = ed25519.sign(DRAW, SEED);
const SIGNATURE_HEX = bytesToHex(SIGNATURE);

const BASE_ENV = {
  DB: undefined as never,
  INDEXER: undefined as never,
  SEPOLIA_RPC: "https://example.com/rpc",
  SEPOLIA_CHAIN_ID: "11155111",
  INDEXER_CHUNK_BLOCKS: "9500",
  ORBITPORT_URL: "https://orbitport.example.com/v1/draw",
  ORBITPORT_PUBKEY: PUBKEY_HEX,
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchOrbitportDraw", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns verified draw bytes when the Ed25519 signature checks out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            data: { random: DRAW_HEX },
            signature: SIGNATURE_HEX,
            timestamp: 1_715_000_000,
          }),
        ),
      ),
    );

    const result = await fetchOrbitportDraw(BASE_ENV);

    expect(Array.from(result.draw)).toEqual(Array.from(DRAW));
    expect(Array.from(result.signature)).toEqual(Array.from(SIGNATURE));
    expect(Array.from(result.publicKey)).toEqual(Array.from(PUBKEY));
    expect(result.timestamp).toBe(1_715_000_000);
  });

  it("accepts a top-level `random` field (Variant B envelope)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            random: DRAW_HEX,
            signature: SIGNATURE_HEX,
          }),
        ),
      ),
    );

    const result = await fetchOrbitportDraw(BASE_ENV);
    expect(result.draw.length).toBe(32);
    expect(result.signature.length).toBe(64);
    // Auto-stamped timestamp ≈ now.
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it("throws OrbitportSignatureError when the signature is tampered", async () => {
    const tampered = new Uint8Array(SIGNATURE);
    tampered[0] = (tampered[0] ?? 0) ^ 0xff;
    const tamperedHex = bytesToHex(tampered);

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            data: { random: DRAW_HEX },
            signature: tamperedHex,
          }),
        ),
      ),
    );

    await expect(fetchOrbitportDraw(BASE_ENV)).rejects.toBeInstanceOf(OrbitportSignatureError);
  });

  it("throws OrbitportSignatureError when the draw bytes don't match the signed message", async () => {
    const wrongDraw = new Uint8Array(DRAW);
    wrongDraw[0] = (wrongDraw[0] ?? 0) ^ 0xff;

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            data: { random: bytesToHex(wrongDraw) },
            signature: SIGNATURE_HEX,
          }),
        ),
      ),
    );

    await expect(fetchOrbitportDraw(BASE_ENV)).rejects.toBeInstanceOf(OrbitportSignatureError);
  });

  it("throws OrbitportSignatureError when the response pubkey doesn't match the pinned key", async () => {
    const otherPubkey = ed25519.getPublicKey(new Uint8Array(32).fill(9));
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            data: { random: DRAW_HEX },
            signature: SIGNATURE_HEX,
            publicKey: bytesToHex(otherPubkey),
          }),
        ),
      ),
    );

    await expect(fetchOrbitportDraw(BASE_ENV)).rejects.toBeInstanceOf(OrbitportSignatureError);
  });

  it("throws OrbitportError on missing draw field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse({ signature: SIGNATURE_HEX }))),
    );

    await expect(fetchOrbitportDraw(BASE_ENV)).rejects.toBeInstanceOf(OrbitportError);
  });

  it("throws OrbitportError on non-200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("nope", { status: 503 }))),
    );

    await expect(fetchOrbitportDraw(BASE_ENV)).rejects.toBeInstanceOf(OrbitportError);
  });

  it("forwards the bearer token when ORBITPORT_TOKEN is set", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          data: { random: DRAW_HEX },
          signature: SIGNATURE_HEX,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await fetchOrbitportDraw({ ...BASE_ENV, ORBITPORT_TOKEN: "secret-token" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calls = fetchSpy.mock.calls as unknown as [string, RequestInit?][];
    const init = calls[0]?.[1];
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.["authorization"]).toBe("Bearer secret-token");
  });
});
