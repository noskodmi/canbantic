import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("wagmi", () => ({
  useAccount: vi.fn(),
  usePublicClient: () => undefined,
  useWaitForTransactionReceipt: vi.fn(() => ({
    isLoading: false,
    isSuccess: false,
    isError: false,
    error: null,
  })),
  useWriteContract: vi.fn(() => ({
    writeContract: vi.fn(),
    data: undefined,
    isPending: false,
    error: null,
    reset: vi.fn(),
  })),
}));

vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: () => <button type="button">Connect Wallet</button>,
}));

import { useAccount } from "wagmi";

import NewWorkspacePage from "./page.js";

const mockedUseAccount = vi.mocked(useAccount);

function withQueryClient(node: ReactElement): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("/workspaces/new page", () => {
  it("renders the connect-wallet CTA when the user is not connected", () => {
    mockedUseAccount.mockReturnValue({
      isConnected: false,
    } as ReturnType<typeof useAccount>);

    render(withQueryClient(<NewWorkspacePage />));

    expect(
      screen.getByRole("heading", { level: 1, name: /create a workspace/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
  });

  it("renders the label form with a live preview when connected", () => {
    mockedUseAccount.mockReturnValue({
      isConnected: true,
    } as ReturnType<typeof useAccount>);

    render(withQueryClient(<NewWorkspacePage />));

    expect(screen.getByLabelText(/^label$/i)).toBeInTheDocument();
    // Empty preview shows the placeholder template.
    expect(screen.getByText(/<label>\.kanbantic\.eth/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create workspace/i })).toBeInTheDocument();
  });
});
