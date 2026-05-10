/**
 * `/work` — kanban-style task board.
 *
 * Server component. Pulls all bounties (capability/poster filters
 * still apply via query params) and groups them into Open / Claimed /
 * Submitted / Resolved columns. Single-click access to "Post a task"
 * lives at the top.
 */

import Link from "next/link";
import { Suspense } from "react";

import type { BountySummary } from "@kanbantic/shared";

import { getWork } from "../_lib/api.js";
import { BountyCard } from "./_ui/BountyCard.js";
import { WorkFilters } from "./_ui/WorkFilters.js";

interface WorkPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface Column {
  key: "open" | "claimed" | "submitted" | "resolved";
  label: string;
  /** Statuses from the contract that bucket into this column. */
  statuses: readonly string[];
  /** Helper copy when the column is empty. */
  empty: string;
}

const COLUMNS: readonly Column[] = [
  {
    key: "open",
    label: "Open",
    statuses: ["Open", "ClaimWindowOpen"],
    empty: "Nothing to claim right now.",
  },
  {
    key: "claimed",
    label: "Claimed",
    statuses: ["Claimed"],
    empty: "No tasks in progress.",
  },
  {
    key: "submitted",
    label: "Submitted",
    statuses: ["Submitted"],
    empty: "No proofs awaiting review.",
  },
  {
    key: "resolved",
    label: "Done",
    statuses: ["Resolved", "Refunded", "Disputed"],
    empty: "No settled tasks yet.",
  },
];

function pickString(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

function bucketFor(status: string): Column["key"] | null {
  for (const col of COLUMNS) {
    if (col.statuses.includes(status)) return col.key;
  }
  return null;
}

export default async function WorkPage({ searchParams }: WorkPageProps) {
  const params = await searchParams;
  const capabilityFilter = pickString(params["capability"]);
  const posterFilter = pickString(params["poster"]);

  // Pull a wide page so all four columns are populated. The worker
  // caps at 200; that's plenty for a hackathon-scale board.
  const { bounties } = await getWork({
    limit: 200,
    capability: capabilityFilter,
    poster: posterFilter,
  });

  const grouped = new Map<Column["key"], BountySummary[]>(COLUMNS.map((c) => [c.key, []]));
  for (const bounty of bounties) {
    const key = bucketFor(bounty.status);
    if (key !== null) grouped.get(key)?.push(bounty);
  }

  const total = bounties.length;
  const hasFilter = capabilityFilter !== undefined || posterFilter !== undefined;

  return (
    <section className="flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Kanban</h1>
          <p className="text-sm text-[var(--color-kanbantic-muted)]">
            Tasks escrowed on <span className="font-mono">BountyBoard</span>, grouped by lifecycle
            stage.{" "}
            {total === 0
              ? "Nothing here yet."
              : `${String(total)} task${total === 1 ? "" : "s"} on the board.`}
          </p>
        </div>
        <Link
          href="/post"
          className="self-start rounded-md bg-[var(--color-kanbantic-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-kanbantic-bg)] transition-opacity hover:opacity-90 sm:self-auto"
        >
          + Create task
        </Link>
      </header>

      <Suspense fallback={null}>
        <WorkFilters />
      </Suspense>

      {total === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-6 py-16 text-center">
          <p className="text-sm text-[var(--color-kanbantic-muted)]">
            {hasFilter
              ? "No tasks match the current filters."
              : "No tasks yet — be the first to post one."}
          </p>
          <Link
            href="/post"
            className="rounded-md bg-[var(--color-kanbantic-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-kanbantic-bg)] transition-opacity hover:opacity-90"
          >
            + Create task
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-4">
          {COLUMNS.map((col) => {
            const items = grouped.get(col.key) ?? [];
            return (
              <div
                key={col.key}
                className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3"
                data-testid={`kanban-column-${col.key}`}
              >
                <div className="flex items-baseline justify-between gap-2 px-1">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-kanbantic-fg)]">
                    {col.label}
                  </h2>
                  <span className="font-mono text-xs text-[var(--color-kanbantic-muted)]">
                    {items.length}
                  </span>
                </div>
                {items.length === 0 ? (
                  <p className="rounded-md border border-dashed border-white/10 px-3 py-6 text-center text-xs text-[var(--color-kanbantic-muted)]">
                    {col.empty}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {items.map((bounty) => (
                      <li key={bounty.id}>
                        <BountyCard bounty={bounty} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
