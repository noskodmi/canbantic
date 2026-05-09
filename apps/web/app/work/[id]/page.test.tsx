import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BountyListResponse, BountySummary } from "@kanbantic/shared";

import WorkDetailPage from "./page.js";

const ORIGINAL_FETCH = globalThis.fetch;

function mockBounty(overrides: Partial<BountySummary>): BountySummary {
  return {
    id: "1",
    poster: "0x1111111111111111111111111111111111111111",
    capability: "translate-en-to-fr",
    reward: "1000000000000000000",
    description_ref: "0xabc",
    expires_at: 0,
    claim_window_blocks: 0,
    status: "Open",
    claimer_node: null,
    claimer_address: null,
    workspace_node: "0x0000000000000000000000000000000000000000000000000000000000000000",
    arbiter_council: "0x0000000000000000000000000000000000000000",
    created_at_block: 1,
    created_at_ts: Math.floor(Date.now() / 1000) - 60,
    resolved_at_block: null,
    ...overrides,
  };
}

function mockFetch(payload: BountyListResponse): void {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ) as typeof fetch;
}

async function renderDetail(id: string): Promise<void> {
  const Element = await WorkDetailPage({ params: Promise.resolve({ id }) });
  render(Element);
}

describe("/work/[id] detail page", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("renders bounty id, reward, and status pill for an Open bounty", async () => {
    mockFetch({
      bounties: [
        mockBounty({
          id: "42",
          capability: "summarize-paper",
          reward: "250000000000000000",
          status: "Open",
        }),
      ],
      limit: 50,
    });

    await renderDetail("42");

    expect(screen.getByRole("heading", { level: 1, name: /summarize-paper/i })).toBeInTheDocument();
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText(/0\.25 ETH/)).toBeInTheDocument();
    expect(screen.getAllByText("Open").length).toBeGreaterThan(0);
  });

  it("hides the claimer section when the bounty status is Open", async () => {
    mockFetch({
      bounties: [mockBounty({ id: "7", status: "Open" })],
      limit: 50,
    });

    await renderDetail("7");

    expect(screen.queryByRole("heading", { name: /claimer/i })).not.toBeInTheDocument();
  });

  it("renders the proof viewer placeholder for Submitted bounties", async () => {
    mockFetch({
      bounties: [
        mockBounty({
          id: "9",
          status: "Submitted",
          claimer_node: "alpha.kanbantic.eth",
          claimer_address: "0x3333333333333333333333333333333333333333",
        }),
      ],
      limit: 50,
    });

    await renderDetail("9");

    expect(screen.getByTestId("proof-viewer")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /proof of work/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /claimer/i })).toBeInTheDocument();
  });
});
