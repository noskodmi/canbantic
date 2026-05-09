import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../src/db/migrate.js";
import type { DecodedLog } from "../../src/indexer/decode.js";
import { handleWorkspaceEvent } from "../../src/indexer/handlers/workspace.js";

const TS = 1715300000;

function makeLog(eventName: string, args: Record<string, unknown>): DecodedLog {
  return {
    contract: "WorkspaceRegistry",
    eventName,
    args,
    blockNumber: 100,
    txHash: "0xabc",
    logIndex: 0,
  };
}

describe("handleWorkspaceEvent", () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("DELETE FROM workspaces").run();
    await env.DB.prepare("DELETE FROM workspace_members").run();
  });

  it("WorkspaceCreated inserts workspace row", async () => {
    await handleWorkspaceEvent(
      env.DB,
      makeLog("WorkspaceCreated", {
        wsNode: "0xWS",
        parentNode: "0xWS",
        admin: "0xADMIN",
      }),
      TS,
    );
    const row = await env.DB.prepare("SELECT * FROM workspaces WHERE node = ?")
      .bind("0xws")
      .first();
    expect(row?.["admin"]).toBe("0xadmin");
    expect(row?.["created_at_ts"]).toBe(TS);
  });

  it("MemberAdded inserts active member", async () => {
    await handleWorkspaceEvent(
      env.DB,
      makeLog("MemberAdded", { wsNode: "0xWS", member: "0xALICE" }),
      TS,
    );
    const row = await env.DB.prepare(
      "SELECT * FROM workspace_members WHERE ws_node = ? AND address = ?",
    )
      .bind("0xws", "0xalice")
      .first<{ status: string }>();
    expect(row?.status).toBe("active");
  });

  it("MemberRemoved tombstones the member", async () => {
    await handleWorkspaceEvent(
      env.DB,
      makeLog("MemberAdded", { wsNode: "0xWS", member: "0xALICE" }),
      TS,
    );
    await handleWorkspaceEvent(
      env.DB,
      makeLog("MemberRemoved", { wsNode: "0xWS", member: "0xALICE" }),
      TS,
    );
    const row = await env.DB.prepare(
      "SELECT status FROM workspace_members WHERE ws_node = ? AND address = ?",
    )
      .bind("0xws", "0xalice")
      .first<{ status: string }>();
    expect(row?.status).toBe("removed");
  });

  it("AdminTransferred updates admin", async () => {
    await handleWorkspaceEvent(
      env.DB,
      makeLog("WorkspaceCreated", {
        wsNode: "0xWS",
        parentNode: "0xWS",
        admin: "0xADMIN",
      }),
      TS,
    );
    await handleWorkspaceEvent(
      env.DB,
      makeLog("AdminTransferred", {
        wsNode: "0xWS",
        oldAdmin: "0xADMIN",
        newAdmin: "0xBOB",
      }),
      TS,
    );
    const row = await env.DB.prepare("SELECT admin FROM workspaces WHERE node = ?")
      .bind("0xws")
      .first<{ admin: string }>();
    expect(row?.admin).toBe("0xbob");
  });
});
