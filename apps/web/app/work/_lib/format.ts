/**
 * Work-route formatting helpers.
 *
 * Lives under `app/work/_lib/` so it stays scoped to the bounty browse + detail
 * surfaces. Reuses viem's `formatEther` for wei → ETH, and computes a small
 * relative-time string (no `Intl.RelativeTimeFormat` to keep the bundle thin
 * and the output deterministic across locales for tests).
 */

import { formatEther } from "viem";

export function formatEth(wei: string): string {
  let raw: string;
  try {
    raw = formatEther(BigInt(wei));
  } catch {
    return `${wei} wei`;
  }
  const trimmed = raw.includes(".") ? raw.replace(/0+$/, "").replace(/\.$/, "") : raw;
  if (trimmed.includes(".")) {
    const parts = trimmed.split(".");
    const intPart = parts[0] ?? "0";
    const fracPart = parts[1] ?? "";
    if (intPart === "0" && fracPart.length > 5) {
      return `${intPart}.${fracPart.slice(0, 5)} ETH`;
    }
  }
  return `${trimmed} ETH`;
}

export function relativeTime(unixSec: number, now: number = Date.now() / 1000): string {
  const diff = Math.max(0, Math.floor(now - unixSec));
  if (diff < 60) return `${String(diff)}s ago`;
  const minutes = Math.floor(diff / 60);
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${String(days)}d ago`;
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}
