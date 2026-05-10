"use client";

/**
 * `OrbitportWaitingPanel` — replaces the "Commit claim" form on a fair-claim
 * bounty whose commit window has closed but whose `BountyClaimFinalized`
 * event hasn't landed yet.
 *
 * Polls two read-only endpoints:
 *   - `/api/status` for the latest indexed Sepolia block (so the UI knows
 *     when the commit window has actually closed).
 *   - `/api/orbitport/last-draw` for the most recent verified Orbitport
 *     draw. Refreshes every 5s while we're waiting on a finalize.
 *
 * Once the indexer picks up `BountyClaimFinalized`, the bounty's status
 * transitions to `ClaimWindowClosed` and the parent page re-renders
 * with the existing terminal copy — this panel disappears automatically.
 *
 * Includes a "How fair-claim works" disclosure linking the on-chain
 * BountyBoard tx + the Orbitport last-draw API, so a judge can paste
 * the tx hash, fetch the JSON, and re-verify the Ed25519 signature
 * end-to-end without any tooling beyond their browser.
 */

import { useQuery } from "@tanstack/react-query";
import type { BountySummary, OrbitportLastDrawResponse, StatusResponse } from "@kanbantic/shared";

import { API_BASE } from "../../../_lib/api.js";

interface OrbitportWaitingPanelProps {
  bounty: BountySummary;
  /** Etherscan address page for the BountyBoard contract. */
  bountyBoardEtherscan: string;
}

async function fetchStatus(): Promise<StatusResponse> {
  const res = await fetch(`${API_BASE}/api/status`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`status ${String(res.status)}`);
  return (await res.json()) as StatusResponse;
}

async function fetchLastDraw(): Promise<OrbitportLastDrawResponse> {
  const res = await fetch(`${API_BASE}/api/orbitport/last-draw`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`last-draw ${String(res.status)}`);
  return (await res.json()) as OrbitportLastDrawResponse;
}

function formatTimestamp(ts: number): string {
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const date = new Date(ms);
  return date
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "Z");
}

export function OrbitportWaitingPanel({
  bounty,
  bountyBoardEtherscan,
}: OrbitportWaitingPanelProps) {
  const status = useQuery({
    queryKey: ["status"],
    queryFn: fetchStatus,
    refetchInterval: 10_000,
    retry: false,
  });

  const lastDraw = useQuery({
    queryKey: ["orbitport", "last-draw"],
    queryFn: fetchLastDraw,
    refetchInterval: 5_000,
    retry: false,
  });

  const closeBlock =
    bounty.claim_window_start_block !== null && bounty.claim_window_blocks > 0
      ? bounty.claim_window_start_block + bounty.claim_window_blocks
      : null;

  const draw = lastDraw.data?.last ?? null;
  const usedForUs = draw?.used_for_bounty_id === Number(bounty.id);

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-purple-400/30 bg-purple-500/[0.06] p-4">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 animate-pulse rounded-full bg-purple-300"
        />
        <h3 className="text-sm font-semibold text-purple-100">
          Waiting for Orbitport finalization…
        </h3>
      </div>

      <p className="text-sm text-[var(--color-kanbantic-fg)]/85">
        The commit window has closed. The worker is fetching a fresh{" "}
        <a
          href="https://docs.spacecomputer.io/orbitport/ctrng"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-[var(--color-kanbantic-accent)]"
        >
          SpaceComputer Orbitport cTRNG
        </a>{" "}
        draw and submitting <code className="font-mono text-xs">finalizeFairClaim</code> on Sepolia.
        This page updates automatically once the tx confirms.
      </p>

      <dl
        data-testid="orbitport-status-grid"
        className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2"
      >
        <div className="flex flex-col rounded-md border border-white/10 bg-black/20 px-3 py-2">
          <dt className="text-[var(--color-kanbantic-muted)]">Indexed block</dt>
          <dd className="font-mono text-[var(--color-kanbantic-fg)]">
            {status.data ? String(status.data.lastBlock) : "—"}
          </dd>
        </div>
        <div className="flex flex-col rounded-md border border-white/10 bg-black/20 px-3 py-2">
          <dt className="text-[var(--color-kanbantic-muted)]">Latest Orbitport draw</dt>
          <dd className="font-mono text-[var(--color-kanbantic-fg)]">
            {draw ? formatTimestamp(draw.ts) : "no draw yet"}
          </dd>
        </div>
      </dl>

      {draw ? (
        <div
          data-testid="orbitport-draw-preview"
          className="flex flex-col gap-1 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs"
        >
          <span className="text-[var(--color-kanbantic-muted)]">draw (32 bytes)</span>
          <code className="break-all font-mono">{draw.draw_hex}</code>
          <span className="mt-2 text-[var(--color-kanbantic-muted)]">sig (Ed25519, 64 bytes)</span>
          <code className="break-all font-mono">{draw.signature_hex}</code>
          {usedForUs ? (
            <p className="mt-1 text-purple-200">
              ↑ This draw was used to finalize bounty #{bounty.id}.
            </p>
          ) : null}
        </div>
      ) : null}

      <details className="text-xs text-[var(--color-kanbantic-muted)]">
        <summary className="cursor-pointer text-[var(--color-kanbantic-fg)]/80 hover:text-[var(--color-kanbantic-accent)]">
          How fair-claim works (verify it yourself)
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Anyone could commit <code className="font-mono">keccak256(addr || nonce)</code> during
            the {String(bounty.claim_window_blocks)}-block window.
          </li>
          <li>
            At window close, the worker pulls a 32-byte draw + Ed25519 signature from Orbitport and
            verifies it locally against the pinned operator public key.
          </li>
          <li>
            The worker submits{" "}
            <code className="font-mono">finalizeFairClaim(bountyId, draw, sig)</code> from the
            deployer wallet.{" "}
            <a
              href={bountyBoardEtherscan}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[var(--color-kanbantic-accent)]"
            >
              BountyBoard on Etherscan
            </a>{" "}
            shows the call.
          </li>
          <li>
            Cross-verify against the live draw at{" "}
            <a
              href={`${API_BASE}/api/orbitport/last-draw`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[var(--color-kanbantic-accent)]"
            >
              /api/orbitport/last-draw
            </a>
            .
          </li>
        </ol>
        {closeBlock !== null ? (
          <p className="mt-2">Window-close block: {String(closeBlock)}.</p>
        ) : null}
      </details>
    </section>
  );
}
