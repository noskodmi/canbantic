import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StatusFilter } from "./StatusFilter.js";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/work",
  useSearchParams: () => new URLSearchParams("status=Open"),
}));

describe("StatusFilter chips", () => {
  it("marks the Open chip active when ?status=Open is in the URL", () => {
    render(<StatusFilter />);

    const openChip = screen.getByRole("button", { name: "Open" });
    expect(openChip).toHaveAttribute("aria-pressed", "true");

    const allChip = screen.getByRole("button", { name: "All" });
    expect(allChip).toHaveAttribute("aria-pressed", "false");
  });
});
