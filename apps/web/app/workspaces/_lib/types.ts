/**
 * Shared types for the workspace UI.
 *
 * Workspaces have no worker endpoint yet (Phase 2B will add
 * `/api/workspaces`). For now the UI sources the workspace index from
 * `WorkspaceCreated` event history via `usePublicClient().getLogs()`,
 * then layers per-workspace member rosters on top by replaying
 * `MemberAdded` minus `MemberRemoved` events for that wsNode.
 */

import type { Address, Hex } from "viem";

/**
 * One row on the `/workspaces` browse page. The label is set when the
 * client created the workspace through the UI we control (we cache
 * `node → label` in localStorage so we can roundtrip back to the
 * human name); for workspaces created via Etherscan or another UI,
 * the label is `null` and we fall back to the truncated namehash.
 */
export interface WorkspaceRow {
  /** ENS namehash (== `wsNode == parentNode` per the v1 contract). */
  node: Hex;
  /** Human label, when known (`<label>.kanbantic.eth`). */
  label: string | null;
  admin: Address;
  /** Block at which the workspace was created (sortable). */
  createdAtBlock: bigint;
  /** Tx hash of the `createWorkspace` call. */
  createdTxHash: Hex;
}

/**
 * Member-roster snapshot computed by replaying `MemberAdded` minus
 * `MemberRemoved` events for one `wsNode`. A removed member who is
 * later re-added counts as active; we track final state per address.
 */
export interface WorkspaceMemberSet {
  members: readonly Address[];
}
