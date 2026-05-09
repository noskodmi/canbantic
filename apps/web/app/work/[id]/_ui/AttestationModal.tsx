"use client";

/**
 * AttestationModal — gathers `score` (1-5) and an optional comment
 * from the bounty poster before they submit two transactions:
 *
 *   1. `ReputationAttestor.attest(bountyId, agentNode, score, commentRef)`
 *   2. `BountyBoard.accept(bountyId)`
 *
 * The on-chain `attest` function authorizes the caller by checking
 * `msg.sender == bountyBoard.posterOf(bountyId)` — there is no EIP-712
 * signature involved (see deviation note in the parent batch). The
 * modal therefore returns `{ score, commentRef }` to the parent, which
 * orchestrates the two writes via `useReputationAttestor` and
 * `useBountyBoard.accept`.
 *
 * Comment hashing: `commentRef = keccak256(toUtf8Bytes(comment.trim()))`
 * when a comment is provided, otherwise the all-zeros sentinel
 * (`0x000…000`). The 32-byte hash is what the contract emits in the
 * `Attested` event; the original text is intended to live off-chain
 * (Swarm in Phase 7), out of scope for Web 4.
 */

import type { ReactNode, SyntheticEvent } from "react";
import { useEffect, useId, useMemo, useState } from "react";
import { keccak256, stringToBytes } from "viem";
import type { Hex } from "viem";
import { cn } from "@kanbantic/ui";

const ZERO_BYTES32: Hex = `0x${"0".repeat(64)}`;

const SCORE_OPTIONS = [1, 2, 3, 4, 5] as const;

export interface AttestationSubmitArgs {
  score: number;
  commentRef: Hex;
}

interface AttestationModalProps {
  /** Display-only — the bounty id rendered in the modal header. */
  bountyId: string;
  onSubmit: (args: AttestationSubmitArgs) => void;
  onClose: () => void;
  /** When true, the form is locked while a parent tx is in flight. */
  busy?: boolean;
  /** Optional inline status the parent renders inside the modal. */
  statusSlot?: ReactNode;
}

export function AttestationModal({
  bountyId,
  onSubmit,
  onClose,
  busy = false,
  statusSlot,
}: AttestationModalProps) {
  const headingId = useId();
  const commentId = useId();

  const [score, setScore] = useState<number>(5);
  const [comment, setComment] = useState<string>("");

  const commentRef = useMemo<Hex>(() => {
    const trimmed = comment.trim();
    if (!trimmed) return ZERO_BYTES32;
    return keccak256(stringToBytes(trimmed));
  }, [comment]);

  // Esc-to-close, focus trap-lite (no library, modal is short).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, busy]);

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    onSubmit({ score, commentRef });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
    >
      <div className="w-full max-w-lg rounded-lg border border-white/10 bg-[var(--color-kanbantic-bg)] p-6 shadow-2xl">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={headingId} className="text-xl font-semibold tracking-tight">
              Accept submission
            </h2>
            <p className="text-xs text-[var(--color-kanbantic-muted)]">
              Bounty #{bountyId} · two wallet confirmations: attest, then accept.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md p-1 text-[var(--color-kanbantic-muted)] hover:text-[var(--color-kanbantic-fg)] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6">
          <fieldset disabled={busy} className="flex flex-col gap-3">
            <legend className="text-sm font-medium">Score</legend>
            <div role="radiogroup" aria-label="Score (1 to 5)" className="flex flex-wrap gap-2">
              {SCORE_OPTIONS.map((value) => {
                const active = value === score;
                return (
                  <button
                    type="button"
                    key={value}
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      setScore(value);
                    }}
                    className={cn(
                      "h-10 w-10 rounded-md border text-sm font-semibold transition-colors",
                      active
                        ? "border-[var(--color-kanbantic-accent)] bg-[var(--color-kanbantic-accent)]/15 text-[var(--color-kanbantic-accent)]"
                        : "border-white/10 text-[var(--color-kanbantic-fg)]/80 hover:border-white/30",
                    )}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-[var(--color-kanbantic-muted)]">
              1 = poor, 5 = excellent. The contract reverts with{" "}
              <span className="font-mono">InvalidScore</span> outside this range.
            </p>
          </fieldset>

          <fieldset disabled={busy} className="flex flex-col gap-2">
            <label htmlFor={commentId} className="text-sm font-medium">
              Comment <span className="text-[var(--color-kanbantic-muted)]">(optional)</span>
            </label>
            <textarea
              id={commentId}
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
              }}
              rows={3}
              placeholder="Optional review notes — hashed into commentRef."
              className="rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
            />
            <p className="break-all font-mono text-xs text-[var(--color-kanbantic-muted)]">
              commentRef: {commentRef}
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
                "rounded-md px-4 py-2 text-sm font-semibold transition-opacity",
                "bg-[var(--color-kanbantic-accent)] text-[var(--color-kanbantic-bg)]",
                "disabled:cursor-not-allowed disabled:opacity-50 hover:enabled:opacity-90",
              )}
            >
              {busy ? "Submitting…" : "Submit attestation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
