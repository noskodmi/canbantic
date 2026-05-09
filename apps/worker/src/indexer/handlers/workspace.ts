import type { D1Database } from "@cloudflare/workers-types";

import type { DecodedLog } from "../decode.js";

export async function handleWorkspaceEvent(
  db: D1Database,
  log: DecodedLog,
  ts: number,
): Promise<void> {
  switch (log.eventName) {
    case "WorkspaceCreated": {
      const wsNode = (log.args["wsNode"] as string).toLowerCase();
      const parent = (log.args["parentNode"] as string).toLowerCase();
      const admin = (log.args["admin"] as string).toLowerCase();
      await db
        .prepare(
          "INSERT OR IGNORE INTO workspaces (node, parent, admin, created_at_block, created_at_ts) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(wsNode, parent, admin, log.blockNumber, ts)
        .run();
      return;
    }

    case "MemberAdded": {
      const wsNode = (log.args["wsNode"] as string).toLowerCase();
      const member = (log.args["member"] as string).toLowerCase();
      await db
        .prepare(
          "INSERT INTO workspace_members (ws_node, address, status, added_at_block) VALUES (?, ?, 'active', ?) ON CONFLICT(ws_node, address) DO UPDATE SET status = 'active'",
        )
        .bind(wsNode, member, log.blockNumber)
        .run();
      return;
    }

    case "MemberRemoved": {
      const wsNode = (log.args["wsNode"] as string).toLowerCase();
      const member = (log.args["member"] as string).toLowerCase();
      await db
        .prepare(
          "UPDATE workspace_members SET status = 'removed' WHERE ws_node = ? AND address = ?",
        )
        .bind(wsNode, member)
        .run();
      return;
    }

    case "AdminTransferred": {
      const wsNode = (log.args["wsNode"] as string).toLowerCase();
      const newAdmin = (log.args["newAdmin"] as string).toLowerCase();
      await db
        .prepare("UPDATE workspaces SET admin = ? WHERE node = ?")
        .bind(newAdmin, wsNode)
        .run();
      return;
    }
  }
}
