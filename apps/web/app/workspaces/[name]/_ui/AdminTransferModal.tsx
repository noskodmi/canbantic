"use client";

/**
 * AdminTransferModal — replaces `window.confirm()` on the workspace
 * "Transfer admin" CTA.
 *
 * Collects + validates the new admin Ethereum address, then submits
 * `WorkspaceRegistry.transferAdmin(wsNode, newAdmin)` via the parent's
 * wagmi hook. The form lives inside the modal (vs. the prior
 * confirm-after-validation flow) so the destructive action is
 * acknowledged in a single intentional gesture.
 *
 * A11y: focus-trapped, Esc closes (when not busy), returns focus to
 * the trigger on unmount, role=dialog + aria-modal="true" +
 * aria-labelledby.
 */

import type { ReactNode, SyntheticEvent } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { isAddress, type Address } from "viem";
import { cn } from "@kanbantic/ui";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface AdminTransferSubmitArgs {
  newAdmin: Address;
}

interface AdminTransferModalProps {
  /** Display-only — the workspace name (or namehash) to confirm against. */
  workspaceLabel: string;
  onSubmit: (args: AdminTransferSubmitArgs) => void;
  onClose: () => void;
  busy?: boolean;
  statusSlot?: ReactNode;
}

export function AdminTransferModal({
  workspaceLabel,
  onSubmit,
  onClose,
  busy = false,
  statusSlot,
}: AdminTransferModalProps) {
  const headingId = useId();
  const inputId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const [value, setValue] = useState<string>("");

  const validation = useMemo<{ value: Address | null; error: string | null }>(() => {
    const trimmed = value.trim();
    if (!trimmed) return { value: null, error: "New admin address is required." };
    if (!isAddress(trimmed)) return { value: null, error: "Not a valid Ethereum address." };
    return { value: trimmed, error: null };
  }, [value]);

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
    if (busy || validation.value === null) return;
    onSubmit({ newAdmin: validation.value });
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
              Transfer admin
            </h2>
            <p className="text-xs text-[var(--color-kanbantic-muted)]">
              Workspace: <span className="font-mono">{workspaceLabel}</span>. You will lose admin
              rights immediately on confirmation.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md p-1 text-[var(--color-kanbantic-muted)] hover:text-[var(--color-kanbantic-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-kanbantic-accent)] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Close transfer admin dialog"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6">
          <fieldset disabled={busy} className="flex flex-col gap-2">
            <label htmlFor={inputId} className="text-sm font-medium">
              New admin address
            </label>
            <input
              id={inputId}
              type="text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
              }}
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
              className="rounded-md border border-white/10 bg-transparent px-3 py-2 font-mono text-xs focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
            />
            {validation.error && value ? (
              <p className="text-xs text-red-400">{validation.error}</p>
            ) : null}
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
              disabled={busy || validation.value === null}
              className={cn(
                "rounded-md border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-300 transition-opacity",
                "hover:enabled:bg-red-500/10",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {busy ? "Submitting…" : "Confirm transfer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
