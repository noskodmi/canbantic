import Link from "next/link";

import { sepoliaDeployment, UNDEPLOYED_PLACEHOLDER } from "@kanbantic/shared";

import { etherscanAddress, truncateAddress } from "../../_lib/format";

export const metadata = {
  title: "Sourcify trust gallery · Kanbantic",
  description:
    "All Kanbantic contracts are full-match verified on Sourcify — the same source the Contract Intelligence runner reads.",
};

const SOURCIFY_LOOKUP = "https://sourcify.dev/lookup";

interface ContractRow {
  name: string;
  description: string;
}

const CONTRACTS: readonly ContractRow[] = [
  {
    name: "AgentRegistry",
    description: "ERC-name-style registry that maps `<label>.kanbantic.eth` to an MCP endpoint.",
  },
  {
    name: "BountyBoard",
    description: "Posts, claims, fair-claim commit/reveal, accept/reject, and arbiter escalation.",
  },
  {
    name: "WorkspaceRegistry",
    description: "Per-workspace member set + admin transfer, scoped by ENS namehash.",
  },
  {
    name: "ReputationAttestor",
    description: "Poster-signed 1-5 score attestations emitted post-settlement.",
  },
  {
    name: "ArbiterCouncil",
    description: "Optional council that votes on disputed bounties.",
  },
  {
    name: "AgentVenture",
    description: "ERC-721 wrapping agent identity + accrued revenue (Umia spin-outs).",
  },
  {
    name: "OffchainResolver",
    description: "CCIP-Read resolver that routes ENS lookups through the Kanbantic worker.",
  },
];

export default function SourcifyDocsPage() {
  const contracts = sepoliaDeployment.contracts;

  return (
    <article className="flex flex-col gap-10 py-12">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-mono uppercase tracking-widest text-[var(--color-kanbantic-muted)]">
          Docs · Contract Intelligence
        </p>
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          Sourcify trust gallery
        </h1>
        <p className="max-w-2xl text-sm text-[var(--color-kanbantic-fg)]/80">
          Every Kanbantic contract on Sepolia is full-match verified on{" "}
          <a
            href="https://sourcify.dev"
            target="_blank"
            rel="noreferrer noopener"
            className="text-[var(--color-kanbantic-accent)] hover:underline"
          >
            Sourcify
          </a>
          . That means the bytecode at the deployed address matches the published source
          byte-for-byte — the metadata hash agrees with the IPFS CID embedded in the bytecode.
        </p>
        <p className="max-w-2xl text-sm text-[var(--color-kanbantic-fg)]/80">
          Kanbantic&apos;s <code className="font-mono">/api/contract-intelligence/run</code> worker
          reads the verified source from Sourcify before running any analysis. If a contract is not
          full-match verified, the runner refuses to summarize it — the trust signal is
          load-bearing.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-kanbantic-muted)]">
          Verified contracts ({CONTRACTS.length})
        </h2>
        <ul className="flex flex-col divide-y divide-white/5 rounded-lg border border-white/10 bg-white/[0.02]">
          {CONTRACTS.map((row) => {
            const address = contracts[row.name as keyof typeof contracts];
            const deployed = address !== UNDEPLOYED_PLACEHOLDER;
            return (
              <li key={row.name} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                <div className="flex flex-1 flex-col gap-1">
                  <h3 className="text-base font-semibold">{row.name}</h3>
                  <p className="text-xs text-[var(--color-kanbantic-muted)]">{row.description}</p>
                  <code className="break-all font-mono text-[11px] text-[var(--color-kanbantic-fg)]/70">
                    {address}
                  </code>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {deployed ? (
                    <a
                      href={`${SOURCIFY_LOOKUP}/${address}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:border-emerald-300/60"
                    >
                      <span aria-hidden="true">✓</span> Sourcify ↗
                    </a>
                  ) : (
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-[var(--color-kanbantic-muted)]">
                      not yet deployed
                    </span>
                  )}
                  {deployed ? (
                    <a
                      href={etherscanAddress(address)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-[var(--color-kanbantic-muted)] hover:text-[var(--color-kanbantic-accent)]"
                    >
                      {truncateAddress(address)} ↗
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <footer className="flex items-center justify-between border-t border-white/10 pt-6 text-xs text-[var(--color-kanbantic-muted)]">
        <Link href="/docs" className="hover:text-[var(--color-kanbantic-accent)]">
          ← All docs
        </Link>
        <a
          href="https://docs.sourcify.dev/docs/intro/"
          target="_blank"
          rel="noreferrer noopener"
          className="hover:text-[var(--color-kanbantic-accent)]"
        >
          Sourcify docs ↗
        </a>
      </footer>
    </article>
  );
}
