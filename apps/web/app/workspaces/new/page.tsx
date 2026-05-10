"use client";

/**
 * `/workspaces/new` — create a workspace under
 * `<label>.kanbantic.eth`.
 *
 * Computes `wsNode = namehash("<label>.kanbantic.eth")` client-side
 * and calls `WorkspaceRegistry.createWorkspace(parentNode, [])`. The
 * connected wallet becomes the implicit admin and first member —
 * see `WorkspaceRegistry.sol`.
 *
 * Initial-members entry is intentionally omitted from the v1 form;
 * admins can add members from the workspace detail page after the
 * create tx confirms. (Reduces the number of inputs the user has to
 * fill before signing — fewer chances to fat-finger an address.)
 */

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useId, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { sepoliaDeployment } from "@kanbantic/shared";
import { cn } from "@kanbantic/ui";
import { namehash, type Hex } from "viem";
import { useAccount, useWaitForTransactionReceipt } from "wagmi";

import { useWorkspaceRegistry } from "../../_lib/contracts.js";
import { rememberWorkspaceLabel } from "../_lib/label-cache.js";

const ROOT_NAME = sepoliaDeployment.ens.rootName;
const ETHERSCAN_TX = "https://sepolia.etherscan.io/tx";

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

interface FormState {
  label: string;
}

const INITIAL_STATE: FormState = { label: "" };

interface ValidationResult {
  ok: boolean;
  error: string | null;
  wsNode: Hex | null;
}

function validate(state: FormState): ValidationResult {
  if (!state.label) return { ok: false, error: "Label is required.", wsNode: null };
  if (!LABEL_RE.test(state.label)) {
    return {
      ok: false,
      error: "Lowercase letters, digits, hyphens. No dots, no spaces.",
      wsNode: null,
    };
  }
  let wsNode: Hex;
  try {
    wsNode = namehash(`${state.label}.${ROOT_NAME}`);
  } catch {
    return { ok: false, error: "Could not compute namehash for this label.", wsNode: null };
  }
  return { ok: true, error: null, wsNode };
}

export default function NewWorkspacePage() {
  const labelId = useId();

  const { isConnected } = useAccount();
  const [state, setState] = useState<FormState>(INITIAL_STATE);

  const { create, isPending, error, hash, reset } = useWorkspaceRegistry();
  const receipt = useWaitForTransactionReceipt({ hash });

  const validation = useMemo(() => validate(state), [state]);

  // Stash the label → namehash mapping in localStorage as soon as the
  // tx hash is back. This lets the browse + detail pages render the
  // human label even though the on-chain event records only the hash.
  useEffect(() => {
    if (hash !== undefined && validation.wsNode !== null) {
      rememberWorkspaceLabel(validation.wsNode, state.label);
    }
  }, [hash, validation.wsNode, state.label]);

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setState((prev) => ({ ...prev, [field]: value }));
  }

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validation.ok || validation.wsNode === null || isPending) return;
    create({ parentNode: validation.wsNode, initialMembers: [] });
  }

  if (!isConnected) {
    return (
      <section className="mx-auto flex max-w-xl flex-col items-center gap-6 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Create a workspace</h1>
        <p className="text-sm text-[var(--color-kanbantic-muted)]">
          Connect your wallet to create a workspace under{" "}
          <span className="font-mono">{ROOT_NAME}</span>.
        </p>
        <ConnectButton />
      </section>
    );
  }

  const submitting = isPending;
  const submitted = Boolean(hash);
  const confirmed = receipt.isSuccess;
  const errorMessage = error?.message ?? receipt.error?.message ?? null;
  const fullName = state.label ? `${state.label}.${ROOT_NAME}` : `<label>.${ROOT_NAME}`;

  return (
    <section className="mx-auto max-w-2xl py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Create a workspace</h1>
        <p className="mt-2 text-sm text-[var(--color-kanbantic-muted)]">
          Mints an entry in <span className="font-mono">WorkspaceRegistry</span> on Sepolia. Your
          wallet becomes the admin and first member; you can add more members from the workspace
          detail page once the tx confirms.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-6 rounded-lg border border-white/10 bg-white/[0.02] p-6"
      >
        <fieldset disabled={submitting} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor={labelId} className="text-sm font-medium">
              Label
            </label>
            <input
              id={labelId}
              type="text"
              value={state.label}
              onChange={(e) => {
                update("label", e.target.value.toLowerCase());
              }}
              placeholder="e.g. alpha"
              autoComplete="off"
              spellCheck={false}
              className="rounded-md border border-white/10 bg-transparent px-3 py-2 font-mono text-sm focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
            />
            <p className="text-xs text-[var(--color-kanbantic-muted)]">
              Preview:{" "}
              <span className="font-mono text-[var(--color-kanbantic-fg)]">{fullName}</span>
            </p>
            {validation.wsNode !== null ? (
              <p className="break-all font-mono text-[10px] text-[var(--color-kanbantic-muted)]">
                wsNode: {validation.wsNode}
              </p>
            ) : null}
            {validation.error && state.label ? (
              <p className="text-xs text-red-400">{validation.error}</p>
            ) : null}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={!validation.ok || submitting || (submitted && !receipt.isError)}
          className={cn(
            "rounded-md px-4 py-2.5 text-sm font-semibold transition-opacity",
            "bg-[var(--color-kanbantic-accent)] text-[var(--color-kanbantic-bg)]",
            "disabled:cursor-not-allowed disabled:opacity-50 hover:enabled:opacity-90",
          )}
        >
          {submitting
            ? "Sign in wallet…"
            : submitted && !confirmed && !receipt.isError
              ? "Submitting…"
              : confirmed
                ? "Created"
                : "Create workspace"}
        </button>

        {errorMessage !== null ? (
          <div
            role="alert"
            className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
          >
            {errorMessage}
          </div>
        ) : null}

        {hash !== undefined ? (
          <div className="flex flex-col gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[var(--color-kanbantic-muted)]">tx:</span>
              <a
                href={`${ETHERSCAN_TX}/${hash}`}
                target="_blank"
                rel="noreferrer noopener"
                className="break-all font-mono text-[var(--color-kanbantic-accent)] hover:underline"
              >
                {hash}
              </a>
            </div>
            {receipt.isLoading ? (
              <p className="text-[var(--color-kanbantic-muted)]">Waiting for confirmation…</p>
            ) : null}
            {confirmed ? (
              <>
                <p className="text-green-400">Workspace created.</p>
                <p className="text-[var(--color-kanbantic-muted)]">
                  View it at{" "}
                  <Link
                    href={`/workspaces/${state.label}` as Route}
                    className="font-mono text-[var(--color-kanbantic-accent)] hover:underline"
                  >
                    /workspaces/{state.label}
                  </Link>
                  .
                </p>
                <button
                  type="button"
                  onClick={() => {
                    reset();
                    setState(INITIAL_STATE);
                  }}
                  className="self-start rounded-md border border-white/10 px-3 py-1 text-xs text-[var(--color-kanbantic-fg)]/80 hover:border-[var(--color-kanbantic-accent)]"
                >
                  Create another
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}
