/**
 * ReputationGraph — 30-day SVG arc of an agent's reputation.
 *
 * Replaces the static `★★★★☆ (N attestations)` line on the agent
 * detail page. The SVG is hand-rolled — no chart-lib dep — so the
 * server component can render it without shipping client JS.
 *
 * Inputs are normalized in `_lib/reputation.ts`. If the worker hasn't
 * yet exposed a per-attestation array (Phase 2B-B), the caller can
 * synthesize a one-element series from the summary `score`/`count`
 * pair: `[{ score, ts: now }]`. The smoothing/carry-forward in
 * `buildReputationSeries` makes that read as a flat-but-present line.
 */
import {
  buildReputationSeries,
  reputationAreaPath,
  reputationLinePath,
  type AttestationLike,
} from "../_lib/reputation";

const WIDTH = 240;
const HEIGHT = 80;

interface ReputationGraphProps {
  attestations: readonly AttestationLike[];
  /** Display-only — the headline number to the right of the arc. */
  summaryScore: number;
  /** Display-only — the count for the aria-label and footer text. */
  summaryCount: number;
  /** Optional clock override (for tests). */
  now?: number;
}

export function ReputationGraph({
  attestations,
  summaryScore,
  summaryCount,
  now,
}: ReputationGraphProps) {
  if (attestations.length === 0 && summaryCount === 0) {
    return (
      <div
        role="img"
        aria-label="Reputation arc — no attestations yet"
        className="flex h-20 items-center justify-center rounded-md border border-dashed border-white/10 bg-white/[0.02] text-xs text-[var(--color-kanbantic-muted)]"
      >
        No attestations yet
      </div>
    );
  }

  const series = buildReputationSeries(attestations, now);
  const areaD = reputationAreaPath(series, WIDTH, HEIGHT);
  const lineD = reputationLinePath(series, WIDTH, HEIGHT);

  const plural = summaryCount === 1 ? "" : "s";
  const ariaLabel = `Reputation arc — score ${summaryScore.toFixed(1)} based on ${String(summaryCount)} attestation${plural}`;

  return (
    <div className="flex items-center gap-4">
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
        width={WIDTH}
        height={HEIGHT}
        className="overflow-visible"
        data-testid="reputation-graph-svg"
      >
        <defs>
          <linearGradient id="repFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-kanbantic-accent)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--color-kanbantic-accent)" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {/* Baseline */}
        <line
          x1="0"
          y1={HEIGHT}
          x2={WIDTH}
          y2={HEIGHT}
          stroke="currentColor"
          strokeOpacity="0.08"
        />
        <path d={areaD} fill="url(#repFill)" />
        <path
          d={lineD}
          fill="none"
          stroke="var(--color-kanbantic-accent)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex flex-col">
        <span className="text-2xl font-semibold tracking-tight text-[var(--color-kanbantic-fg)]">
          {summaryScore.toFixed(1)}
        </span>
        <span className="text-xs text-[var(--color-kanbantic-muted)]">
          {summaryCount === 0
            ? "no attestations"
            : `${String(summaryCount)} attestation${plural} · 30d`}
        </span>
      </div>
    </div>
  );
}
