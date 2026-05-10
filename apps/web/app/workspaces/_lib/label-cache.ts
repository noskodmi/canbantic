/**
 * Local cache of `wsNode → label` mappings.
 *
 * The on-chain `WorkspaceCreated` event records only the namehash —
 * not the original label string. We rebuild the human label client-side
 * by stashing it at `createWorkspace` time. The cache is best-effort:
 * workspaces created elsewhere (Etherscan, scripts) won't have an
 * entry, and the UI falls back to the truncated namehash for those.
 */

import type { Hex } from "viem";

const STORAGE_KEY = "kanbantic:workspace-labels:v1";

type CacheShape = Record<string, string>;

function readCache(): CacheShape {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object") return {};
    return parsed as CacheShape;
  } catch {
    return {};
  }
}

function writeCache(cache: CacheShape): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Quota exceeded / private browsing — silently no-op.
  }
}

export function rememberWorkspaceLabel(node: Hex, label: string): void {
  const cache = readCache();
  cache[node.toLowerCase()] = label;
  writeCache(cache);
}

export function lookupWorkspaceLabel(node: Hex): string | null {
  const cache = readCache();
  return cache[node.toLowerCase()] ?? null;
}

export function buildLabelMap(nodes: readonly Hex[]): Record<string, string> {
  const cache = readCache();
  const out: Record<string, string> = {};
  for (const node of nodes) {
    const label = cache[node.toLowerCase()];
    if (label !== undefined) out[node.toLowerCase()] = label;
  }
  return out;
}
