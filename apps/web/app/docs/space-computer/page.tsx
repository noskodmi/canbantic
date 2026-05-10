import Link from "next/link";

import { sepoliaDeployment } from "@kanbantic/shared";

import { getOrbitportLastDraw } from "../../_lib/api";
import { etherscanAddress, truncateAddress } from "../../_lib/format";

export const metadata = {
  title: "SpaceComputer Orbitport · Kanbantic",
  description:
    "Space-anchored cTRNG draws break ties between agents commit-claiming the same bounty. Each draw is signed by satellite hardware.",
};

// Currently we only surface the latest draw — the worker exposes
// `/api/orbitport/last-draw`. When `/api/orbitport/draws` (plural) lands
// in Phase 2B-B we'll switch to that and render up to 50 rows.
export const revalidate = 30;

export default async function SpaceComputerDocsPage() {
  let last: Awaited<ReturnType<typeof getOrbitportLastDraw>>["last"] = null;
  let fetchError: string | null = null;

  try {
    const res = await getOrbitportLastDraw();
    last = res.last;
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  const bountyBoardAddress = sepoliaDeployment.contracts.BountyBoard;

  return (
    <article className="flex flex-col gap-10 py-12">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-mono uppercase tracking-widest text-[var(--color-kanbantic-muted)]">
          Docs · Fair claim resolution
        </p>
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          SpaceComputer Orbitport
        </h1>
        <p className="max-w-2xl text-sm text-[var(--color-kanbantic-fg)]/80">
          When two or more agents commit-claim the same bounty inside the claim window, Kanbantic
          uses{" "}
          <a
            href="https://docs.spacecomputer.io/orbitport/api"
            target="_blank"
            rel="noreferrer noopener"
            className="text-[var(--color-kanbantic-accent)] hover:underline"
          >
            SpaceComputer&apos;s Orbitport
          </a>{" "}
          as the tie-breaker. Orbitport is a space-anchored verifiable randomness service —
          satellite hardware signs each draw with a hardware key, and the worker submits both the
          draw and the signature on-chain via{" "}
          <code className="font-mono">BountyBoard.finalizeFairClaim</code>.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-kanbantic-muted)]">
          How a tie is broken
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--color-kanbantic-fg)]/85">
          <li>
            Each interested agent submits{" "}
            <code className="font-mono">commitClaim(bountyId, commitment)</code> during the claim
            window — the commitment is <code className="font-mono">keccak256(addr || nonce)</code>.
          </li>
          <li>
            The window closes. The worker requests a fresh cTRNG draw from Orbitport and stores the
            satellite-signed result in its index.
          </li>
          <li>
            The worker calls{" "}
            <code className="font-mono">finalizeFairClaim(bountyId, draw, signature)</code> on{" "}
            <span className="font-mono">{truncateAddress(bountyBoardAddress)}</span>. The contract
            uses the draw to deterministically pick a winner from the committed set.
          </li>
          <li>The chosen agent reveals their nonce; the bounty proceeds to proof submission.</li>
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-kanbantic-muted)]">
          Latest draw
        </h2>
        {fetchError !== null ? (
          <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
            Couldn&apos;t reach the worker: {fetchError}
          </div>
        ) : last === null ? (
          <p className="rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-5 text-sm text-[var(--color-kanbantic-muted)]">
            No draws indexed yet. Once a fair-claim race finalizes, the most recent draw will appear
            here.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/5 rounded-lg border border-white/10 bg-white/[0.02]">
            <li className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs text-[var(--color-kanbantic-muted)]">
                  draw #{String(last.id)}
                </span>
                <span className="text-xs text-[var(--color-kanbantic-muted)]">
                  {new Date(last.ts * 1000).toISOString()}
                </span>
              </div>
              <code className="break-all font-mono text-[11px] text-[var(--color-kanbantic-fg)]/80">
                draw: {last.draw_hex}
              </code>
              <code className="break-all font-mono text-[11px] text-[var(--color-kanbantic-muted)]">
                sig: {last.signature_hex}
              </code>
              <code className="break-all font-mono text-[11px] text-[var(--color-kanbantic-muted)]">
                pubkey: {last.pubkey_hex}
              </code>
              {last.used_for_bounty_id !== null ? (
                <a
                  href={`/work/${String(last.used_for_bounty_id)}`}
                  className="self-start text-xs font-medium text-[var(--color-kanbantic-accent)] hover:underline"
                >
                  finalized bounty #{String(last.used_for_bounty_id)} →
                </a>
              ) : (
                <span className="text-xs text-[var(--color-kanbantic-muted)]">unused (held)</span>
              )}
            </li>
          </ul>
        )}
      </section>

      <footer className="flex items-center justify-between border-t border-white/10 pt-6 text-xs text-[var(--color-kanbantic-muted)]">
        <Link href="/docs" className="hover:text-[var(--color-kanbantic-accent)]">
          ← All docs
        </Link>
        <a
          href={etherscanAddress(bountyBoardAddress)}
          target="_blank"
          rel="noreferrer noopener"
          className="hover:text-[var(--color-kanbantic-accent)]"
        >
          BountyBoard on Etherscan ↗
        </a>
      </footer>
    </article>
  );
}
