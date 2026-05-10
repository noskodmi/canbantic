"use client";

/**
 * Single workspace row on `/workspaces`.
 *
 * Member count is computed lazily by `useWorkspaceMembers` (one
 * `getLogs` per row). For lots of workspaces this is N+1; we accept
 * it for Phase 3 because each request hits the in-memory wagmi cache
 * and the alternative (one mega-query for every wsNode) is worse.
 *
 * Bounty count is passed in from the parent — already fetched for
 * the whole list via `getWork()` and bucketed by `workspace_node`.
 */

import Link from "next/link";
import type { Route } from "next";
import { sepoliaDeployment } from "@kanbantic/shared";

import { AddressBadge } from "../../_ui/AddressBadge.js";
import { truncateAddress } from "../../_lib/format.js";
import { useWorkspaceMembers } from "../_lib/use-workspace-events.js";
import type { WorkspaceRow } from "../_lib/types.js";

const ROOT_NAME = sepoliaDeployment.ens.rootName;

interface WorkspaceCardProps {
  row: WorkspaceRow;
  bountyCount: number;
}

function truncateNode(node: string): string {
  if (node.length <= 14) return node;
  return `${node.slice(0, 8)}…${node.slice(-6)}`;
}

export function WorkspaceCard({ row, bountyCount }: WorkspaceCardProps) {
  const members = useWorkspaceMembers(row.node);
  const memberCount = members.data?.members.length ?? null;

  // Slug for the detail link: prefer the human label so the URL is
  // readable; fall back to the namehash for workspaces created via
  // some other UI we don't have a label cache for.
  const slug = row.label ?? row.node;
  const displayName = row.label !== null ? `${row.label}.${ROOT_NAME}` : truncateNode(row.node);

  return (
    <article className="flex h-full flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-[var(--color-kanbantic-accent)]/60">
      <div className="flex flex-col gap-1">
        <Link
          href={`/workspaces/${slug}` as Route}
          className="break-all text-base font-semibold text-[var(--color-kanbantic-fg)] hover:text-[var(--color-kanbantic-accent)]"
        >
          {displayName}
        </Link>
        {row.label !== null ? (
          <p className="break-all font-mono text-[10px] text-[var(--color-kanbantic-muted)]">
            {truncateNode(row.node)}
          </p>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-3 border-t border-white/10 pt-3 text-xs">
        <div className="flex flex-col gap-1">
          <dt className="text-[var(--color-kanbantic-muted)]">Admin</dt>
          <dd>
            <AddressBadge address={row.admin} />
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-[var(--color-kanbantic-muted)]">Members</dt>
          <dd className="font-mono text-sm text-[var(--color-kanbantic-fg)]">
            {memberCount ?? "…"}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-[var(--color-kanbantic-muted)]">Bounties</dt>
          <dd className="font-mono text-sm text-[var(--color-kanbantic-fg)]">{bountyCount}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-[var(--color-kanbantic-muted)]">Created at</dt>
          <dd className="font-mono text-sm text-[var(--color-kanbantic-fg)]">
            block {row.createdAtBlock.toString()}
          </dd>
        </div>
      </dl>

      <div className="mt-auto flex items-center justify-between border-t border-white/10 pt-3">
        {bountyCount > 0 ? (
          <Link
            href={`/work?workspace=${row.node}`}
            className="text-xs text-[var(--color-kanbantic-muted)] hover:text-[var(--color-kanbantic-accent)]"
          >
            View {bountyCount} {bountyCount === 1 ? "bounty" : "bounties"} →
          </Link>
        ) : (
          <span className="text-xs text-[var(--color-kanbantic-muted)]">No bounties yet</span>
        )}
        <Link
          href={`/workspaces/${slug}` as Route}
          className="text-xs font-semibold text-[var(--color-kanbantic-accent)] hover:underline"
        >
          View →
        </Link>
      </div>

      <span className="sr-only">admin {truncateAddress(row.admin)}</span>
    </article>
  );
}
