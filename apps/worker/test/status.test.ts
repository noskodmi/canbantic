import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { applyMigrations } from "../src/db/migrate.js";

describe("GET /api/status", () => {
  it("returns chain id + indexer lag with seeded cursor", async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("INSERT OR REPLACE INTO index_cursor (chain_id, last_block) VALUES (?, ?)")
      .bind(11155111, 10822050)
      .run();

    const response = await SELF.fetch("https://example.com/api/status");
    expect(response.status).toBe(200);
    const body = await response.json<{
      chainId: number;
      lastBlock: number;
      contracts: Record<string, string>;
    }>();
    expect(body.chainId).toBe(11155111);
    expect(body.lastBlock).toBe(10822050);
    expect(body.contracts["AgentRegistry"]).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("returns lastBlock=0 when no cursor row exists", async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("DELETE FROM index_cursor").run();

    const response = await SELF.fetch("https://example.com/api/status");
    expect(response.status).toBe(200);
    const body = await response.json<{ lastBlock: number }>();
    expect(body.lastBlock).toBe(0);
  });
});
