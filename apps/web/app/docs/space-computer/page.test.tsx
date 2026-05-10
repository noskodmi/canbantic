import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SpaceComputerDocsPage from "./page.js";

const ORIGINAL_FETCH = globalThis.fetch;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("/docs/space-computer page", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("renders the heading and the latest-draw section", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(jsonResponse({ last: null })));

    const ui = await SpaceComputerDocsPage();
    render(ui);

    expect(
      screen.getByRole("heading", { level: 1, name: /spacecomputer orbitport/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /latest draw/i })).toBeInTheDocument();
    expect(screen.getByText(/no draws indexed yet/i)).toBeInTheDocument();
  });
});
