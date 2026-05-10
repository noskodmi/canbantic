/**
 * X402 paywall middleware for the Cloudflare worker.
 *
 * Spec reference: https://www.x402.org/ — HTTP 402 Payment Required as a
 * standardized challenge/response for paid API endpoints. The full spec
 * supports multiple payment schemes (EIP-3009 USDC authorizations,
 * EIP-2612 permits, etc.); for Phase 7 v0.1 we ship the simplest
 * possible scheme — `eth-direct` — where the client sends ETH on
 * Sepolia to the worker's `payTo` address before retrying the call,
 * and includes the resulting transaction hash in the `x-payment`
 * header. The worker verifies the tx exists, lands on Sepolia, has the
 * correct `to`/`value`, and hasn't been redeemed before.
 *
 * Replay protection lives in the `x402_redemptions` D1 table — once a
 * tx hash funds a successful call, it can't fund a second one.
 *
 * On success the wrapped handler runs, and its response is returned to
 * the caller with an `x-payment-receipt: <txHash>` header so the client
 * can render an Etherscan link.
 *
 * The 402 challenge body shape mirrors the X402 spec discovery
 * envelope:
 *
 *   {
 *     "x402Version": "0.1",
 *     "accepts": [{
 *       "scheme": "eth-direct",
 *       "payTo": "0x…",
 *       "asset": "eth",
 *       "amount": "100000000000000",   // wei, decimal string
 *       "network": "sepolia"
 *     }]
 *   }
 *
 * v0.2 will add EIP-3009 USDC accept entries alongside `eth-direct`.
 */

import type { Address } from "viem";

import type { Env } from "../env.js";

const X402_VERSION = "0.1";
const ETH_DIRECT_SCHEME = "eth-direct";
const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export interface X402Options {
  /** Address that must receive the ETH payment. */
  payTo: Address;
  /** Required payment amount in wei. */
  priceWei: bigint;
  /** Network the payment must land on. v0.1 only supports `'sepolia'`. */
  network: "sepolia";
  /**
   * Endpoint label recorded in the redemption row. Defaults to the
   * request URL path. Provided for tests + idempotent retry semantics
   * if a single handler ends up wrapping multiple paths.
   */
  endpoint?: string;
}

export type RouteHandler = (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;

export interface X402Accept {
  scheme: typeof ETH_DIRECT_SCHEME;
  payTo: Address;
  asset: "eth";
  /** Wei as a decimal string — JSON has no native bigint. */
  amount: string;
  network: "sepolia";
}

export interface X402Challenge {
  x402Version: typeof X402_VERSION;
  accepts: X402Accept[];
}

interface SepoliaTx {
  to: string | null;
  from: string;
  value: string;
  blockNumber: string | null;
}

interface JsonRpcResponse<T> {
  result?: T;
  error?: { code: number; message: string };
}

/**
 * Wrap an existing route handler with the X402 paywall.
 *
 * Behavior:
 * - Missing `x-payment` header  → 402 with the challenge body.
 * - Malformed header / unknown tx / wrong recipient / wrong amount /
 *   unconfirmed / already-redeemed → 402 with `error` field describing
 *   the specific failure.
 * - Verified payment → wrapped handler runs, response is returned with
 *   `x-payment-receipt: <txHash>` appended.
 *
 * Verification reads the tx from `env.SEPOLIA_RPC` via JSON-RPC
 * `eth_getTransactionByHash`, then checks `eth_blockNumber` for the
 * confirmation count (1 confirmation = tx mined into a block at or
 * below the current head).
 *
 * Replay protection: each successful redemption inserts a row into
 * `x402_redemptions(tx_hash PRIMARY KEY, redeemed_at_ts, endpoint)`.
 * A second call with the same tx hash is rejected with
 * `already_redeemed` before the wrapped handler ever runs.
 */
export function withX402(handler: RouteHandler, options: X402Options): RouteHandler {
  const challenge: X402Challenge = {
    x402Version: X402_VERSION,
    accepts: [
      {
        scheme: ETH_DIRECT_SCHEME,
        payTo: options.payTo,
        asset: "eth",
        amount: options.priceWei.toString(),
        network: options.network,
      },
    ],
  };

  return async (request, env, ctx) => {
    const paymentHeader = request.headers.get("x-payment");
    if (paymentHeader === null || paymentHeader.trim().length === 0) {
      return paymentRequired(challenge);
    }

    const txHash = paymentHeader.trim();
    if (!TX_HASH_REGEX.test(txHash)) {
      return paymentRequired(
        challenge,
        "invalid_payment_header",
        "x-payment must be a 0x-prefixed 32-byte tx hash",
      );
    }

    const endpoint = options.endpoint ?? new URL(request.url).pathname;

    // Replay check before we hit the RPC — cheap + protects against
    // anyone resubmitting a known-good hash.
    const existing = await env.DB.prepare("SELECT tx_hash FROM x402_redemptions WHERE tx_hash = ?")
      .bind(txHash)
      .first<{ tx_hash: string }>();
    if (existing !== null) {
      return paymentRequired(
        challenge,
        "already_redeemed",
        "This payment tx hash has already funded a call. Send a new payment.",
      );
    }

    const verification = await verifySepoliaPayment(env.SEPOLIA_RPC, txHash, options);
    if (!verification.ok) {
      return paymentRequired(challenge, verification.error, verification.message);
    }

    // Insert the redemption row BEFORE running the handler so a slow
    // handler can't be called twice by a racing retry.
    try {
      await env.DB.prepare(
        "INSERT INTO x402_redemptions (tx_hash, redeemed_at_ts, endpoint) VALUES (?, ?, ?)",
      )
        .bind(txHash, Math.floor(Date.now() / 1000), endpoint)
        .run();
    } catch (err) {
      // UNIQUE collision = a parallel request beat us. Surface the
      // same `already_redeemed` envelope rather than 500.
      console.warn("x402 redemption insert collided", err);
      return paymentRequired(
        challenge,
        "already_redeemed",
        "This payment tx hash has already funded a call. Send a new payment.",
      );
    }

    const response = await handler(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("x-payment-receipt", txHash);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

interface VerifySuccess {
  ok: true;
}

interface VerifyFailure {
  ok: false;
  error: string;
  message: string;
}

type VerifyResult = VerifySuccess | VerifyFailure;

async function verifySepoliaPayment(
  rpcUrl: string,
  txHash: string,
  options: X402Options,
): Promise<VerifyResult> {
  let tx: SepoliaTx | null;
  try {
    tx = await rpcCall<SepoliaTx | null>(rpcUrl, "eth_getTransactionByHash", [txHash]);
  } catch (err) {
    console.error("x402 eth_getTransactionByHash failed", err);
    return {
      ok: false,
      error: "rpc_unavailable",
      message: "Sepolia RPC could not be reached. Try again shortly.",
    };
  }

  if (tx === null) {
    return {
      ok: false,
      error: "tx_not_found",
      message: "Payment transaction not found on Sepolia. Confirm it's mined and retry.",
    };
  }

  const recipient = tx.to;
  if (recipient === null || !ADDRESS_REGEX.test(recipient)) {
    return {
      ok: false,
      error: "invalid_recipient",
      message: "Payment transaction has no ERC-20 / EOA recipient.",
    };
  }

  if (recipient.toLowerCase() !== options.payTo.toLowerCase()) {
    return {
      ok: false,
      error: "wrong_recipient",
      message: `Payment recipient ${recipient} does not match required payTo ${options.payTo}.`,
    };
  }

  let value: bigint;
  try {
    value = BigInt(tx.value);
  } catch {
    return {
      ok: false,
      error: "invalid_value",
      message: "Payment transaction value could not be parsed.",
    };
  }

  if (value < options.priceWei) {
    return {
      ok: false,
      error: "insufficient_payment",
      message: `Payment value ${value.toString()} wei is less than required ${options.priceWei.toString()} wei.`,
    };
  }

  if (tx.blockNumber === null) {
    return {
      ok: false,
      error: "unconfirmed",
      message: "Payment transaction is still pending. Wait for at least 1 confirmation.",
    };
  }

  let txBlock: bigint;
  try {
    txBlock = BigInt(tx.blockNumber);
  } catch {
    return {
      ok: false,
      error: "invalid_block_number",
      message: "Payment transaction block number could not be parsed.",
    };
  }

  let head: bigint;
  try {
    const headHex = await rpcCall<string>(rpcUrl, "eth_blockNumber", []);
    head = BigInt(headHex);
  } catch (err) {
    console.error("x402 eth_blockNumber failed", err);
    return {
      ok: false,
      error: "rpc_unavailable",
      message: "Sepolia RPC could not be reached for confirmation check. Try again shortly.",
    };
  }

  if (head < txBlock) {
    return {
      ok: false,
      error: "unconfirmed",
      message: "Payment transaction has not yet reached 1 confirmation.",
    };
  }

  return { ok: true };
}

async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) {
    throw new Error(`RPC ${method} returned HTTP ${String(response.status)}`);
  }
  const body: JsonRpcResponse<T> = await response.json();
  if (body.error) {
    throw new Error(`RPC ${method} error: ${body.error.message}`);
  }
  if (body.result === undefined) {
    throw new Error(`RPC ${method} returned no result`);
  }
  return body.result;
}

function paymentRequired(challenge: X402Challenge, error?: string, message?: string): Response {
  const body: X402Challenge & { error?: string; message?: string } = { ...challenge };
  if (error !== undefined) body.error = error;
  if (message !== undefined) body.message = message;
  return Response.json(body, {
    status: 402,
    headers: {
      "x-payment-address": challenge.accepts[0]?.payTo ?? "",
    },
  });
}
