import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";

import { X402Error, payAndCall } from "./x402.js";

const ORIGINAL_FETCH = globalThis.fetch;

const PAY_TO: Address = "0x000000000000000000000000000000000000bEEF";
const PRICE_WEI = "100000000000000"; // 0.0001 ETH
const TX_HASH: Hex = `0x${"a".repeat(64)}`;

function challengeResponse(): Response {
  return new Response(
    JSON.stringify({
      x402Version: "0.1",
      accepts: [
        {
          scheme: "eth-direct",
          payTo: PAY_TO,
          asset: "eth",
          amount: PRICE_WEI,
          network: "sepolia",
        },
      ],
    }),
    {
      status: 402,
      headers: { "content-type": "application/json", "x-payment-address": PAY_TO },
    },
  );
}

function successResponse(): Response {
  return new Response(JSON.stringify({ ok: true, kind: "audit" }), {
    status: 200,
    headers: { "content-type": "application/json", "x-payment-receipt": TX_HASH },
  });
}

function makeWallet(opts: { sendTransaction?: () => Promise<Hex> } = {}): WalletClient {
  return {
    account: { address: "0x000000000000000000000000000000000000c0DE" },
    chain: { id: 11155111 },
    sendTransaction: vi.fn(opts.sendTransaction ?? (() => Promise.resolve(TX_HASH))),
  } as unknown as WalletClient;
}

function makePublicClient(
  opts: { waitForTransactionReceipt?: () => Promise<unknown> } = {},
): PublicClient {
  return {
    waitForTransactionReceipt: vi.fn(
      opts.waitForTransactionReceipt ?? (() => Promise.resolve({ status: "success" })),
    ),
  } as unknown as PublicClient;
}

describe("payAndCall", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.clearAllMocks();
  });

  it("returns the initial response if the server doesn't require payment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    globalThis.fetch = fetchMock as typeof fetch;

    const wallet = makeWallet();
    const publicClient = makePublicClient();
    const response = await payAndCall("https://api.example.com/run", {
      wallet,
      publicClient,
      body: { taskKind: "audit" },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it("pays a 402 challenge, waits 1 conf, retries with x-payment, returns success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(challengeResponse())
      .mockResolvedValueOnce(successResponse());
    globalThis.fetch = fetchMock as typeof fetch;

    const wallet = makeWallet();
    const publicClient = makePublicClient();

    const onPaymentSubmitted = vi.fn();
    const onConfirmation = vi.fn();

    const response = await payAndCall("https://api.example.com/run", {
      wallet,
      publicClient,
      body: { taskKind: "audit", address: "0xdEAD000000000000000000000000000000000000" },
      onPaymentSubmitted,
      onConfirmation,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-payment-receipt")).toBe(TX_HASH);

    // First fetch — no payment header.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((firstInit.headers as Record<string, string>)["x-payment"]).toBeUndefined();

    // Wallet was asked to send the right amount to the right address.
    expect(wallet.sendTransaction).toHaveBeenCalledTimes(1);
    const sendArgs = vi.mocked(wallet.sendTransaction).mock.calls[0]?.[0] as {
      to: Address;
      value: bigint;
    };
    expect(sendArgs.to).toBe(PAY_TO);
    expect(sendArgs.value).toBe(BigInt(PRICE_WEI));

    // 1 confirmation requested.
    expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: TX_HASH,
      confirmations: 1,
    });

    // Retry carried x-payment.
    const [, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((secondInit.headers as Record<string, string>)["x-payment"]).toBe(TX_HASH);

    // Callbacks fired in order.
    expect(onPaymentSubmitted).toHaveBeenCalledWith(TX_HASH);
    expect(onConfirmation).toHaveBeenCalledWith(TX_HASH);
  });

  it("throws X402Error if challenge has no eth-direct accept", async () => {
    const oddChallenge = new Response(
      JSON.stringify({
        x402Version: "0.1",
        accepts: [
          {
            scheme: "eip3009-erc20-receive",
            payTo: PAY_TO,
            asset: "usdc",
            amount: "300000",
            network: "sepolia",
          },
        ],
      }),
      { status: 402, headers: { "content-type": "application/json" } },
    );
    globalThis.fetch = vi.fn().mockResolvedValueOnce(oddChallenge) as typeof fetch;

    const wallet = makeWallet();
    const publicClient = makePublicClient();

    await expect(
      payAndCall("https://api.example.com/run", {
        wallet,
        publicClient,
        body: {},
      }),
    ).rejects.toBeInstanceOf(X402Error);
  });

  it("propagates wallet rejection as X402Error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(challengeResponse()) as typeof fetch;

    const wallet = makeWallet({
      sendTransaction: () => Promise.reject(new Error("user rejected")),
    });
    const publicClient = makePublicClient();

    await expect(
      payAndCall("https://api.example.com/run", { wallet, publicClient, body: {} }),
    ).rejects.toBeInstanceOf(X402Error);
  });
});
