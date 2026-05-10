import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sepoliaDeployment } from "@kanbantic/shared";

vi.mock("wagmi", () => ({
  useAccount: vi.fn(() => ({ isConnected: true })),
  useWalletClient: vi.fn(() => ({
    data: {
      account: { address: "0x000000000000000000000000000000000000c0DE" },
      chain: { id: 11155111 },
      sendTransaction: vi.fn(),
    },
  })),
  usePublicClient: vi.fn(() => ({
    waitForTransactionReceipt: vi.fn(),
  })),
}));

vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: () => <button type="button">Connect Wallet</button>,
}));

import { useAccount } from "wagmi";

import { ContractIntelligenceForm } from "./ContractIntelligenceForm.js";
import ContractIntelligenceDashboardPage from "./page.js";

const ORIGINAL_FETCH = globalThis.fetch;
const TX_HASH = `0x${"a".repeat(64)}`;

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

/** A 402 challenge body matching the worker's `eth-direct` envelope. */
function challenge402(): Response {
  const body = {
    x402Version: "0.1",
    accepts: [
      {
        scheme: "eth-direct",
        payTo: "0x000000000000000000000000000000000000bEEF",
        asset: "eth",
        amount: "100000000000000",
        network: "sepolia",
      },
    ],
  };
  return new Response(JSON.stringify(body), {
    status: 402,
    headers: {
      "content-type": "application/json",
      "x-payment-address": "0x000000000000000000000000000000000000bEEF",
    },
  });
}

const SAMPLE_CONTRACTS = Object.entries(sepoliaDeployment.contracts).map(([name, address]) => ({
  name,
  address,
}));

const mockedUseAccount = vi.mocked(useAccount);

describe("/dashboard/contract-intelligence — page shell", () => {
  it("renders the runner heading + footer", () => {
    render(<ContractIntelligenceDashboardPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /contract intelligence/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/why contract intelligence/i)).toBeInTheDocument();
  });

  it("seeds the form with the 5 Kanbantic Sepolia contracts as sample buttons", () => {
    render(<ContractIntelligenceDashboardPage />);
    // Should mention every contract name from sepoliaDeployment.
    for (const [name] of Object.entries(sepoliaDeployment.contracts)) {
      expect(screen.getByText(new RegExp(name))).toBeInTheDocument();
    }
  });
});

describe("ContractIntelligenceForm — wallet-required X402 paywall", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    mockedUseAccount.mockReturnValue({ isConnected: true } as ReturnType<typeof useAccount>);
    vi.clearAllMocks();
  });

  it("shows a Connect prompt + price hint when the wallet isn't connected", () => {
    mockedUseAccount.mockReturnValue({ isConnected: false } as ReturnType<typeof useAccount>);
    render(<ContractIntelligenceForm sampleContracts={SAMPLE_CONTRACTS} />);
    // Connect prompt rendered.
    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
    // Pricing hint visible (per-call cost).
    expect(screen.getAllByText(/0\.0001 ETH/).length).toBeGreaterThan(0);
  });

  it("pays a 402 challenge and renders the markdown report + receipt link", async () => {
    // 1st fetch: 402 challenge. 2nd fetch: success.
    const successResp = jsonResponse(
      {
        kind: "audit",
        address: sepoliaDeployment.contracts.AgentRegistry,
        sourcifyMatch: "exact_match",
        report:
          "# Contract Intelligence — audit report\n\n## Findings (stub)\n\nReal audit lands when AI_GATEWAY_TOKEN env is set.\n",
        sourcifyUrl: `https://sourcify.dev/lookup/${sepoliaDeployment.contracts.AgentRegistry}`,
      },
      { status: 200, headers: { "x-payment-receipt": TX_HASH } },
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(challenge402())
      .mockResolvedValueOnce(successResp);
    globalThis.fetch = fetchMock as typeof fetch;

    // Re-import wagmi mocks so we can hand a working wallet/publicClient.
    const { useWalletClient, usePublicClient } = await import("wagmi");
    const sendTransaction = vi.fn().mockResolvedValue(TX_HASH);
    const waitForTransactionReceipt = vi.fn().mockResolvedValue({ status: "success" });
    vi.mocked(useWalletClient).mockReturnValue({
      data: {
        account: { address: "0x000000000000000000000000000000000000c0DE" },
        chain: { id: 11155111 },
        sendTransaction,
      },
    } as unknown as ReturnType<typeof useWalletClient>);
    vi.mocked(usePublicClient).mockReturnValue({
      waitForTransactionReceipt,
    } as unknown as ReturnType<typeof usePublicClient>);

    render(<ContractIntelligenceForm sampleContracts={SAMPLE_CONTRACTS} />);

    fireEvent.change(screen.getByLabelText(/sepolia contract address/i), {
      target: { value: sepoliaDeployment.contracts.AgentRegistry },
    });
    fireEvent.click(screen.getByRole("button", { name: /pay 0\.0001 ETH and run audit/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    // First fetch — no x-payment header.
    const [firstUrl, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstUrl).toMatch(/\/api\/contract-intelligence\/run$/);
    expect((firstInit.headers as Record<string, string>)["x-payment"]).toBeUndefined();

    // Wallet was asked to send the right amount.
    expect(sendTransaction).toHaveBeenCalledTimes(1);
    const sendArgs = sendTransaction.mock.calls[0]?.[0] as { value: bigint };
    expect(sendArgs.value).toBe(100_000_000_000_000n);

    // Second fetch — x-payment header carries the tx hash.
    const [, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((secondInit.headers as Record<string, string>)["x-payment"]).toBe(TX_HASH);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 3, name: /findings \(stub\)/i }),
      ).toBeInTheDocument();
    });

    // Receipt link rendered with Etherscan deep-link.
    const receiptLink = screen.getByRole("link", {
      name: new RegExp(TX_HASH, "i"),
    });
    expect(receiptLink.getAttribute("href")).toBe(`https://sepolia.etherscan.io/tx/${TX_HASH}`);
  });

  it("renders an error envelope when the worker returns not_verified after payment", async () => {
    const errorResp = jsonResponse(
      {
        kind: "audit",
        address: "0xdEAD000000000000000000000000000000000000",
        error: "not_verified",
        message: "Address is not verified on Sourcify.",
      },
      { status: 200, headers: { "x-payment-receipt": TX_HASH } },
    );
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(challenge402())
      .mockResolvedValueOnce(errorResp) as typeof fetch;

    const { useWalletClient, usePublicClient } = await import("wagmi");
    vi.mocked(useWalletClient).mockReturnValue({
      data: {
        account: { address: "0x000000000000000000000000000000000000c0DE" },
        chain: { id: 11155111 },
        sendTransaction: vi.fn().mockResolvedValue(TX_HASH),
      },
    } as unknown as ReturnType<typeof useWalletClient>);
    vi.mocked(usePublicClient).mockReturnValue({
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
    } as unknown as ReturnType<typeof usePublicClient>);

    render(<ContractIntelligenceForm sampleContracts={SAMPLE_CONTRACTS} />);
    fireEvent.change(screen.getByLabelText(/sepolia contract address/i), {
      target: { value: "0xdEAD000000000000000000000000000000000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /pay 0\.0001 ETH and run audit/i }));

    await waitFor(() => {
      expect(screen.getByText(/Address is not verified on Sourcify\./i)).toBeInTheDocument();
    });
  });

  it("clicking a sample contract fills the address input", () => {
    render(<ContractIntelligenceForm sampleContracts={SAMPLE_CONTRACTS} />);
    const target = SAMPLE_CONTRACTS[0];
    if (!target) throw new Error("expected at least one sample contract");
    fireEvent.click(screen.getByRole("button", { name: new RegExp(target.address) }));
    const input = screen.getByLabelText<HTMLInputElement>(/sepolia contract address/i);
    expect(input.value).toBe(target.address);
  });
});
