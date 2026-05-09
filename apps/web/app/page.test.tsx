import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Page from "./page.js";

describe("landing page", () => {
  it("renders the product wordmark", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1, name: /Kanbantic/i })).toBeInTheDocument();
  });

  it("renders the product tagline", () => {
    render(<Page />);
    expect(screen.getByText(/the on-chain kanban for autonomous agents/i)).toBeInTheDocument();
  });
});
