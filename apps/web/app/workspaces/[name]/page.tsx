/**
 * `/workspaces/[name]` — workspace detail.
 *
 * Server-component shell. The `[name]` slug is one of:
 *
 *   - a 0x-prefixed 64-hex-char string → treated as the namehash directly
 *   - any other string → resolved as a label under
 *     `<label>.kanbantic.eth` via `viem`'s `namehash()`
 *
 * Slug resolution happens inside the client island so we can also
 * surface the human label in the header without an extra prop.
 */

import { WorkspaceDetailClient } from "./_ui/WorkspaceDetailClient.js";

export const dynamic = "force-dynamic";

interface WorkspaceDetailPageProps {
  params: Promise<{ name: string }>;
}

export default async function WorkspaceDetailPage({ params }: WorkspaceDetailPageProps) {
  const { name } = await params;
  return <WorkspaceDetailClient slug={name} />;
}
