import { env } from "cloudflare:test";
import type { Address } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigrations } from "../../src/db/migrate.js";
import { withX402, type RouteHandler } from "../../src/x402/middleware.js";

const PAY_TO: Address = "0x000000000000000000000000000000000000bEEF";
const PRICE_WEI = 100_000_000_000_000n; // 0.0001 ETH

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

interface RpcStubOptions {
  payTo?: string;
  /** Wei value as bigint or string. Default: PRICE_WEI exactly. */
  value?: bigint | string;
  /** Whether the tx has a blockNumber set (default true). */
  mined?: boolean;
  /** Whether the tx exists at all (default true). If false, returns null. */
  exists?: boolean;
  /** Whether the head block is at or beyond the tx block (default true). */
  confirmed?: boolean;
}

function installRpcStub(opts: RpcStubOptions = {}): void {
  const payTo = opts.payTo ?? PAY_TO;
  const valueBig = typeof opts.value === "string" ? BigInt(opts.value) : (opts.value ?? PRICE_WEI);
  const mined = opts.mined ?? true;
  const exists = opts.exists ?? true;
  const confirmed = opts.confirmed ?? true;

  vi.stubGlobal(
    "fetch",
    vi.fn((_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      if (init?.method === "POST" && typeof init.body === "string") {
        const body = JSON.parse(init.body) as JsonRpcReq;
        if (body.method === "eth_getTransactionByHash") {
          if (!exists) return Promise.resolve(rpcResult(null, body.id));
          return Promise.resolve(
            rpcResult(
              {
                to: payTo,
                from: "0x000000000000000000000000000000000000c0DE",
                value: `0x${valueBig.toString(16)}`,
                blockNumber: mined ? "0x10" : null,
              },
              body.id,
            ),
          );
        }
        if (body.method === "eth_blockNumber") {
          // confirmed=true → head >= 0x10. confirmed=false → head < 0x10.
          return Promise.resolve(rpcResult(confirmed ? "0x20" : "0x5", body.id));
        }
      }
      throw new Error("unexpected fetch in middleware test");
    }),
  );
}

const okHandler: RouteHandler = (_request) =>
  Promise.resolve(Response.json({ ok: true, message: "wrapped handler ran" }));

const FRESH_TX = `0x${"a".repeat(64)}`;

function callWith(handler: RouteHandler, init?: RequestInit & { url?: string }): Promise<Response> {
  const request = new Request(init?.url ?? "https://example.com/api/contract-intelligence/run", {
    method: "POST",
    ...init,
  });
  // Stub ExecutionContext with no-op methods.
  const ctx = {
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
    props: {},
  } as unknown as ExecutionContext;
  return handler(request, env, ctx);
}

describe("withX402 middleware", () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("DELETE FROM x402_redemptions").run();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits a 402 challenge with the correct accepts shape when x-payment is missing", async () => {
    const wrapped = withX402(okHandler, { payTo: PAY_TO, priceWei: PRICE_WEI, network: "sepolia" });
    const response = await callWith(wrapped);

    expect(response.status).toBe(402);
    expect(response.headers.get("x-payment-address")).toBe(PAY_TO);
    const body = await response.json<{
      x402Version: string;
      accepts: {
        scheme: string;
        payTo: string;
        asset: string;
        amount: string;
        network: string;
      }[];
    }>();
    expect(body.x402Version).toBe("0.1");
    expect(body.accepts).toHaveLength(1);
    const accept = body.accepts[0];
    if (!accept) throw new Error("expected an accept entry");
    expect(accept.scheme).toBe("eth-direct");
    expect(accept.payTo).toBe(PAY_TO);
    expect(accept.asset).toBe("eth");
    expect(accept.amount).toBe(PRICE_WEI.toString());
    expect(accept.network).toBe("sepolia");
  });

  it("runs the wrapped handler and stamps x-payment-receipt when the payment verifies", async () => {
    installRpcStub();
    const wrapped = withX402(okHandler, { payTo: PAY_TO, priceWei: PRICE_WEI, network: "sepolia" });

    const response = await callWith(wrapped, { headers: { "x-payment": FRESH_TX } });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-payment-receipt")).toBe(FRESH_TX);
    const body = await response.json<{ ok: boolean }>();
    expect(body.ok).toBe(true);

    // Redemption row was inserted.
    const row = await env.DB.prepare(
      "SELECT tx_hash, endpoint FROM x402_redemptions WHERE tx_hash = ?",
    )
      .bind(FRESH_TX)
      .first<{ tx_hash: string; endpoint: string }>();
    expect(row?.tx_hash).toBe(FRESH_TX);
    expect(row?.endpoint).toBe("/api/contract-intelligence/run");
  });

  it("rejects a replay with 402 already_redeemed", async () => {
    installRpcStub();
    const wrapped = withX402(okHandler, { payTo: PAY_TO, priceWei: PRICE_WEI, network: "sepolia" });

    const first = await callWith(wrapped, { headers: { "x-payment": FRESH_TX } });
    expect(first.status).toBe(200);

    const second = await callWith(wrapped, { headers: { "x-payment": FRESH_TX } });
    expect(second.status).toBe(402);
    const body = await second.json<{ error: string; message: string }>();
    expect(body.error).toBe("already_redeemed");
    expect(body.message).toMatch(/already funded/i);
  });

  it("rejects a malformed payment header with invalid_payment_header", async () => {
    const wrapped = withX402(okHandler, { payTo: PAY_TO, priceWei: PRICE_WEI, network: "sepolia" });
    const response = await callWith(wrapped, { headers: { "x-payment": "not-a-tx-hash" } });
    expect(response.status).toBe(402);
    const body = await response.json<{ error: string }>();
    expect(body.error).toBe("invalid_payment_header");
  });

  it("rejects a tx that doesn't exist on Sepolia", async () => {
    installRpcStub({ exists: false });
    const wrapped = withX402(okHandler, { payTo: PAY_TO, priceWei: PRICE_WEI, network: "sepolia" });
    const response = await callWith(wrapped, { headers: { "x-payment": FRESH_TX } });
    expect(response.status).toBe(402);
    const body = await response.json<{ error: string }>();
    expect(body.error).toBe("tx_not_found");
  });

  it("rejects a tx whose recipient doesn't match payTo", async () => {
    installRpcStub({ payTo: "0x000000000000000000000000000000000000dead" });
    const wrapped = withX402(okHandler, { payTo: PAY_TO, priceWei: PRICE_WEI, network: "sepolia" });
    const response = await callWith(wrapped, { headers: { "x-payment": FRESH_TX } });
    expect(response.status).toBe(402);
    const body = await response.json<{ error: string }>();
    expect(body.error).toBe("wrong_recipient");
  });

  it("rejects a tx whose value is below priceWei", async () => {
    installRpcStub({ value: PRICE_WEI - 1n });
    const wrapped = withX402(okHandler, { payTo: PAY_TO, priceWei: PRICE_WEI, network: "sepolia" });
    const response = await callWith(wrapped, { headers: { "x-payment": FRESH_TX } });
    expect(response.status).toBe(402);
    const body = await response.json<{ error: string }>();
    expect(body.error).toBe("insufficient_payment");
  });

  it("rejects an unconfirmed (pending) tx", async () => {
    installRpcStub({ mined: false });
    const wrapped = withX402(okHandler, { payTo: PAY_TO, priceWei: PRICE_WEI, network: "sepolia" });
    const response = await callWith(wrapped, { headers: { "x-payment": FRESH_TX } });
    expect(response.status).toBe(402);
    const body = await response.json<{ error: string }>();
    expect(body.error).toBe("unconfirmed");
  });

  it("does NOT consume payment when the wrapped handler hasn't run (challenge path)", async () => {
    const wrapped = withX402(okHandler, { payTo: PAY_TO, priceWei: PRICE_WEI, network: "sepolia" });
    await callWith(wrapped); // 402 challenge — no header sent

    const rows = await env.DB.prepare("SELECT count(*) as n FROM x402_redemptions").first<{
      n: number;
    }>();
    expect(rows?.n).toBe(0);
  });
});
