import { SELF, env } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";

import { applyMigrations } from "../../src/db/migrate.js";

describe("GET /api/agents", () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("DELETE FROM agents").run();
    await env.DB.prepare("DELETE FROM agent_reputation").run();
  });

  it("returns empty array on cold start", async () => {
    const res = await SELF.fetch("https://example.com/api/agents");
    expect(res.status).toBe(200);
    const body = await res.json<{ agents: unknown[]; limit: number }>();
    expect(body.agents).toEqual([]);
    expect(body.limit).toBe(50);
  });

  it("returns rows with reputation joined", async () => {
    await env.DB.prepare(
      "INSERT INTO agents (node, parent, owner, label, mcp_endpoint, capabilities, registered_at_block, registered_at_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind("0xnode1", "0xparent", "0xowner", "alice", "https://x/mcp", "research", 100, 1715300000)
      .run();
    await env.DB.prepare(
      "INSERT INTO agent_reputation (node, score, attestation_count, last_updated) VALUES (?, ?, ?, ?)",
    )
      .bind("0xnode1", 4.5, 7, 1715300100)
      .run();

    const res = await SELF.fetch("https://example.com/api/agents");
    const body = await res.json<{ agents: Record<string, unknown>[]; limit: number }>();
    expect(body.agents).toHaveLength(1);
    const a = body.agents[0];
    expect(a?.["node"]).toBe("0xnode1");
    expect(a?.["label"]).toBe("alice");
    expect(a?.["reputation_score"]).toBe(4.5);
    expect(a?.["reputation_count"]).toBe(7);
  });

  it("respects ?limit query param", async () => {
    for (let i = 0; i < 5; i++) {
      await env.DB.prepare(
        "INSERT INTO agents (node, parent, owner, label, mcp_endpoint, capabilities, registered_at_block, registered_at_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          `0xnode${String(i)}`,
          "0xparent",
          "0xowner",
          `agent${String(i)}`,
          "https://x/mcp",
          "research",
          100 + i,
          1715300000 + i,
        )
        .run();
    }

    const res = await SELF.fetch("https://example.com/api/agents?limit=2");
    const body = await res.json<{ agents: unknown[]; limit: number }>();
    expect(body.agents).toHaveLength(2);
    expect(body.limit).toBe(2);
  });

  it("clamps limit at 200", async () => {
    const res = await SELF.fetch("https://example.com/api/agents?limit=99999");
    const body = await res.json<{ limit: number }>();
    expect(body.limit).toBe(200);
  });
});
