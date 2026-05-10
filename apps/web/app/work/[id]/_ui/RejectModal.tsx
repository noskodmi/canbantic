"use client";

/**
 * RejectModal — replaces `window.confirm()` on the bounty Reject CTA.
 *
 * Collects an optional free-text reason from the poster before they
 * submit `BountyBoard.reject(bountyId, reasonRef)`. The reason itself
 * lives off-chain (Phase 7 will pin it to Swarm); we hash it into a
 * 32-byte `reasonRef` here so the on-chain footprint is fixed-size.
 *
 * Empty reason → `reasonRef = 0x000…000` (sentinel for "no reason").
 *
 * A11y: focus-trapped while open, Esc closes (when not busy), returns
 * focus to the triggering button on unmount, role=dialog +
 * aria-modal="true" + aria-labelledby pointing at the heading.
 */

import type { ReactNode, SyntheticEvent } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { keccak256, stringToBytes } from "viem";
import type { Hex } from "viem";
import { cn } from "@kanbantic/ui";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const ZERO_BYTES32: Hex = `0x${"0".repeat(64)}`;

export interface RejectSubmitArgs {
  reasonRef: Hex;
}

interface RejectModalProps {
  bountyId: string;
  onSubmit: (args: RejectSubmitArgs) => void;
  onClose: () => void;
  busy?: boolean;
  statusSlot?: ReactNode;
}

export function RejectModal({
  bountyId,
  onSubmit,
  onClose,
  busy = false,
  statusSlot,
}: RejectModalProps) {
  const headingId = useId();
  const reasonId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const [reason, setReason] = useState<string>("");

  const reasonRef = useMemo<Hex>(() => {
    const trimmed = reason.trim();
    if (!trimmed) return ZERO_BYTES32;
    return keccak256(stringToBytes(trimmed));
  }, [reason]);

  useEffect(() => {
    previouslyFocusedRef.current =
      typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null);

    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    focusables?.[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const list = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!list || list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (first === undefined || last === undefined) return;
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === "function") {
        prev.focus();
      }
    };
  }, [onClose, busy]);

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    onSubmit({ reasonRef });
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-8"
    >
      <div className="my-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-red-500/30 bg-[var(--color-kanbantic-bg)] p-6 shadow-2xl">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={headingId} className="text-xl font-semibold tracking-tight text-red-300">
              Reject submission
            </h2>
            <p className="text-xs text-[var(--color-kanbantic-muted)]">
              Bounty #{bountyId} · escrow refunds (or escalates to the arbiter council).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md p-1 text-[var(--color-kanbantic-muted)] hover:text-[var(--color-kanbantic-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-kanbantic-accent)] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Close reject dialog"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6">
          <fieldset disabled={busy} className="flex flex-col gap-2">
            <label htmlFor={reasonId} className="text-sm font-medium">
              Reason <span className="text-[var(--color-kanbantic-muted)]">(optional)</span>
            </label>
            <textarea
              id={reasonId}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
              }}
              rows={3}
              placeholder="Why is this submission being rejected? Hashed into reasonRef."
              className="rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
            />
            <p className="break-all font-mono text-xs text-[var(--color-kanbantic-muted)]">
              reasonRef: {reasonRef}
            </p>
          </fieldset>

          {statusSlot}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-md border border-white/10 px-4 py-2 text-sm text-[var(--color-kanbantic-fg)]/80 hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className={cn(
                "rounded-md border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-300 transition-opacity",
                "hover:enabled:bg-red-500/10",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {busy ? "Submitting…" : "Reject submission"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
