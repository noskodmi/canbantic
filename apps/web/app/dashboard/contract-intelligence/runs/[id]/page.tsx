/**
 * `/dashboard/contract-intelligence/runs/[id]` — full report detail.
 *
 * Server component. Fetches a single persisted report from the worker
 * and renders the full markdown body. Reached from the history list.
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import { Markdown } from "../../Markdown.js";

const API_BASE: string = process.env["NEXT_PUBLIC_KANBANTIC_API"] ?? "http://localhost:8787";

interface RunDetail {
  id: number;
  address: string;
  kind: "audit" | "explain" | "similarity";
  sourcify_match: string;
  report: string;
  llm: string;
  model: string | null;
  ts: number;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

async function loadRun(id: string): Promise<RunDetail | null> {
  const numeric = Number.parseInt(id, 10);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const res = await fetch(`${API_BASE}/api/contract-intelligence/runs/${String(numeric)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`worker → ${String(res.status)}`);
  }
  return (await res.json()) as RunDetail;
}

export default async function ReportDetailPage({ params }: PageProps) {
  const { id } = await params;
  const run = await loadRun(id);
  if (!run) notFound();

  return (
    <article className="flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-2 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3 text-sm text-[var(--color-kanbantic-muted)]">
          <Link
            href="/dashboard/contract-intelligence"
            className="hover:text-[var(--color-kanbantic-accent)]"
          >
            ← Contract Intelligence
          </Link>
          <span>/</span>
          <span>#{String(run.id)}</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          {run.kind} of <span className="font-mono text-base">{run.address}</span>
        </h1>
        <div className="flex flex-wrap gap-3 text-xs text-[var(--color-kanbantic-muted)]">
          <span>sourcify: {run.sourcify_match}</span>
          <span>·</span>
          <span>llm: {run.llm}</span>
          {run.model !== null ? (
            <>
              <span>·</span>
              <span>model: {run.model}</span>
            </>
          ) : null}
          <span>·</span>
          <a
            href={`https://sourcify.dev/lookup/${run.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--color-kanbantic-accent)]"
          >
            view on Sourcify ↗
          </a>
        </div>
      </header>

      <div className="prose prose-invert max-w-none">
        <Markdown source={run.report} />
      </div>
    </article>
  );
}
