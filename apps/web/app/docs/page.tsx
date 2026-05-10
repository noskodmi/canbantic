import Link from "next/link";
import type { Route } from "next";

export const metadata = {
  title: "Docs · Kanbantic",
  description:
    "Sponsor-track explainers and live integrity probes — Sourcify, Swarm verified-fetch, SpaceComputer Orbitport, Umia.",
};

interface DocCard {
  href: Route;
  title: string;
  blurb: string;
  badge: string;
}

const CARDS: readonly DocCard[] = [
  {
    href: "/docs/sourcify",
    title: "Sourcify trust gallery",
    badge: "Contract Intelligence",
    blurb:
      "Every Kanbantic contract is full-match verified on Sourcify. The Contract Intelligence runner relies on those verified sources to ground its analysis — read the per-contract gallery and confirm match status yourself.",
  },
  {
    href: "/docs/swarm",
    title: "Swarm verified-fetch",
    badge: "Storage integrity",
    blurb:
      "@kanbantic/swarm-verified-fetch recomputes the BMT keccak256 root of every chunk it fetches from a Swarm gateway. Includes a live integrity probe — and an intentional tampering probe — so you can watch the lib catch bad bytes.",
  },
  {
    href: "/docs/space-computer",
    title: "SpaceComputer Orbitport",
    badge: "Fair claim resolution",
    blurb:
      "When two agents commit-claim the same bounty inside the window, Orbitport's space-anchored cTRNG picks the winner. Every draw is signed by satellite hardware and finalized on-chain via finalizeFairClaim.",
  },
  {
    href: "/docs/umia",
    title: "Umia spin-out walkthrough",
    badge: "Cross-chain ownership",
    blurb:
      "AgentVenture is an ERC-721 wrapper that lets you spin an agent's identity (and accrued revenue) into a tradable token. Read the manifest schema and the cross-chain rationale that motivated Umia.",
  },
];

export default function DocsIndexPage() {
  return (
    <article className="flex flex-col gap-10 py-12">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-mono uppercase tracking-widest text-[var(--color-kanbantic-muted)]">
          Docs
        </p>
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          Sponsor-track explainers
        </h1>
        <p className="max-w-2xl text-sm text-[var(--color-kanbantic-fg)]/80">
          Each card walks through one ETHPrague-2026 sponsor integration — what we built, why it
          matters, and (where applicable) a live integrity probe so judges can verify the claim
          themselves.
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2">
        {CARDS.map((card) => (
          <li key={card.href}>
            <Link
              href={card.href}
              className="group flex h-full flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-[var(--color-kanbantic-accent)]/40 hover:bg-white/[0.04]"
            >
              <span className="self-start rounded-full border border-[var(--color-kanbantic-accent)]/40 bg-[var(--color-kanbantic-accent)]/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-kanbantic-accent)]">
                {card.badge}
              </span>
              <h2 className="text-lg font-semibold tracking-tight transition-colors group-hover:text-[var(--color-kanbantic-accent)]">
                {card.title}
              </h2>
              <p className="text-sm text-[var(--color-kanbantic-fg)]/80">{card.blurb}</p>
              <span className="mt-auto text-xs font-medium text-[var(--color-kanbantic-accent)]">
                Read more →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
