import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import DocsIndexPage from "./page.js";

describe("/docs index page", () => {
  it("renders the heading and links to all four sub-pages", () => {
    render(<DocsIndexPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: /sponsor-track explainers/i }),
    ).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /sourcify trust gallery/i })).toHaveAttribute(
      "href",
      "/docs/sourcify",
    );
    expect(screen.getByRole("link", { name: /swarm verified-fetch/i })).toHaveAttribute(
      "href",
      "/docs/swarm",
    );
    expect(screen.getByRole("link", { name: /spacecomputer orbitport/i })).toHaveAttribute(
      "href",
      "/docs/space-computer",
    );
    expect(screen.getByRole("link", { name: /umia spin-out walkthrough/i })).toHaveAttribute(
      "href",
      "/docs/umia",
    );
  });
});
