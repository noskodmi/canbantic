/**
 * `/workspaces` — workspace browse.
 *
 * Server-component shell that wraps the wagmi-aware client island.
 * The list is sourced from `WorkspaceCreated` event history because
 * the worker doesn't expose `/api/workspaces` yet (lands in Phase
 * 2B). When that endpoint ships we'll swap the client island's data
 * source for an RSC fetch + revalidation.
 *
 * Empty state and the public list both render without a connected
 * wallet — workspaces are public.
 */

import { WorkspacesBrowseClient } from "./_ui/WorkspacesBrowseClient.js";

export const dynamic = "force-dynamic";

export default function WorkspacesPage() {
  return <WorkspacesBrowseClient />;
}
