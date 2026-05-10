"use client";

/**
 * Contract Intelligence — persisted reports history.
 *
 * Polls /api/contract-intelligence/runs every 10s so a freshly-completed
 * run from the form on the same page surfaces here without a manual
 * refresh. Each row links to /dashboard/contract-intelligence/runs/[id]
 * for the full report.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

const API_BASE: string = process.env["NEXT_PUBLIC_KANBANTIC_API"] ?? "http://localhost:8787";

interface RunRow {
  id: number;
  address: string;
  kind: "audit" | "explain" | "similarity";
  sourcify_match: string;
  llm: string;
  model: string | null;
  ts: number;
  report_excerpt: string;
}

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function relative(ts: number): string {
  const seconds = Math.max(1, Math.floor(Date.now() / 1000) - ts);
  if (seconds < 60) return `${String(seconds)}s ago`;
  if (seconds < 3600) return `${String(Math.floor(seconds / 60))}m ago`;
  if (seconds < 86_400) return `${String(Math.floor(seconds / 3600))}h ago`;
  return `${String(Math.floor(seconds / 86_400))}d ago`;
}

export function ReportHistory() {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const res = await fetch(`${API_BASE}/api/contract-intelligence/runs?limit=50`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
        const body = (await res.json()) as { runs: RunRow[] };
        if (!cancelled) setRuns(body.runs);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "fetch failed");
        }
      }
    }
    void load();
    const interval = setInterval(() => void load(), 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-kanbantic-muted)]">
          Past reports {runs !== null ? `(${String(runs.length)})` : ""}
        </h2>
        <p className="text-xs text-[var(--color-kanbantic-muted)]">
          Persisted in D1, refreshed every 10s.
        </p>
      </div>

      {error !== null ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300">
          History unavailable: {error}
        </p>
      ) : runs === null ? (
        <p className="text-xs text-[var(--color-kanbantic-muted)]">Loading…</p>
      ) : runs.length === 0 ? (
        <p className="rounded-md border border-dashed border-white/15 bg-white/[0.02] px-4 py-6 text-center text-xs text-[var(--color-kanbantic-muted)]">
          No reports yet. Run an audit above and it&apos;ll show up here.
        </p>
      ) : (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]">
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                href={`/dashboard/contract-intelligence/runs/${String(run.id)}` as never}
                className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-white/[0.03]"
              >
                <div className="flex flex-wrap items-baseline gap-2 text-sm">
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                      run.kind === "audit"
                        ? "bg-amber-400/15 text-amber-200"
                        : "bg-sky-400/15 text-sky-200"
                    }`}
                  >
                    {run.kind}
                  </span>
                  <span className="font-mono text-xs text-[var(--color-kanbantic-fg)]">
                    {shortAddress(run.address)}
                  </span>
                  <span className="text-xs text-[var(--color-kanbantic-muted)]">·</span>
                  <span className="text-xs text-[var(--color-kanbantic-muted)]">
                    {run.sourcify_match}
                  </span>
                  <span className="text-xs text-[var(--color-kanbantic-muted)]">·</span>
                  <span className="text-xs text-[var(--color-kanbantic-muted)]">{run.llm}</span>
                  <span className="ml-auto text-xs text-[var(--color-kanbantic-muted)]">
                    {relative(run.ts)}
                  </span>
                </div>
                <p className="line-clamp-2 text-xs text-[var(--color-kanbantic-fg)]/70">
                  {run.report_excerpt}…
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
