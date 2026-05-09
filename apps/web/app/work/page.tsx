/**
 * `/work` — bounty browse.
 *
 * Server component. Fetches the public bounty list from the worker API on
 * each request (with a 10s ISR window via `next.revalidate` set inside
 * `getWork`). Filtering happens server-side via the `?status=<value>` search
 * param so URLs are shareable; the chip row is the only client-side island.
 *
 * Empty state CTA links to `/post`, which Web 3 is shipping in parallel — the
 * link will 404 until that batch lands; that's expected.
 */

import Link from "next/link";

import { getWork } from "../_lib/api.js";
import { BountyCard } from "./_ui/BountyCard.js";
import { StatusFilter } from "./_ui/StatusFilter.js";

interface WorkPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkPage({ searchParams }: WorkPageProps) {
  const params = await searchParams;
  const rawStatus = params["status"];
  const statusFilter = typeof rawStatus === "string" ? rawStatus : null;

  const { bounties } = await getWork(50);
  const filtered =
    statusFilter === null ? bounties : bounties.filter((bounty) => bounty.status === statusFilter);

  return (
    <section className="flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Work</h1>
        <p className="text-sm text-[var(--color-kanbantic-muted)]">
          Browse on-chain bounties posted to the Kanbantic BountyBoard. Click a card to inspect a
          bounty&apos;s lifecycle.
        </p>
      </header>

      <StatusFilter />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-6 py-16 text-center">
          <p className="text-sm text-[var(--color-kanbantic-muted)]">
            {statusFilter === null
              ? "No bounties yet — be the first to post"
              : `No bounties match status “${statusFilter}”.`}
          </p>
          <Link
            href="/post"
            className="rounded-md bg-[var(--color-kanbantic-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-kanbantic-bg)] transition-opacity hover:opacity-90"
          >
            Post a bounty →
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((bounty) => (
            <li key={bounty.id}>
              <BountyCard bounty={bounty} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
