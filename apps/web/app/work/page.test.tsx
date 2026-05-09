import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BountyListResponse, BountySummary } from "@kanbantic/shared";

import WorkPage from "./page.js";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/work",
  useSearchParams: () => new URLSearchParams(),
}));

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

function mockListResponse(bounties: BountySummary[]): BountyListResponse {
  return { bounties, limit: 50 };
}

function mockFetch(payload: BountyListResponse): void {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ) as typeof fetch;
}

async function renderWorkPage(searchParams: Record<string, string> = {}): Promise<void> {
  const Element = await WorkPage({
    searchParams: Promise.resolve(searchParams),
  });
  render(Element);
}

describe("/work browse page", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("renders all bounties when fetch returns multiple statuses", async () => {
    mockFetch(
      mockListResponse([
        mockBounty({ id: "1", capability: "open-task", status: "Open" }),
        mockBounty({
          id: "2",
          capability: "claimed-task",
          status: "Claimed",
          claimer_node: "agent-zero.kanbantic.eth",
          claimer_address: "0x2222222222222222222222222222222222222222",
        }),
        mockBounty({ id: "3", capability: "resolved-task", status: "Resolved" }),
      ]),
    );

    await renderWorkPage();

    expect(screen.getByText("open-task")).toBeInTheDocument();
    expect(screen.getByText("claimed-task")).toBeInTheDocument();
    expect(screen.getByText("resolved-task")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("#3")).toBeInTheDocument();
  });

  it("shows the empty state CTA when the bounty list is empty", async () => {
    mockFetch({ bounties: [], limit: 50 });

    await renderWorkPage();

    expect(screen.getByText(/no bounties yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /post a bounty/i })).toHaveAttribute("href", "/post");
  });

  it("renders status filter chips", async () => {
    mockFetch({ bounties: [], limit: 50 });

    await renderWorkPage();

    const group = screen.getByRole("group", { name: /filter bounties by status/i });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claimed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resolved" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disputed" })).toBeInTheDocument();
  });
});
