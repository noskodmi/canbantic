import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../src/db/migrate.js";
import type { DecodedLog } from "../../src/indexer/decode.js";
import { handleAgentEvent } from "../../src/indexer/handlers/agent.js";

const TS = 1715300000;

function makeLog(eventName: string, args: Record<string, unknown>): DecodedLog {
  return {
    contract: "AgentRegistry",
    eventName,
    args,
    blockNumber: 100,
    txHash: "0xabc",
    logIndex: 0,
  };
}

describe("handleAgentEvent", () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("DELETE FROM agents").run();
  });

  it("AgentRegistered inserts agent row", async () => {
    await handleAgentEvent(
      env.DB,
      makeLog("AgentRegistered", {
        node: "0xNODE",
        parent: "0xPARENT",
        owner: "0xOWNER",
        label: "alice",
        mcpEndpoint: "https://alice.example/mcp",
        capabilities: "research,summarize",
      }),
      TS,
    );
    const row = await env.DB.prepare("SELECT * FROM agents WHERE node = ?")
      .bind("0xnode")
      .first();
    expect(row?.["owner"]).toBe("0xowner");
    expect(row?.["label"]).toBe("alice");
    expect(row?.["mcp_endpoint"]).toBe("https://alice.example/mcp");
    expect(row?.["capabilities"]).toBe("research,summarize");
  });

  it("AgentUpdated updates mcp + capabilities", async () => {
    await handleAgentEvent(
      env.DB,
      makeLog("AgentRegistered", {
        node: "0xNODE",
        parent: "0xPARENT",
        owner: "0xOWNER",
        label: "alice",
        mcpEndpoint: "https://old.example/mcp",
        capabilities: "research",
      }),
      TS,
    );
    await handleAgentEvent(
      env.DB,
      makeLog("AgentUpdated", {
        node: "0xNODE",
        mcpEndpoint: "https://new.example/mcp",
        capabilities: "research,write",
      }),
      TS,
    );
    const row = await env.DB.prepare("SELECT mcp_endpoint, capabilities FROM agents WHERE node = ?")
      .bind("0xnode")
      .first<{ mcp_endpoint: string; capabilities: string }>();
    expect(row?.mcp_endpoint).toBe("https://new.example/mcp");
    expect(row?.capabilities).toBe("research,write");
  });

  it("AgentTransferred updates owner", async () => {
    await handleAgentEvent(
      env.DB,
      makeLog("AgentRegistered", {
        node: "0xNODE",
        parent: "0xPARENT",
        owner: "0xOWNER",
        label: "alice",
        mcpEndpoint: "https://x.example/mcp",
        capabilities: "research",
      }),
      TS,
    );
    await handleAgentEvent(
      env.DB,
      makeLog("AgentTransferred", {
        node: "0xNODE",
        from: "0xOWNER",
        to: "0xBOB",
      }),
      TS,
    );
    const row = await env.DB.prepare("SELECT owner FROM agents WHERE node = ?")
      .bind("0xnode")
      .first<{ owner: string }>();
    expect(row?.owner).toBe("0xbob");
  });

  it("ProfileSet sets profile_ref", async () => {
    await handleAgentEvent(
      env.DB,
      makeLog("AgentRegistered", {
        node: "0xNODE",
        parent: "0xPARENT",
        owner: "0xOWNER",
        label: "alice",
        mcpEndpoint: "https://x.example/mcp",
        capabilities: "research",
      }),
      TS,
    );
    await handleAgentEvent(
      env.DB,
      makeLog("ProfileSet", { node: "0xNODE", profileRef: "0xCAFEBABE" }),
      TS,
    );
    const row = await env.DB.prepare("SELECT profile_ref FROM agents WHERE node = ?")
      .bind("0xnode")
      .first<{ profile_ref: string }>();
    expect(row?.profile_ref).toBe("0xcafebabe");
  });
});
