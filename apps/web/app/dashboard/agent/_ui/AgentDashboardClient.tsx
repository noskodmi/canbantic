"use client";

/**
 * Wallet-scoped agent dashboard island.
 *
 * Reads the connected wallet via wagmi, filters the indexer-supplied
 * agent list to the ones this address owns, and decorates each row
 * with bounty-derived stats (claimed count, settled revenue). When
 * the agent's settled revenue clears the Umia threshold, surfaces
 * the "Spin out as Umia venture" CTA from spec §6.
 *
 * The CTA opens a "Mint AgentVenture" modal that calls
 * `AgentVenture.mint(agentNode, accruedRevenueRoot, swarmTokenURI)`
 * via wagmi. After the mint receipt confirms, we decode the
 * `AgentVentureMinted` event off the receipt logs to recover the
 * tokenId, then surface the Umia CLI manifest with the real
 * `--kanbantic-vid <tokenId>` arg the user can copy.
 */

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { AgentVentureAbi, type AgentSummary, type BountySummary } from "@kanbantic/shared";
import { decodeEventLog, type Hex } from "viem";
import { useAccount, useWaitForTransactionReceipt } from "wagmi";

import { ReputationStars } from "../../../_ui/ReputationStars.js";
import { parseCapabilities } from "../../../_lib/format.js";
import { useAgentVenture } from "../../../_lib/contracts.js";
import { formatEth } from "../../../work/_lib/format.js";
import { DashboardLayout } from "../../_ui/DashboardLayout.js";
import { EmptyState } from "../../_ui/EmptyState.js";
import { filterByClaimer, filterByOwner, sumSettledRewardsForAgent } from "../../_lib/filters.js";
import {
  buildUmiaCliManifest,
  SWARM_PLACEHOLDER_URI,
  UMIA_THRESHOLD_WEI,
} from "../../_lib/umia.js";

interface AgentDashboardClientProps {
  agents: readonly AgentSummary[];
  bounties: readonly BountySummary[];
}

export function AgentDashboardClient({ agents, bounties }: AgentDashboardClientProps) {
  const { address, isConnected } = useAccount();

  const owned = useMemo<AgentSummary[]>(() => {
    if (!address) return [];
    return filterByOwner(agents, address);
  }, [agents, address]);

  return (
    <DashboardLayout
      title="Agent dashboard"
      description={
        <>
          Every agent you own across <span className="font-mono">kanbantic.eth</span>. Reputation,
          claimed bounties, and settled revenue stream live from the indexer; the Umia spin-out CTA
          arms when revenue clears 0.005 ETH.
        </>
      }
      walletConnected={isConnected}
      connectSlot={<ConnectButton />}
    >
      {owned.length === 0 ? (
        <EmptyState
          headline="You haven't registered any agents yet."
          body={
            <>
              Register an agent under <span className="font-mono">kanbantic.eth</span> to claim
              bounties, accrue reputation, and unlock the Umia spin-out flow.
            </>
          }
          cta={
            <Link
              href="/register"
              className="inline-flex rounded-md bg-[var(--color-kanbantic-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-kanbantic-bg)] transition-opacity hover:opacity-90"
            >
              Register an agent →
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {owned.map((agent) => (
            <li key={agent.node}>
              <OwnedAgentRow agent={agent} bounties={bounties} />
            </li>
          ))}
        </ul>
      )}
    </DashboardLayout>
  );
}

interface OwnedAgentRowProps {
  agent: AgentSummary;
  bounties: readonly BountySummary[];
}

function OwnedAgentRow({ agent, bounties }: OwnedAgentRowProps) {
  const claimed = useMemo(() => filterByClaimer(bounties, agent.node), [bounties, agent.node]);
  const settledWei = useMemo(
    () => sumSettledRewardsForAgent(bounties, agent.node),
    [bounties, agent.node],
  );
  const settledLabel = settledWei === 0n ? "0 ETH" : formatEth(settledWei.toString());
  const tags = parseCapabilities(agent.capabilities);
  const ensName = `${agent.label}.kanbantic.eth`;
  const umiaArmed = settledWei >= UMIA_THRESHOLD_WEI;

  return (
    <article className="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.02] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <Link
            href={`/agents/${agent.label}` as Route}
            className="text-lg font-semibold tracking-tight text-[var(--color-kanbantic-fg)] hover:text-[var(--color-kanbantic-accent)]"
          >
            {ensName}
          </Link>
          {tags.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] tracking-wide text-[var(--color-kanbantic-fg)]/80"
                >
                  {tag}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs italic text-[var(--color-kanbantic-muted)]">
              no capabilities listed
            </p>
          )}
        </div>
        <ReputationStars score={agent.reputation_score} count={agent.reputation_count} />
      </div>

      <dl className="grid grid-cols-2 gap-3 border-t border-white/10 pt-3 text-xs sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className="text-[var(--color-kanbantic-muted)]">Bounties claimed</dt>
          <dd className="font-mono text-base text-[var(--color-kanbantic-fg)]">{claimed.length}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-[var(--color-kanbantic-muted)]">Settled revenue</dt>
          <dd className="font-mono text-base text-[var(--color-kanbantic-fg)]">{settledLabel}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-[var(--color-kanbantic-muted)]">Umia threshold</dt>
          <dd
            className={
              umiaArmed
                ? "font-mono text-base text-emerald-300"
                : "font-mono text-base text-[var(--color-kanbantic-muted)]"
            }
          >
            {umiaArmed ? "Reached" : "0.005 ETH"}
          </dd>
        </div>
      </dl>

      <UmiaSpinOutCta agent={agent} bountiesClaimedCount={claimed.length} armed={umiaArmed} />
    </article>
  );
}

interface UmiaSpinOutCtaProps {
  agent: AgentSummary;
  bountiesClaimedCount: number;
  armed: boolean;
}

/**
 * The "Spin out as Umia venture" CTA. Three-state UI:
 *  1. closed — primary button.
 *  2. modal-open, pre-mint — explains the AgentVenture mint, with a Mint
 *     button that calls the contract via wagmi. Disabled (with tooltip)
 *     when the contract is the zero-address placeholder.
 *  3. post-mint — shows the Umia CLI manifest populated with the freshly
 *     minted `--kanbantic-vid <tokenId>` arg + a Copy button.
 */
function UmiaSpinOutCta({ agent, bountiesClaimedCount, armed }: UmiaSpinOutCtaProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [tokenId, setTokenId] = useState<bigint | null>(null);
  const [copied, setCopied] = useState(false);

  const venture = useAgentVenture();
  const receipt = useWaitForTransactionReceipt({ hash: venture.hash });

  // Decode `AgentVentureMinted` off the confirmed receipt to recover tokenId.
  useEffect(() => {
    if (!receipt.isSuccess || tokenId !== null) return;
    for (const log of receipt.data.logs) {
      try {
        const decoded = decodeEventLog({
          abi: AgentVentureAbi,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === "AgentVentureMinted") {
          // viem types `args` as `unknown` for ABI-narrowed events; cast to the
          // shape we know the contract emits.
          const args = decoded.args as unknown as { tokenId: bigint };
          setTokenId(args.tokenId);
          return;
        }
      } catch {
        // Not an AgentVenture log — skip silently.
      }
    }
  }, [receipt.isSuccess, receipt.data, tokenId]);

  const manifest = useMemo(
    () =>
      buildUmiaCliManifest({
        agent,
        bountiesClaimed: bountiesClaimedCount,
        ventureTokenId: tokenId,
        swarmTokenURI: SWARM_PLACEHOLDER_URI,
      }),
    [agent, bountiesClaimedCount, tokenId],
  );

  if (!armed) {
    return (
      <p className="text-xs text-[var(--color-kanbantic-muted)]">
        Once settled revenue reaches 0.005 ETH, you can spin this agent out as a Umia venture.
      </p>
    );
  }

  function openModal() {
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    venture.reset();
    setTokenId(null);
    setCopied(false);
  }

  function handleMint() {
    if (!venture.isDeployed) return;
    venture.mint({
      agentNode: agent.node as Hex,
      // v0.1: pass zero — the on-chain contract stores it opaquely.
      accruedRevenueRoot: "0x0000000000000000000000000000000000000000000000000000000000000000",
      swarmTokenURI: SWARM_PLACEHOLDER_URI,
    });
  }

  async function copyManifest() {
    try {
      await navigator.clipboard.writeText(manifest);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      // Clipboard blocked (insecure context, etc.) — surface nothing; user
      // can still copy from the visible textarea.
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-white/10 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-emerald-300">
          Settled revenue clears the Umia threshold — this agent is eligible to spin out.
        </p>
        <button
          type="button"
          onClick={openModal}
          className="rounded-md border border-[var(--color-kanbantic-accent)]/40 bg-[var(--color-kanbantic-accent)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--color-kanbantic-accent)] hover:bg-[var(--color-kanbantic-accent)]/20"
        >
          Spin out as Umia venture
        </button>
      </div>

      {modalOpen ? (
        <UmiaMintModal
          ensName={`${agent.label}.kanbantic.eth`}
          isDeployed={venture.isDeployed}
          isPending={venture.isPending}
          isConfirming={Boolean(venture.hash) && receipt.isLoading}
          isConfirmed={receipt.isSuccess && tokenId !== null}
          error={venture.error?.message ?? receipt.error?.message ?? null}
          tokenId={tokenId}
          manifest={manifest}
          copied={copied}
          onMint={handleMint}
          onCopy={() => {
            void copyManifest();
          }}
          onClose={closeModal}
        />
      ) : null}
    </div>
  );
}

interface UmiaMintModalProps {
  ensName: string;
  isDeployed: boolean;
  isPending: boolean;
  isConfirming: boolean;
  isConfirmed: boolean;
  error: string | null;
  tokenId: bigint | null;
  manifest: string;
  copied: boolean;
  onMint: () => void;
  onCopy: () => void;
  onClose: () => void;
}

function UmiaMintModal({
  ensName,
  isDeployed,
  isPending,
  isConfirming,
  isConfirmed,
  error,
  tokenId,
  manifest,
  copied,
  onMint,
  onCopy,
  onClose,
}: UmiaMintModalProps) {
  const headlineId = `umia-mint-${ensName}`;
  const mintDisabled = !isDeployed || isPending || isConfirming || isConfirmed;
  const mintLabel = isConfirmed
    ? `Minted #${tokenId?.toString() ?? "?"}`
    : isConfirming
      ? "Confirming…"
      : isPending
        ? "Confirm in wallet…"
        : "Mint AgentVenture";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headlineId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="flex w-full max-w-lg flex-col gap-4 rounded-lg border border-white/10 bg-[var(--color-kanbantic-bg)] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2
            id={headlineId}
            className="text-lg font-semibold tracking-tight text-[var(--color-kanbantic-fg)]"
          >
            Mint AgentVenture ERC-721 first
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--color-kanbantic-muted)] hover:text-[var(--color-kanbantic-fg)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-[var(--color-kanbantic-muted)]">
          Spinning <span className="font-mono">{ensName}</span> out as a Umia venture mints a{" "}
          <span className="font-mono">Kanbantic Agent Venture</span> (KAV) ERC-721. The token wraps
          the agent&apos;s namehash plus a placeholder Swarm tokenURI; the Umia CLI references it
          via <span className="font-mono">--kanbantic-vid &lt;tokenId&gt;</span>.
        </p>

        {!isDeployed ? (
          <p
            role="status"
            title="Contract not yet deployed to Sepolia — coming in next deploy"
            className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200"
          >
            Contract not yet deployed to Sepolia — coming in next deploy. The mint button is
            disabled until the controller publishes the AgentVenture address.
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-red-500/30 bg-red-500/10 p-3 font-mono text-[11px] text-red-300"
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onMint}
            disabled={mintDisabled}
            title={
              !isDeployed
                ? "Contract not yet deployed to Sepolia — coming in next deploy"
                : undefined
            }
            className="rounded-md bg-[var(--color-kanbantic-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-kanbantic-bg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {mintLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/10 px-4 py-2 text-sm text-[var(--color-kanbantic-fg)]/80 hover:border-[var(--color-kanbantic-accent)] hover:text-[var(--color-kanbantic-accent)]"
          >
            {isConfirmed ? "Done" : "Cancel"}
          </button>
        </div>

        {isConfirmed && tokenId !== null ? (
          <div className="flex flex-col gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="text-[11px] text-emerald-300">
              AgentVenture #{tokenId.toString()} minted. Copy the manifest below into your terminal
              to apply for Umia funding.
            </p>
            <pre className="max-h-72 overflow-auto rounded bg-black/50 p-3 font-mono text-[11px] text-[var(--color-kanbantic-fg)]/90">
              {manifest}
            </pre>
            <button
              type="button"
              onClick={onCopy}
              className="self-start rounded-md border border-white/10 px-3 py-1 text-xs text-[var(--color-kanbantic-fg)]/80 hover:border-[var(--color-kanbantic-accent)] hover:text-[var(--color-kanbantic-accent)]"
            >
              {copied ? "Copied!" : "Copy CLI command"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
