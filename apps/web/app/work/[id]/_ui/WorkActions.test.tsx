import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { BountySummary } from "@kanbantic/shared";

const POSTER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

const accountState = {
  address: undefined as string | undefined,
  isConnected: false,
};

vi.mock("wagmi", () => ({
  useAccount: () => ({ ...accountState }),
  useWriteContract: () => ({
    writeContract: vi.fn(),
    data: undefined,
    isPending: false,
    error: null,
    reset: vi.fn(),
  }),
  useWaitForTransactionReceipt: () => ({
    isLoading: false,
    isSuccess: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: () => <div data-testid="connect-button" />,
}));

vi.mock("../../../_lib/api.js", () => ({
  getAgents: vi.fn().mockResolvedValue({ agents: [], limit: 50 }),
}));

import { WorkActions } from "./WorkActions.js";

function withQueryClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

function bounty(overrides: Partial<BountySummary> = {}): BountySummary {
  return {
    id: "1",
    poster: POSTER,
    capability: "summarize",
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
    created_at_ts: Math.floor(Date.now() / 1000),
    resolved_at_block: null,
    ...overrides,
  };
}

describe("<WorkActions>", () => {
  it("prompts to connect a wallet when disconnected", () => {
    accountState.address = undefined;
    accountState.isConnected = false;

    render(withQueryClient(<WorkActions bounty={bounty({ status: "Open" })} />));

    expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument();
    expect(screen.getByTestId("connect-button")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /claim bounty/i })).not.toBeInTheDocument();
  });

  it("hides the claim CTA when the connected wallet is the poster", () => {
    accountState.address = POSTER;
    accountState.isConnected = true;

    render(withQueryClient(<WorkActions bounty={bounty({ status: "Open", poster: POSTER })} />));

    expect(screen.queryByRole("button", { name: /claim bounty/i })).not.toBeInTheDocument();
    expect(screen.getByText(/you posted this bounty/i)).toBeInTheDocument();
  });

  it("renders the resolved footer with no actions when status=Resolved", () => {
    accountState.address = OTHER;
    accountState.isConnected = true;

    render(withQueryClient(<WorkActions bounty={bounty({ status: "Resolved" })} />));

    expect(screen.getByText(/this bounty is resolved/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
