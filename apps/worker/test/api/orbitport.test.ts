import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import type { OrbitportLastDrawResponse } from "@kanbantic/shared";

import { applyMigrations } from "../../src/db/migrate.js";

describe("GET /api/orbitport/last-draw", () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("DELETE FROM orbitport_draws").run();
  });

  it("returns { last: null } on cold start", async () => {
    const res = await SELF.fetch("https://example.com/api/orbitport/last-draw");
    expect(res.status).toBe(200);
    const body = await res.json<OrbitportLastDrawResponse>();
    expect(body.last).toBeNull();
  });

  it("returns the most recent draw row after one is inserted", async () => {
    await env.DB.prepare(
      "INSERT INTO orbitport_draws (draw_hex, signature_hex, pubkey_hex, ts) VALUES (?, ?, ?, ?)",
    )
      .bind(`0x${"11".repeat(32)}`, `0x${"22".repeat(64)}`, `0x${"33".repeat(32)}`, 1_715_000_000)
      .run();

    const res = await SELF.fetch("https://example.com/api/orbitport/last-draw");
    expect(res.status).toBe(200);
    const body = await res.json<OrbitportLastDrawResponse>();
    expect(body.last).not.toBeNull();
    expect(body.last?.draw_hex).toBe(`0x${"11".repeat(32)}`);
    expect(body.last?.signature_hex).toBe(`0x${"22".repeat(64)}`);
    expect(body.last?.pubkey_hex).toBe(`0x${"33".repeat(32)}`);
    expect(body.last?.ts).toBe(1_715_000_000);
    expect(body.last?.used_for_bounty_id).toBeNull();
  });

  it("orders by id DESC and returns just the latest row", async () => {
    for (let i = 0; i < 3; i++) {
      await env.DB.prepare(
        "INSERT INTO orbitport_draws (draw_hex, signature_hex, pubkey_hex, ts) VALUES (?, ?, ?, ?)",
      )
        .bind(
          `0x${i.toString(16).padStart(2, "0").repeat(32)}`,
          `0x${"00".repeat(64)}`,
          `0x${"00".repeat(32)}`,
          1_715_000_000 + i,
        )
        .run();
    }

    const res = await SELF.fetch("https://example.com/api/orbitport/last-draw");
    const body = await res.json<OrbitportLastDrawResponse>();
    expect(body.last?.ts).toBe(1_715_000_002);
  });
});
