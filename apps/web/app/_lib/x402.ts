/**
 * X402 client helper — pay-per-call against a worker endpoint.
 *
 * Spec reference: https://www.x402.org/. The Phase 7 v0.1 worker only
 * understands the `eth-direct` scheme — client sends ETH to the
 * server's `payTo` address, waits for 1 Sepolia confirmation, then
 * retries the original POST with the resulting tx hash in the
 * `x-payment` header. The worker verifies on-chain and runs the
 * wrapped handler.
 *
 * `payAndCall` orchestrates the full flow:
 *   1. POST to `url` with no payment header.
 *   2. If 200 — return immediately (server may not require payment).
 *   3. If 402 — parse the challenge body, find the `eth-direct` accept
 *      entry, send ETH via the wallet, wait 1 conf, retry.
 *   4. Return the final response (success or final error).
 *
 * Caller is responsible for: wallet connection (use wagmi's
 * `useAccount` / `useWalletClient`), surfacing the optional
 * `onPaymentSubmitted` / `onConfirmation` callbacks for UX, and
 * extracting the `x-payment-receipt` header from the returned
 * response if they want to render an Etherscan link.
 */

import type { Address, Hex, PublicClient, WalletClient } from "viem";

export const X402_VERSION = "0.1";
export const ETH_DIRECT_SCHEME = "eth-direct";

export interface X402Accept {
  scheme: string;
  payTo: Address;
  asset: string;
  /** Wei as a decimal string. */
  amount: string;
  network: string;
}

export interface X402Challenge {
  x402Version: string;
  accepts: X402Accept[];
  error?: string;
  message?: string;
}

export interface PayAndCallOptions {
  /** Connected wallet client (e.g. from wagmi's `useWalletClient`). */
  wallet: WalletClient;
  /** Public client used to wait for tx receipts. Required for confirmations. */
  publicClient: PublicClient;
  /** Body to send. Stringified internally. */
  body: unknown;
  /** Optional extra headers (content-type defaults to application/json). */
  headers?: Record<string, string>;
  /** Notified once the payment tx hash is known (before confirmation). */
  onPaymentSubmitted?: (txHash: Hex) => void;
  /** Notified when the payment is confirmed and the retry is about to fire. */
  onConfirmation?: (txHash: Hex) => void;
}

export class X402Error extends Error {
  public readonly originalCause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "X402Error";
    this.originalCause = cause;
  }
}

/**
 * POST to `url`, paying the X402 challenge in ETH on Sepolia if needed.
 *
 * Returns the final `Response`. On success the response carries the
 * `x-payment-receipt: <txHash>` header. On failure the response is
 * whatever the server returned for the second (post-payment) attempt.
 *
 * Throws `X402Error` if:
 *   - The 402 body is missing an `eth-direct` accept entry.
 *   - The amount field can't be parsed as a positive bigint.
 *   - The wallet rejects or fails to broadcast the payment tx.
 *   - The receipt wait throws (network error, etc.).
 */
export async function payAndCall(url: string, options: PayAndCallOptions): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
    ...(options.headers ?? {}),
  };

  const initial = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(options.body),
  });

  if (initial.status !== 402) {
    return initial;
  }

  // Parse the challenge.
  let challenge: X402Challenge;
  try {
    challenge = (await initial.clone().json()) as X402Challenge;
  } catch (err) {
    throw new X402Error("X402 challenge body was not valid JSON", err);
  }

  const accept = challenge.accepts.find((a) => a.scheme === ETH_DIRECT_SCHEME);
  if (!accept) {
    throw new X402Error(
      `X402 challenge has no ${ETH_DIRECT_SCHEME} accept entry. Got: ${challenge.accepts
        .map((a) => a.scheme)
        .join(", ")}`,
    );
  }

  let priceWei: bigint;
  try {
    priceWei = BigInt(accept.amount);
  } catch (err) {
    throw new X402Error(`X402 accept.amount is not a valid integer: ${accept.amount}`, err);
  }
  if (priceWei <= 0n) {
    throw new X402Error(`X402 accept.amount must be positive, got ${accept.amount}`);
  }

  const account = options.wallet.account;
  if (!account) {
    throw new X402Error("Wallet client has no connected account");
  }

  let txHash: Hex;
  try {
    txHash = await options.wallet.sendTransaction({
      account,
      to: accept.payTo,
      value: priceWei,
      // chain comes from the wallet's connected chain; wagmi's
      // useWalletClient returns one bound to the active chain so we
      // don't pass `chain` here. Calling with chain=undefined would
      // make viem error on a strict check.
      chain: options.wallet.chain ?? null,
    });
  } catch (err) {
    throw new X402Error("Wallet failed to send X402 payment", err);
  }

  options.onPaymentSubmitted?.(txHash);

  try {
    await options.publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });
  } catch (err) {
    throw new X402Error("Failed to wait for X402 payment receipt", err);
  }

  options.onConfirmation?.(txHash);

  // Retry with the payment header.
  const retried = await fetch(url, {
    method: "POST",
    headers: { ...headers, "x-payment": txHash },
    body: JSON.stringify(options.body),
  });

  return retried;
}
