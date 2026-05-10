"use client";

/**
 * Contract Intelligence runner — client island.
 *
 * Form state lives entirely in the browser. On submit we POST the
 * chosen task + Sepolia address through the X402 paywall helper
 * (`payAndCall`) — the wallet sends 0.0001 ETH on Sepolia to the
 * worker's payTo address, the worker verifies on-chain, and the
 * audit/explain report is returned with the payment receipt tx hash
 * in the `x-payment-receipt` header.
 *
 * "Recent audits" is in-memory only for v0.1 — when the worker grows
 * a `contract_intelligence_runs` table we'll swap this for a server
 * fetch. The list shape (kind, address, sourcifyMatch, ranAt) is
 * already what the persisted row will carry.
 */

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState, type JSX, type SyntheticEvent } from "react";
import { formatEther, type Hex } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

import { X402Error, payAndCall } from "../../_lib/x402.js";
import { Markdown } from "./Markdown.js";

const API_BASE: string = process.env["NEXT_PUBLIC_KANBANTIC_API"] ?? "http://localhost:8787";
const ETHERSCAN_TX = "https://sepolia.etherscan.io/tx";

const TASK_KINDS = ["audit", "explain", "similarity"] as const;
type TaskKind = (typeof TASK_KINDS)[number];

const TASK_LABEL: Record<TaskKind, string> = {
  audit: "Audit",
  explain: "Explain",
  similarity: "Similarity",
};

const TASK_HINT: Record<TaskKind, string> = {
  audit: "Severity-labeled findings with line citations.",
  explain: "Plain-English summary for a non-developer.",
  similarity: "Find verified contracts that look like this one (v0.2).",
};

interface RunResponse {
  kind?: TaskKind;
  address?: string;
  sourcifyMatch?: "exact_match" | "partial_match";
  report?: string;
  sourcifyUrl?: string;
  error?: string;
  message?: string;
}

type SourcifyMatchView = "exact_match" | "partial_match" | "none";

interface RecentRun {
  ranAt: number;
  kind: TaskKind;
  address: string;
  sourcifyMatch: SourcifyMatchView;
}

/**
 * Per-call price the worker advertises in the 402 challenge. Hard-coded
 * here for the pre-submit cost hint — the wallet still sends whatever
 * `accept.amount` the live challenge carries, so a future price change
 * server-side won't desync from the actual charge.
 */
const PRICE_WEI = 100_000_000_000_000n; // parseEther('0.0001')

type PaymentPhase = "idle" | "submitting" | "confirming" | "complete";

interface ContractIntelligenceFormProps {
  /** 5 Sepolia contracts the user can paste to try the demo. */
  sampleContracts: { name: string; address: string }[];
}

export function ContractIntelligenceForm({
  sampleContracts,
}: ContractIntelligenceFormProps): JSX.Element {
  const [address, setAddress] = useState("");
  const [taskKind, setTaskKind] = useState<TaskKind>("audit");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentRun[]>([]);
  const [paymentPhase, setPaymentPhase] = useState<PaymentPhase>("idle");
  const [paymentTxHash, setPaymentTxHash] = useState<Hex | null>(null);

  const { isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  async function runRequest(submittedKind: TaskKind, submittedAddress: string): Promise<void> {
    if (!walletClient || !publicClient) {
      setSubmitError("Connect a wallet on Sepolia to pay for the audit.");
      return;
    }

    setLoading(true);
    setSubmitError(null);
    setResult(null);
    setPaymentPhase("submitting");
    setPaymentTxHash(null);

    try {
      const response = await payAndCall(`${API_BASE}/api/contract-intelligence/run`, {
        wallet: walletClient,
        publicClient,
        body: { taskKind: submittedKind, address: submittedAddress },
        onPaymentSubmitted: (hash) => {
          setPaymentTxHash(hash);
          setPaymentPhase("confirming");
        },
        onConfirmation: (hash) => {
          setPaymentTxHash(hash);
          setPaymentPhase("complete");
        },
      });

      const receiptHash = response.headers.get("x-payment-receipt");
      if (receiptHash && /^0x[a-fA-F0-9]{64}$/.test(receiptHash)) {
        setPaymentTxHash(receiptHash as Hex);
        setPaymentPhase("complete");
      }

      const body = (await response.json()) as RunResponse;
      setResult(body);
      if (typeof body.error !== "string") {
        const recentEntry: RecentRun = {
          ranAt: Date.now(),
          kind: submittedKind,
          address: submittedAddress,
          sourcifyMatch: body.sourcifyMatch ?? "none",
        };
        setRecent((prev) => [recentEntry, ...prev].slice(0, 10));
      }
    } catch (err) {
      setPaymentPhase("idle");
      if (err instanceof X402Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError(err instanceof Error ? err.message : "Request failed");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    void runRequest(taskKind, address.trim());
  }

  function reset(): void {
    setResult(null);
    setSubmitError(null);
    setPaymentPhase("idle");
    setPaymentTxHash(null);
  }

  const priceEth = formatEther(PRICE_WEI);

  return (
    <div className="flex flex-col gap-6">
      {!isConnected ? (
        <aside className="flex flex-col items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 text-sm">
          <p className="text-yellow-200/90">
            Contract Intelligence is paywalled via X402 — connect a wallet on Sepolia to pay{" "}
            <span className="font-mono">{priceEth} ETH</span> per audit.
          </p>
          <ConnectButton />
        </aside>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.02] p-4"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="ci-address" className="text-sm font-medium">
            Sepolia contract address
          </label>
          <input
            id="ci-address"
            name="address"
            type="text"
            required
            placeholder="0x…"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
            }}
            spellCheck={false}
            autoComplete="off"
            className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 font-mono text-sm focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Task template</legend>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {TASK_KINDS.map((kind) => (
              <label
                key={kind}
                className={`flex flex-1 cursor-pointer flex-col gap-1 rounded-md border px-3 py-2 text-sm transition ${
                  taskKind === kind
                    ? "border-[var(--color-kanbantic-accent)] bg-[var(--color-kanbantic-accent)]/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/25"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="taskKind"
                    value={kind}
                    checked={taskKind === kind}
                    onChange={() => {
                      setTaskKind(kind);
                    }}
                  />
                  <span className="font-semibold">{TASK_LABEL[kind]}</span>
                </span>
                <span className="text-xs text-[var(--color-kanbantic-muted)]">
                  {TASK_HINT[kind]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <p className="text-xs text-[var(--color-kanbantic-muted)]">
          Cost: <span className="font-mono text-[var(--color-kanbantic-fg)]">{priceEth} ETH</span>{" "}
          per audit (X402 paywall — server returns the work after a verified Sepolia payment).
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading || address.trim().length === 0 || !isConnected}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--color-kanbantic-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-kanbantic-bg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <span
                  aria-hidden="true"
                  className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
                {paymentPhase === "submitting"
                  ? "Sign payment in wallet…"
                  : paymentPhase === "confirming"
                    ? "Waiting for Sepolia confirmation… (~12s)"
                    : "Running audit…"}
              </>
            ) : (
              `Pay ${priceEth} ETH and run ${TASK_LABEL[taskKind]}`
            )}
          </button>
          {result || submitError ? (
            <button
              type="button"
              onClick={reset}
              className="text-xs text-[var(--color-kanbantic-muted)] underline hover:text-[var(--color-kanbantic-fg)]"
            >
              Run again with different task
            </button>
          ) : null}
        </div>

        {submitError ? (
          <p className="text-xs text-red-400" role="alert">
            {submitError}
          </p>
        ) : null}
      </form>

      {sampleContracts.length > 0 && !result && !loading ? (
        <aside className="rounded-md border border-dashed border-white/15 bg-white/[0.02] p-4 text-xs">
          <p className="mb-2 text-sm font-semibold">
            Try one of Kanbantic&apos;s 5 deployed contracts:
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {sampleContracts.map((c) => (
              <li key={c.address}>
                <button
                  type="button"
                  onClick={() => {
                    setAddress(c.address);
                  }}
                  className="w-full text-left font-mono text-[11px] text-[var(--color-kanbantic-accent)] hover:underline"
                >
                  {c.name}: {c.address}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      {result ? <ResultCard result={result} paymentTxHash={paymentTxHash} /> : null}

      {recent.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Recent audits (this session)</h3>
          <ul className="flex flex-col gap-1 text-xs">
            {recent.map((r) => (
              <li
                key={`${String(r.ranAt)}-${r.address}`}
                className="flex flex-wrap items-center gap-2 rounded border border-white/10 bg-white/[0.02] px-3 py-2"
              >
                <span className="font-semibold">{TASK_LABEL[r.kind]}</span>
                <span className="font-mono text-[var(--color-kanbantic-muted)]">{r.address}</span>
                <span className="ml-auto text-[var(--color-kanbantic-muted)]">
                  {r.sourcifyMatch}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ResultCard({
  result,
  paymentTxHash,
}: {
  result: RunResponse;
  paymentTxHash: Hex | null;
}): JSX.Element {
  if (result.error) {
    return (
      <section className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
        <p className="font-semibold text-amber-300">{result.error.replace(/_/g, " ")}</p>
        <p className="mt-1 text-amber-100/80">{result.message ?? "No further detail."}</p>
      </section>
    );
  }

  const sourcifyUrl =
    result.sourcifyUrl ?? (result.address ? `https://sourcify.dev/lookup/${result.address}` : null);

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <header className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] uppercase tracking-wide">
          {result.kind}
        </span>
        {result.sourcifyMatch ? (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-200">
            Sourcify {result.sourcifyMatch.replace("_", " ")}
          </span>
        ) : null}
        {result.address ? (
          <span className="font-mono text-xs text-[var(--color-kanbantic-muted)]">
            {result.address}
          </span>
        ) : null}
        {paymentTxHash ? (
          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-200">
            X402 paid
          </span>
        ) : null}
      </header>

      {paymentTxHash ? (
        <p className="text-xs text-[var(--color-kanbantic-muted)]">
          Audit complete — payment receipt:{" "}
          <a
            href={`${ETHERSCAN_TX}/${paymentTxHash}`}
            target="_blank"
            rel="noreferrer noopener"
            className="break-all font-mono text-cyan-300 hover:underline"
          >
            {paymentTxHash} ↗
          </a>
        </p>
      ) : null}

      {result.report ? (
        <article className="prose-invert max-w-none border-t border-white/10 pt-3">
          <Markdown source={result.report} />
        </article>
      ) : null}

      <footer className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-3 text-xs">
        {sourcifyUrl ? (
          <a
            href={sourcifyUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[var(--color-kanbantic-accent)] hover:underline"
          >
            View on Sourcify ↗
          </a>
        ) : null}
        <span className="text-[var(--color-kanbantic-muted)]">
          Swarm artifact pending — uploads land when Sponsor 1&apos;s verified-fetch lib ships.
        </span>
      </footer>
    </section>
  );
}
