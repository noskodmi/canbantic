import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Footer } from "./Footer.js";

function withQueryClient(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const ORIGINAL_FETCH = globalThis.fetch;

describe("Footer indexer health pill", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("renders 'indexer healthy' (green dot) when /api/status resolves", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          chainId: 11155111,
          lastBlock: 1234,
          contracts: {},
          ens: { rootName: "kanbantic.eth", rootNamehash: "0x" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as typeof fetch;

    render(withQueryClient(<Footer />));

    const status = await screen.findByRole("status");
    await waitFor(() => {
      expect(status).toHaveTextContent(/indexer healthy/i);
    });
    expect(status.querySelector("span.bg-green-500")).not.toBeNull();
  });

  it("renders 'indexer down' (red dot) when fetch rejects", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down")) as typeof fetch;

    render(withQueryClient(<Footer />));

    const status = await screen.findByRole("status");
    await waitFor(
      () => {
        expect(status).toHaveTextContent(/indexer down/i);
      },
      { timeout: 3000 },
    );
    expect(status.querySelector("span.bg-red-500")).not.toBeNull();
  });
});
