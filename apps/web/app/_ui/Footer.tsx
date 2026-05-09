"use client";

import { useQuery } from "@tanstack/react-query";
import type { StatusResponse } from "@kanbantic/shared";

const API_BASE = process.env["NEXT_PUBLIC_KANBANTIC_API"] ?? "http://localhost:8787";

async function fetchStatus(): Promise<StatusResponse> {
  const response = await fetch(`${API_BASE}/api/status`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`status ${String(response.status)}`);
  }
  return (await response.json()) as StatusResponse;
}

export function Footer() {
  const { data, isError, isLoading } = useQuery({
    queryKey: ["status"],
    queryFn: fetchStatus,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    retry: false,
  });

  let dotClass = "bg-yellow-400";
  let label = "checking indexer";
  if (isError) {
    dotClass = "bg-red-500";
    label = "indexer down";
  } else if (data) {
    dotClass = "bg-green-500";
    label = `indexer healthy · block ${String(data.lastBlock)}`;
  } else if (isLoading) {
    dotClass = "bg-yellow-400";
    label = "checking indexer";
  }

  return (
    <footer className="mt-auto border-t border-white/10 bg-[var(--color-kanbantic-bg)]/80">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-4 py-4 text-xs text-[var(--color-kanbantic-muted)] sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[var(--color-kanbantic-fg)]">Kanbantic</span>
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider">
            ETHPrague 2026
          </span>
        </div>
        <div
          className="flex items-center gap-2"
          role="status"
          aria-live="polite"
          aria-label={label}
        >
          <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
          <span>{label}</span>
        </div>
      </div>
    </footer>
  );
}
