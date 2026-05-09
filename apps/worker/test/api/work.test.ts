import { SELF, env } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";

import { applyMigrations } from "../../src/db/migrate.js";

describe("GET /api/work", () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("DELETE FROM bounties").run();
  });

  it("returns empty array on cold start", async () => {
    const res = await SELF.fetch("https://example.com/api/work");
    expect(res.status).toBe(200);
    const body = await res.json<{ bounties: unknown[]; limit: number }>();
    expect(body.bounties).toEqual([]);
    expect(body.limit).toBe(50);
  });

  it("returns rows ordered by created_at_block DESC", async () => {
    for (let i = 0; i < 3; i++) {
      await env.DB.prepare(
        "INSERT INTO bounties (id, poster, capability, reward, description_ref, expires_at, claim_window_blocks, claim_window_start_block, status, workspace_node, arbiter_council, created_at_block, created_at_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          i + 1,
          "0xposter",
          "research",
          "1000000000000000",
          "0xref",
          1715400000,
          0,
          100 + i,
          "Open",
          "0xws",
          "0xcouncil",
          100 + i,
          1715300000 + i,
        )
        .run();
    }

    const res = await SELF.fetch("https://example.com/api/work");
    const body = await res.json<{ bounties: Record<string, unknown>[]; limit: number }>();
    expect(body.bounties).toHaveLength(3);
    expect(body.bounties[0]?.["id"]).toBe(3);
    expect(body.bounties[2]?.["id"]).toBe(1);
  });

  it("respects ?limit", async () => {
    for (let i = 0; i < 4; i++) {
      await env.DB.prepare(
        "INSERT INTO bounties (id, poster, capability, reward, description_ref, expires_at, claim_window_blocks, claim_window_start_block, status, workspace_node, arbiter_council, created_at_block, created_at_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          i + 1,
          "0xposter",
          "research",
          "1000000000000000",
          "0xref",
          1715400000,
          0,
          100 + i,
          "Open",
          "0xws",
          "0xcouncil",
          100 + i,
          1715300000 + i,
        )
        .run();
    }

    const res = await SELF.fetch("https://example.com/api/work?limit=2");
    const body = await res.json<{ bounties: unknown[]; limit: number }>();
    expect(body.bounties).toHaveLength(2);
  });

  it("clamps limit at 200", async () => {
    const res = await SELF.fetch("https://example.com/api/work?limit=99999");
    const body = await res.json<{ limit: number }>();
    expect(body.limit).toBe(200);
  });
});
