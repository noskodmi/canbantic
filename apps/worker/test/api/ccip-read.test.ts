import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  decodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  getAddress,
  keccak256,
  recoverAddress,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { applyMigrations } from "../../src/db/migrate.js";
import {
  ccipDigest,
  ccipReadHandler,
  decodeGatewayResponse,
  leftmostLabel,
} from "../../src/api/ccip-read.js";
import type { Env } from "../../src/env.js";
import type { RouteContext } from "../../src/router.js";

/* ─────────────────── fixtures ─────────────────── */

// Lowercased deliberately — CCIP-Read clients pass the resolver address
// inside the URL however they want, so the gateway accepts any case.
const RESOLVER_ADDRESS: Address = "0x1234567890abcdef1234567890abcdef12345678";
const NOSKODMI_OWNER: Address = "0x000000000000000000000000000000000000beef";
const NOSKODMI_LABEL = "noskodmi";
const NOSKODMI_NODE: Hex = `0x${"a".repeat(64)}`;
// Deterministic dev key for tests only — anvil's account #0. Production
// uses a fresh key provisioned via `wrangler secret put`.
const SIGNER_PK: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const SIGNER_ADDRESS = privateKeyToAccount(SIGNER_PK).address;

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

const ADDR_ABI = [
  {
    type: "function",
    name: "addr",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const TEXT_ABI = [
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

/** DNS-wire encoding of e.g. `noskodmi.kanbantic.eth`. */
function nameToWire(name: string): Hex {
  const labels = name.split(".");
  const out: number[] = [];
  for (const label of labels) {
    const encoded = new TextEncoder().encode(label);
    out.push(encoded.length);
    for (const b of encoded) out.push(b);
  }
  out.push(0);
  return toHex(new Uint8Array(out));
}

function resolveCallData(name: string, innerData: Hex): Hex {
  return encodeFunctionData({
    abi: RESOLVE_ABI,
    functionName: "resolve",
    args: [nameToWire(name), innerData],
  });
}

const STUB_CTX: ExecutionContext = {
  waitUntil: () => undefined,
  passThroughOnException: () => undefined,
  props: {},
};

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: env.DB,
    INDEXER: env.INDEXER,
    SEPOLIA_RPC: "",
    SEPOLIA_CHAIN_ID: "11155111",
    INDEXER_CHUNK_BLOCKS: "9500",
    CCIP_SIGNER_PRIVATE_KEY: SIGNER_PK,
    CCIP_RESPONSE_TTL_SECONDS: "300",
    ...overrides,
  };
}

async function callGet(callData: Hex, sender: Address = RESOLVER_ADDRESS, e: Env = makeEnv()) {
  const req = new Request(`https://example.com/api/ccip-read/${sender}/${callData}.json`);
  const routeCtx: RouteContext = { params: { sender, data: callData } };
  return ccipReadHandler(req, e, STUB_CTX, routeCtx);
}

async function callPost(body: unknown, e: Env = makeEnv()) {
  const req = new Request("https://example.com/api/ccip-read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return ccipReadHandler(req, e, STUB_CTX, { params: {} });
}

/* ─────────────────── setup ─────────────────── */

beforeEach(async () => {
  await applyMigrations(env.DB);
  await env.DB.prepare("DELETE FROM agents").run();
  await env.DB.prepare(
    "INSERT INTO agents (node, parent, owner, label, mcp_endpoint, capabilities, registered_at_block, registered_at_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      NOSKODMI_NODE,
      `0x${"0".repeat(64)}`,
      NOSKODMI_OWNER,
      NOSKODMI_LABEL,
      "https://noskodmi.example/mcp",
      "research,summarize",
      100,
      1_715_300_000,
    )
    .run();
});

/* ─────────────────── tests ─────────────────── */

describe("CCIP-Read gateway — addr(namehash(noskodmi.kanbantic.eth))", () => {
  it("returns a signed response that the OffchainResolver verifier accepts", async () => {
    const innerCall = encodeFunctionData({
      abi: ADDR_ABI,
      functionName: "addr",
      args: [NOSKODMI_NODE],
    });
    const callData = resolveCallData("noskodmi.kanbantic.eth", innerCall);

    const res = await callGet(callData);
    expect(res.status).toBe(200);

    const body = await res.json<{ data: Hex }>();
    const { result, expires, signature } = decodeGatewayResponse(body.data);

    // The result, when decoded, equals the noskodmi owner.
    const [owner] = decodeAbiParameters([{ name: "addr", type: "address" }], result);
    expect((owner as string).toLowerCase()).toBe(NOSKODMI_OWNER.toLowerCase());

    // Signature must recover to our signer over the OffchainResolver
    // digest. The handler normalises the sender via getAddress before
    // signing — mirror that here so the digest matches.
    const digest = ccipDigest({
      resolver: getAddress(RESOLVER_ADDRESS),
      expires,
      callData,
      result,
    });
    const recovered = await recoverAddress({ hash: digest, signature });
    expect(recovered.toLowerCase()).toBe(SIGNER_ADDRESS.toLowerCase());

    // expires lies in the future (TTL = 300s) and within bounds.
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(Number(expires)).toBeGreaterThan(nowSeconds);
    expect(Number(expires)).toBeLessThanOrEqual(nowSeconds + 305);
  });

  it("matches the on-chain digest scheme byte-for-byte", () => {
    // Sanity check: ccipDigest replicates the abi.encodePacked layout
    // OffchainResolver.sol uses (0x1900 ‖ resolver ‖ expires ‖ keccak(callData) ‖ keccak(result)).
    const callData = "0xdeadbeef" as Hex;
    const result = "0xc0ffee" as Hex;
    const expires = 1_700_000_000n;
    const checksummed = getAddress(RESOLVER_ADDRESS);
    const expected = keccak256(
      encodePacked(
        ["bytes2", "address", "uint64", "bytes32", "bytes32"],
        ["0x1900", checksummed, expires, keccak256(callData), keccak256(result)],
      ),
    );
    expect(ccipDigest({ resolver: checksummed, expires, callData, result })).toBe(expected);
  });
});

describe("text(node, key)", () => {
  it("returns mcp_endpoint for key='url'", async () => {
    const innerCall = encodeFunctionData({
      abi: TEXT_ABI,
      functionName: "text",
      args: [NOSKODMI_NODE, "url"],
    });
    const callData = resolveCallData("noskodmi.kanbantic.eth", innerCall);

    const res = await callGet(callData);
    expect(res.status).toBe(200);
    const { result } = decodeGatewayResponse((await res.json<{ data: Hex }>()).data);
    const [text] = decodeAbiParameters([{ name: "value", type: "string" }], result);
    expect(text).toBe("https://noskodmi.example/mcp");
  });

  it("returns capabilities for key='description'", async () => {
    const innerCall = encodeFunctionData({
      abi: TEXT_ABI,
      functionName: "text",
      args: [NOSKODMI_NODE, "description"],
    });
    const callData = resolveCallData("noskodmi.kanbantic.eth", innerCall);
    const res = await callGet(callData);
    const { result } = decodeGatewayResponse((await res.json<{ data: Hex }>()).data);
    const [text] = decodeAbiParameters([{ name: "value", type: "string" }], result);
    expect(text).toBe("research,summarize");
  });

  it("returns empty string for unknown text keys", async () => {
    const innerCall = encodeFunctionData({
      abi: TEXT_ABI,
      functionName: "text",
      args: [NOSKODMI_NODE, "avatar"],
    });
    const callData = resolveCallData("noskodmi.kanbantic.eth", innerCall);
    const res = await callGet(callData);
    const { result } = decodeGatewayResponse((await res.json<{ data: Hex }>()).data);
    const [text] = decodeAbiParameters([{ name: "value", type: "string" }], result);
    expect(text).toBe("");
  });
});

describe("missing agent", () => {
  it("returns the zero address for addr() of an unknown name", async () => {
    const innerCall = encodeFunctionData({
      abi: ADDR_ABI,
      functionName: "addr",
      args: [NOSKODMI_NODE],
    });
    const callData = resolveCallData("ghost.kanbantic.eth", innerCall);
    const res = await callGet(callData);
    expect(res.status).toBe(200);
    const { result } = decodeGatewayResponse((await res.json<{ data: Hex }>()).data);
    const [addr] = decodeAbiParameters([{ name: "addr", type: "address" }], result);
    expect(addr).toBe("0x0000000000000000000000000000000000000000");
  });
});

describe("POST body form", () => {
  it("accepts {sender, data} JSON and returns the same signed envelope", async () => {
    const innerCall = encodeFunctionData({
      abi: ADDR_ABI,
      functionName: "addr",
      args: [NOSKODMI_NODE],
    });
    const callData = resolveCallData("noskodmi.kanbantic.eth", innerCall);
    const res = await callPost({ sender: RESOLVER_ADDRESS, data: callData });
    expect(res.status).toBe(200);
    const { result } = decodeGatewayResponse((await res.json<{ data: Hex }>()).data);
    const [owner] = decodeAbiParameters([{ name: "addr", type: "address" }], result);
    expect((owner as string).toLowerCase()).toBe(NOSKODMI_OWNER.toLowerCase());
  });
});

describe("error envelopes", () => {
  it("503 when CCIP_SIGNER_PRIVATE_KEY is unset", async () => {
    const innerCall = encodeFunctionData({
      abi: ADDR_ABI,
      functionName: "addr",
      args: [NOSKODMI_NODE],
    });
    const callData = resolveCallData("noskodmi.kanbantic.eth", innerCall);
    const e = makeEnv();
    delete e.CCIP_SIGNER_PRIVATE_KEY;
    const res = await callGet(callData, RESOLVER_ADDRESS, e);
    expect(res.status).toBe(503);
    const body = await res.json<{ error: string; message: string }>();
    expect(body.error).toBe("ccip_signer_unconfigured");
    expect(body.message).toMatch(/wrangler secret put/);
  });

  it("400 when sender is not an address", async () => {
    const innerCall = encodeFunctionData({
      abi: ADDR_ABI,
      functionName: "addr",
      args: [NOSKODMI_NODE],
    });
    const callData = resolveCallData("noskodmi.kanbantic.eth", innerCall);
    const req = new Request(`https://example.com/api/ccip-read/notanaddress/${callData}.json`);
    const res = await ccipReadHandler(req, makeEnv(), STUB_CTX, {
      params: { sender: "notanaddress", data: callData },
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid_sender");
  });

  it("400 when data isn't valid hex", async () => {
    const req = new Request(`https://example.com/api/ccip-read/${RESOLVER_ADDRESS}/notHex.json`);
    const res = await ccipReadHandler(req, makeEnv(), STUB_CTX, {
      params: { sender: RESOLVER_ADDRESS, data: "notHex" },
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid_data");
  });

  it("400 when data is hex but not resolve(bytes,bytes)", async () => {
    const garbage = "0xdeadbeef" as Hex;
    const req = new Request(
      `https://example.com/api/ccip-read/${RESOLVER_ADDRESS}/${garbage}.json`,
    );
    const res = await ccipReadHandler(req, makeEnv(), STUB_CTX, {
      params: { sender: RESOLVER_ADDRESS, data: garbage },
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid_calldata");
  });
});

describe("leftmostLabel helper", () => {
  it("extracts the leftmost label from a DNS-wire ENS name", () => {
    expect(leftmostLabel(nameToWire("noskodmi.kanbantic.eth"))).toBe("noskodmi");
    expect(leftmostLabel(nameToWire("alice.bob.kanbantic.eth"))).toBe("alice");
  });

  it("returns null for the empty wire name", () => {
    expect(leftmostLabel("0x00")).toBe(null);
  });
});
