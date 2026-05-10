"use client";

/**
 * Manual MCP suggestion form on /discovered.
 *
 * The Apify Actor runs on a cron and surfaces repos asynchronously.
 * This form lets a wallet-holder push their own MCP repo into the
 * candidate set immediately — useful for testing the registration
 * flow end-to-end without waiting for the next Apify run.
 *
 * SIWE-gated. The signed-in address isn't stored — the suggestion is
 * still anonymous on chain — but SIWE prevents anonymous spam.
 */

import { useState } from "react";
import type { SyntheticEvent } from "react";
import { useAccount } from "wagmi";

import { useSiwe } from "../_lib/siwe.js";

const API_BASE: string = process.env["NEXT_PUBLIC_KANBANTIC_API"] ?? "http://localhost:8787";

const REPO_URL_REGEX = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/;
const LABEL_REGEX = /^[a-z0-9-]{1,42}$/;

type Phase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "ok"; suggestedLabel: string }
  | { kind: "error"; message: string };

export function SuggestForm() {
  const { isConnected } = useAccount();
  const { ensureSession } = useSiwe();
  const [repoUrl, setRepoUrl] = useState("");
  const [label, setLabel] = useState("");
  const [mcpPath, setMcpPath] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!REPO_URL_REGEX.test(repoUrl.trim())) {
      setPhase({ kind: "error", message: "repoUrl must be https://github.com/<owner>/<repo>." });
      return;
    }
    const normalisedLabel = label.trim().toLowerCase();
    if (!LABEL_REGEX.test(normalisedLabel)) {
      setPhase({
        kind: "error",
        message: "Label: 1-42 chars, lowercase a-z, 0-9, dashes only (ENS-compatible).",
      });
      return;
    }

    setPhase({ kind: "submitting" });
    try {
      const session = await ensureSession();
      const res = await fetch(`${API_BASE}/api/discovered/suggest`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          repoUrl: repoUrl.trim(),
          suggestedLabel: normalisedLabel,
          mcpPath: mcpPath.trim() === "" ? null : mcpPath.trim(),
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`HTTP ${String(res.status)} — ${detail.slice(0, 160)}`);
      }
      setPhase({ kind: "ok", suggestedLabel: normalisedLabel });
      setRepoUrl("");
      setLabel("");
      setMcpPath("");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPhase({ kind: "error", message });
    }
  }

  if (!isConnected) {
    return (
      <p className="rounded-md border border-dashed border-white/15 bg-white/[0.02] p-4 text-xs text-[var(--color-kanbantic-muted)]">
        Connect your wallet to suggest a repo. The Apify Actor still discovers candidates
        automatically — this form is only for adding one yourself.
      </p>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        void onSubmit(event);
      }}
      className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-xs">
          <span className="text-[var(--color-kanbantic-muted)]">GitHub repo</span>
          <input
            type="url"
            value={repoUrl}
            onChange={(e) => {
              setRepoUrl(e.target.value);
            }}
            placeholder="https://github.com/owner/my-mcp-server"
            className="rounded-md border border-white/10 bg-transparent px-3 py-2 font-mono text-xs focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
            spellCheck={false}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs sm:w-40">
          <span className="text-[var(--color-kanbantic-muted)]">Label</span>
          <input
            type="text"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
            }}
            placeholder="my-mcp"
            className="rounded-md border border-white/10 bg-transparent px-3 py-2 font-mono text-xs focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
            spellCheck={false}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-[var(--color-kanbantic-muted)]">MCP path (optional)</span>
        <input
          type="text"
          value={mcpPath}
          onChange={(e) => {
            setMcpPath(e.target.value);
          }}
          placeholder="src/mcp.json"
          className="rounded-md border border-white/10 bg-transparent px-3 py-2 font-mono text-xs focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
          spellCheck={false}
        />
      </label>
      <button
        type="submit"
        disabled={phase.kind === "submitting"}
        className="self-start rounded-md bg-[var(--color-kanbantic-accent)] px-4 py-2 text-xs font-semibold text-[var(--color-kanbantic-bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {phase.kind === "submitting" ? "Sign in wallet…" : "Suggest repo"}
      </button>

      {phase.kind === "ok" ? (
        <p className="text-xs text-emerald-300">
          Surfaced as candidate <code className="font-mono">{phase.suggestedLabel}</code>. Refresh
          to see it in the list.
        </p>
      ) : null}
      {phase.kind === "error" ? (
        <p className="text-xs text-red-300">Failed: {phase.message}</p>
      ) : null}
    </form>
  );
}
