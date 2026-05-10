/**
 * CCIP-Read gateway for Kanbantic's OffchainResolver (EIP-3668).
 *
 * Flow per EIP-3668:
 *   1. ENS client calls `resolver.resolve(name, data)` on-chain.
 *   2. Resolver reverts with `OffchainLookup(sender, urls, callData, ...)`.
 *   3. Client follows one of the URLs — substituting `{sender}` and `{data}`
 *      — and either GETs (path-encoded) or POSTs `{sender, data}` JSON.
 *   4. Gateway returns `{ data: 0x... }` containing
 *      `abi.encode(result, expires, signature)`.
 *   5. Client calls `resolver.resolveWithProof(response, extraData)`,
 *      which verifies the signer + expiry and returns `result`.
 *
 * The gateway speaks both URL-encoded GET and JSON POST. It supports the
 * minimum surface needed for vanilla ENS clients to resolve a Kanbantic
 * agent:
 *   - `addr(bytes32)`            → agent owner address
 *   - `text(bytes32, "url")`     → agent.mcp_endpoint
 *   - `text(bytes32, "description")` → agent.capabilities
 *
 * The gateway is gated behind `CCIP_SIGNER_PRIVATE_KEY`. If unset (e.g.
 * a fresh deploy that hasn't run `wrangler secret put` yet) it returns
 * a 503 with setup instructions instead of crashing.
 *
 * The signing scheme matches OffchainResolver.sol:
 *   keccak256(0x1900 ‖ resolverAddr ‖ uint64(expires)
 *           ‖ keccak256(callData) ‖ keccak256(result))
 * signed via secp256k1 (no Ethereum-prefix). The matching public address
 * must be the `signer` constructor arg of the deployed OffchainResolver.
 */

import {
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  encodePacked,
  getAddress,
  isAddress,
  isHex,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { sign } from "viem/accounts";

import { applyMigrations } from "../db/migrate.js";
import type { Env } from "../env.js";
import type { RouteContext } from "../router.js";

/**
 * Subset of the OffchainResolver ABI the gateway needs. Hand-rolled
 * (rather than imported from `@kanbantic/shared`) so the worker has no
 * runtime dependency on the contract artifacts; the same selectors
 * appear in the ABI-extracted file for type-checking parity.
 */
const RESOLVE_ABI = [
  {
    type: "function",
    name: "resolve",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "bytes" },
      { name: "data", type: "bytes" },
    ],
    outputs: [{ name: "", type: "bytes" }],
  },
] as const;

/** Standard ENS resolver functions the gateway can answer. */
const RESOLVER_FUNCTIONS_ABI = [
  {
    type: "function",
    name: "addr",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "text",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

const DEFAULT_TTL_SECONDS = 300;
const TTL_BOUNDS = { min: 60, max: 60 * 60 } as const;

interface AgentRow {
  owner: string;
  mcp_endpoint: string;
  capabilities: string;
}

/**
 * Handler registered against the path pattern
 * `/api/ccip-read/:sender/:data` (and POST-body equivalent). Either method
 * is acceptable per EIP-3668 — most viem clients GET, app.ens.domains
 * POSTs.
 */
export async function ccipReadHandler(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  routeCtx: RouteContext,
): Promise<Response> {
  const privateKey = normalizePrivateKey(env.CCIP_SIGNER_PRIVATE_KEY);
  if (!privateKey) {
    return jsonError(
      503,
      "ccip_signer_unconfigured",
      "Set CCIP_SIGNER_PRIVATE_KEY via `wrangler secret put` and deploy " +
        "OffchainResolver with the matching public address.",
    );
  }

  let sender: string | undefined;
  let dataParam: string | undefined;
  if (request.method === "POST") {
    const body = await safeJsonBody(request);
    if (!body || typeof body !== "object") {
      return jsonError(400, "invalid_body", "POST body must be JSON {sender, data}.");
    }
    const b = body as Record<string, unknown>;
    if (typeof b["sender"] === "string") sender = b["sender"];
    if (typeof b["data"] === "string") dataParam = b["data"];
  } else {
    sender = routeCtx.params["sender"];
    dataParam = stripJsonExtension(routeCtx.params["data"]);
  }

  // CCIP-Read clients (viem, app.ens.domains) may pass the resolver
  // address in lowercase or mixed case. We accept any 20-byte hex value
  // — the address is rebound into the signing digest so an attacker
  // cannot forge a different sender.
  if (!sender || !isAddress(sender, { strict: false })) {
    return jsonError(400, "invalid_sender", "sender must be a 0x-prefixed address.");
  }
  if (!dataParam || !isHex(dataParam)) {
    return jsonError(400, "invalid_data", "data must be 0x-prefixed hex.");
  }

  const callData = dataParam;
  let decoded: ReturnType<typeof decodeFunctionData<typeof RESOLVE_ABI>>;
  try {
    decoded = decodeFunctionData({ abi: RESOLVE_ABI, data: callData });
  } catch {
    return jsonError(400, "invalid_calldata", "data did not decode as resolve(bytes,bytes).");
  }
  // RESOLVE_ABI exposes exactly one function — `decodeFunctionData` either
  // matched it or threw above. No further dispatch needed.
  const [nameBytes, innerCall] = decoded.args;

  const label = leftmostLabel(nameBytes);
  if (!label) {
    return jsonError(400, "invalid_name", "Could not parse a label from the DNS-wire name.");
  }

  await applyMigrations(env.DB);
  const agent = await env.DB.prepare(
    "SELECT owner, mcp_endpoint, capabilities FROM agents WHERE label = ? LIMIT 1",
  )
    .bind(label)
    .first<AgentRow>();

  let result: Hex;
  try {
    result = answerInnerCall(innerCall, agent);
  } catch (err) {
    console.error("ccip-read encode failed", err);
    return jsonError(400, "unsupported_record", (err as Error).message);
  }

  const ttlSeconds = clampTtl(env.CCIP_RESPONSE_TTL_SECONDS);
  const expires = BigInt(Math.floor(Date.now() / 1000) + ttlSeconds);
  // Re-normalize via getAddress so encodePacked never trips a checksum
  // assertion regardless of the case the client used in the URL.
  const resolverAddress: Address = getAddress(sender);

  const digest = keccak256(
    encodePacked(
      ["bytes2", "address", "uint64", "bytes32", "bytes32"],
      ["0x1900", resolverAddress, expires, keccak256(callData), keccak256(result)],
    ),
  );
  const signatureHex = await sign({ hash: digest, privateKey, to: "hex" });

  const responseBytes = encodeAbiParameters(
    [
      { name: "result", type: "bytes" },
      { name: "expires", type: "uint64" },
      { name: "signature", type: "bytes" },
    ],
    [result, expires, signatureHex],
  );

  return Response.json(
    { data: responseBytes },
    {
      headers: {
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      },
    },
  );
}

/* ─────────────────── helpers ─────────────────── */

function answerInnerCall(callData: Hex, agent: AgentRow | null): Hex {
  let inner: ReturnType<typeof decodeFunctionData<typeof RESOLVER_FUNCTIONS_ABI>>;
  try {
    inner = decodeFunctionData({ abi: RESOLVER_FUNCTIONS_ABI, data: callData });
  } catch {
    throw new Error("inner call did not decode as addr(bytes32) or text(bytes32,string)");
  }

  switch (inner.functionName) {
    case "addr": {
      const owner = (agent?.owner ?? "0x0000000000000000000000000000000000000000") as Address;
      return encodeFunctionResult({
        abi: RESOLVER_FUNCTIONS_ABI,
        functionName: "addr",
        result: owner,
      });
    }
    case "text": {
      const [, key] = inner.args;
      const value = textValueFor(key, agent);
      return encodeFunctionResult({
        abi: RESOLVER_FUNCTIONS_ABI,
        functionName: "text",
        result: value,
      });
    }
  }
}

function textValueFor(key: string, agent: AgentRow | null): string {
  if (!agent) return "";
  switch (key) {
    case "url":
      return agent.mcp_endpoint;
    case "description":
      return agent.capabilities;
    default:
      // Unknown text key — return empty string per ENS resolver convention
      // (no-data is not an error).
      return "";
  }
}

/**
 * Pulls the leftmost label out of a DNS-wire-format ENS name. ENS encodes
 * `noskodmi.kanbantic.eth` as the byte sequence
 *   08 "noskodmi" 09 "kanbantic" 03 "eth" 00
 * The leftmost label is the agent the client is looking up; everything
 * after it is the parent suffix our wildcard resolver covers.
 */
export function leftmostLabel(nameWire: Hex): string | null {
  const bytes = hexToUint8Array(nameWire);
  if (bytes.length === 0) return null;
  const len = bytes[0];
  if (typeof len !== "number" || len === 0 || len + 1 > bytes.length) return null;
  return new TextDecoder().decode(bytes.subarray(1, 1 + len));
}

function hexToUint8Array(hex: Hex): Uint8Array {
  const stripped = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (stripped.length % 2 !== 0) {
    throw new Error("hex string has odd length");
  }
  const out = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function stripJsonExtension(value: string | undefined): string | undefined {
  if (!value) return value;
  return value.endsWith(".json") ? value.slice(0, -".json".length) : value;
}

function normalizePrivateKey(raw: string | undefined): Hex | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!isHex(withPrefix) || withPrefix.length !== 66) return null;
  return withPrefix;
}

function clampTtl(raw: string | undefined): number {
  if (!raw) return DEFAULT_TTL_SECONDS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_TTL_SECONDS;
  return Math.min(Math.max(n, TTL_BOUNDS.min), TTL_BOUNDS.max);
}

async function safeJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: code, message }, { status });
}

/* ─────────────────── re-exports for tests ─────────────────── */

/** Exported only for the worker test — derives the verification digest
 *  exactly the way the deployed OffchainResolver does. */
export function ccipDigest(args: {
  resolver: Address;
  expires: bigint;
  callData: Hex;
  result: Hex;
}): Hex {
  return keccak256(
    encodePacked(
      ["bytes2", "address", "uint64", "bytes32", "bytes32"],
      ["0x1900", args.resolver, args.expires, keccak256(args.callData), keccak256(args.result)],
    ),
  );
}

/** Exported for tests — decodes the gateway's `{ data }` payload into its
 *  three components (result, expires, signature). */
export function decodeGatewayResponse(data: Hex): {
  result: Hex;
  expires: bigint;
  signature: Hex;
} {
  const [result, expires, signature] = decodeAbiParameters(
    [
      { name: "result", type: "bytes" },
      { name: "expires", type: "uint64" },
      { name: "signature", type: "bytes" },
    ],
    data,
  );
  return { result: result, expires, signature: signature };
}
