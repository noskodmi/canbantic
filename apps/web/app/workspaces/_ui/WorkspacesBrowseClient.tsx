"use client";

/**
 * `/workspaces` browse island.
 *
 * Sources the workspace list from `WorkspaceCreated` event history
 * via wagmi (no worker endpoint yet — Phase 2B). For each row, also
 * filters the indexer's bounty list to count how many bounties live
 * inside that workspace.
 *
 * If the wallet is not connected we still show the list (workspaces
 * are public). The "New workspace" CTA always points at
 * `/workspaces/new`.
 */

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";
import type { BountyListResponse } from "@kanbantic/shared";

import { getWork } from "../../_lib/api.js";
import { useWorkspaceList } from "../_lib/use-workspace-events.js";
import { WorkspaceCard } from "./WorkspaceCard.js";

export function WorkspacesBrowseClient() {
  const list = useWorkspaceList();

  const bountiesQuery = useQuery<BountyListResponse>({
    queryKey: ["bounties", "all", "for-workspaces"],
    queryFn: () => getWork(200),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const bountyCountByNode = useMemo(() => {
    const map = new Map<string, number>();
    if (bountiesQuery.data === undefined) return map;
    for (const bounty of bountiesQuery.data.bounties) {
      const key = bounty.workspace_node.toLowerCase();
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [bountiesQuery.data]);

  return (
    <section className="flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Workspaces</h1>
          <p className="max-w-2xl text-sm text-[var(--color-kanbantic-muted)]">
            ENS-shaped namespaces under <span className="font-mono">kanbantic.eth</span>. Each
            workspace has an admin and a member set, and bounties posted from inside the workspace
            inherit its access controls.
          </p>
        </div>
        <Link
          href="/workspaces/new"
          className="self-start rounded-md bg-[var(--color-kanbantic-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-kanbantic-bg)] transition-opacity hover:opacity-90"
        >
          New workspace →
        </Link>
      </header>

      {list.isLoading ? (
        <p className="text-sm text-[var(--color-kanbantic-muted)]">Loading workspaces…</p>
      ) : list.isError ? (
        <div
          role="alert"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          Failed to load workspaces: {list.error.message}
        </div>
      ) : list.data === undefined || list.data.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-6 py-16 text-center">
          <p className="text-sm text-[var(--color-kanbantic-muted)]">
            No workspaces yet — be the first to create one.
          </p>
          <Link
            href="/workspaces/new"
            className="rounded-md bg-[var(--color-kanbantic-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-kanbantic-bg)] transition-opacity hover:opacity-90"
          >
            Create a workspace →
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.data.map((row) => (
            <li key={row.node}>
              <WorkspaceCard
                row={row}
                bountyCount={bountyCountByNode.get(row.node.toLowerCase()) ?? 0}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
