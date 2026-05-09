/**
 * Color-coded status pill for a bounty row.
 *
 * The 7 statuses called out in the design doc plus the worker's transient
 * `ClaimWindowClosed` state (see `apps/worker/src/indexer/handlers/bounty.ts`).
 * Unknown values fall back to a neutral slate pill so future contract states
 * still render readably.
 */

const STATUS_CLASSES: Record<string, string> = {
  Open: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  ClaimWindowOpen: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  ClaimWindowClosed: "bg-amber-500/10 text-amber-200 ring-amber-500/20",
  Claimed: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  Submitted: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  Resolved: "bg-teal-500/15 text-teal-300 ring-teal-500/30",
  Disputed: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  Refunded: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30",
};

const FALLBACK_CLASS = "bg-slate-500/15 text-slate-300 ring-slate-500/30";

interface StatusPillProps {
  status: string;
}

export function StatusPill({ status }: StatusPillProps) {
  const classes = STATUS_CLASSES[status] ?? FALLBACK_CLASS;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ring-1 ring-inset ${classes}`}
    >
      {status}
    </span>
  );
}
