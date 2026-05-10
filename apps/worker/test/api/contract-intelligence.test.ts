import { SELF, env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sepoliaDeployment } from "@kanbantic/shared";

import { applyMigrations } from "../../src/db/migrate.js";

const ENDPOINT = "https://example.com/api/contract-intelligence/run";

const AGENT_REGISTRY = sepoliaDeployment.contracts.AgentRegistry;
const TINY_AGENT_REGISTRY_SOL = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentRegistry {
    mapping(bytes32 => address) public ownerOf;
    function register(bytes32 node, address owner) external {
        ownerOf[node] = owner;
    }
}
`;

/**
 * Test pay-to address. Worker reads from `X402_PAY_TO_ADDRESS` env var
 * (set in wrangler.jsonc for tests) — this constant must match.
 */
const TEST_PAY_TO = "0x000000000000000000000000000000000000bEEF";
/** parseEther('0.0001') in wei. */
const TEST_PRICE_WEI = "100000000000000";

function sourcifyV2Response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isSourcifyV2Url(url: string): boolean {
  return url.startsWith("https://sourcify.dev/server/v2/contract/");
}

function urlOf(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

interface JsonRpcReq {
  method: string;
  params: unknown[];
  id: number;
}

function rpcResult(result: unknown, id = 1): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    headers: { "content-type": "application/json" },
  });
}

interface PaidStubOptions {
  /** Sourcify response handler. */
  sourcify: (url: string) => Response;
  /** Pay-to address the test tx will send to (defaults to TEST_PAY_TO). */
  payTo?: string;
  /** Wei value the test tx carries (defaults to TEST_PRICE_WEI). */
  value?: string;
  /** Whether the test tx is mined (default true). */
  mined?: boolean;
}

/**
 * Stub global fetch so it serves both Sourcify lookups and the JSON-RPC
 * calls the X402 middleware fires. Returns the tx hash callers should
 * pass in the `x-payment` header.
 */
function installPaidStub(options: PaidStubOptions): string {
  const txHash = `0x${"a".repeat(64)}`;
  const payTo = options.payTo ?? TEST_PAY_TO;
  const value = options.value ?? TEST_PRICE_WEI;
  const mined = options.mined ?? true;

  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = urlOf(input);
      if (isSourcifyV2Url(url)) {
        return Promise.resolve(options.sourcify(url));
      }
      // JSON-RPC POST against env.SEPOLIA_RPC.
      if (init?.method === "POST" && typeof init.body === "string") {
        const body = JSON.parse(init.body) as JsonRpcReq;
        if (body.method === "eth_getTransactionByHash") {
          return Promise.resolve(
            rpcResult(
              {
                to: payTo,
                from: "0x000000000000000000000000000000000000c0DE",
                value: `0x${BigInt(value).toString(16)}`,
                blockNumber: mined ? "0x10" : null,
              },
              body.id,
            ),
          );
        }
        if (body.method === "eth_blockNumber") {
          return Promise.resolve(rpcResult("0x20", body.id));
        }
      }
      throw new Error(`unexpected fetch in test: ${url}`);
    }),
  );

  return txHash;
}

async function postWithPayment(body: unknown, txHash: string): Promise<Response> {
  return SELF.fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-payment": txHash,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/contract-intelligence/run (paywalled)", () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("DELETE FROM x402_redemptions").run();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("audits an exact_match Sepolia contract and returns a report quoting the source", async () => {
    const txHash = installPaidStub({
      sourcify: () =>
        sourcifyV2Response({
          match: "exact_match",
          creationMatch: "exact_match",
          runtimeMatch: "exact_match",
          sources: {
            "src/AgentRegistry.sol": { content: TINY_AGENT_REGISTRY_SOL },
          },
        }),
    });

    const response = await postWithPayment({ taskKind: "audit", address: AGENT_REGISTRY }, txHash);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-payment-receipt")).toBe(txHash);
    const body = await response.json<{
      kind: string;
      address: string;
      sourcifyMatch: string;
      report: string;
      sourcifyUrl: string;
    }>();
    expect(body.kind).toBe("audit");
    expect(body.address).toBe(AGENT_REGISTRY);
    expect(body.sourcifyMatch).toBe("exact_match");
    expect(body.sourcifyUrl).toBe(`https://sourcify.dev/lookup/${AGENT_REGISTRY}`);
    expect(body.report).toContain("contract AgentRegistry");
    expect(body.report).toContain("## Findings (stub)");
    expect(body.report).toContain("AI_GATEWAY_TOKEN");
  });

  it("explains a partial_match contract with a 3-paragraph stub", async () => {
    const txHash = installPaidStub({
      sourcify: () =>
        sourcifyV2Response({
          match: "match",
          sources: { "X.sol": { content: "contract X {}" } },
        }),
    });

    const response = await postWithPayment(
      { taskKind: "explain", address: AGENT_REGISTRY },
      txHash,
    );

    expect(response.status).toBe(200);
    const body = await response.json<{ sourcifyMatch: string; report: string }>();
    expect(body.sourcifyMatch).toBe("partial_match");
    expect(body.report).toContain("## Explanation (stub)");
  });

  it("returns a not_verified envelope when Sourcify has no match", async () => {
    const txHash = installPaidStub({
      sourcify: () =>
        sourcifyV2Response({ match: null, creationMatch: null, runtimeMatch: null }, 404),
    });

    const response = await postWithPayment(
      {
        taskKind: "audit",
        address: "0xdEAD000000000000000000000000000000000000",
      },
      txHash,
    );

    expect(response.status).toBe(200);
    const body = await response.json<{ error: string; message: string }>();
    expect(body.error).toBe("not_verified");
    expect(body.message).toMatch(/not verified on Sourcify/i);
  });

  it("short-circuits similarity with a not_implemented_v01 envelope", async () => {
    // Stub still needs to serve RPC for the paywall — but Sourcify
    // must NOT be hit (similarity short-circuits before lookup).
    const txHash = installPaidStub({
      sourcify: () => {
        throw new Error("similarity must not call Sourcify in v0.1");
      },
    });

    const response = await postWithPayment(
      { taskKind: "similarity", address: AGENT_REGISTRY },
      txHash,
    );

    expect(response.status).toBe(200);
    const body = await response.json<{ error: string; message: string }>();
    expect(body.error).toBe("not_implemented_v01");
    expect(body.message).toMatch(/v0\.2/);
  });

  it("rejects an invalid taskKind with 400", async () => {
    const txHash = installPaidStub({
      sourcify: () => {
        throw new Error("invalid taskKind must not call Sourcify");
      },
    });

    const response = await postWithPayment({ taskKind: "bogus", address: AGENT_REGISTRY }, txHash);
    expect(response.status).toBe(400);
    const body = await response.json<{ error: string }>();
    expect(body.error).toBe("invalid_request");
  });

  it("rejects an invalid address with 400", async () => {
    const txHash = installPaidStub({
      sourcify: () => {
        throw new Error("invalid address must not call Sourcify");
      },
    });

    const response = await postWithPayment(
      { taskKind: "audit", address: "not-an-address" },
      txHash,
    );
    expect(response.status).toBe(400);
    const body = await response.json<{ error: string }>();
    expect(body.error).toBe("invalid_request");
  });
});
