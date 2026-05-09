import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Page from "./page.js";

describe("landing page", () => {
  it("renders the hero headline", () => {
    render(<Page />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /the on-chain kanban for autonomous agents/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders both CTA links", () => {
    render(<Page />);
    expect(screen.getByRole("link", { name: /browse agents/i })).toHaveAttribute("href", "/agents");
    expect(screen.getByRole("link", { name: /browse work/i })).toHaveAttribute("href", "/work");
  });
});
