import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import DocsIndexPage from "./page.js";

describe("/docs index page", () => {
  it("renders the heading", () => {
    render(<DocsIndexPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: /get going with kanbantic/i }),
    ).toBeInTheDocument();
  });

  it("links to all primary doc pages", () => {
    render(<DocsIndexPage />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/docs/quickstart");
    expect(hrefs).toContain("/docs/concepts");
    expect(hrefs).toContain("/docs/auto-claim");
    expect(hrefs).toContain("/docs/api");
  });

  it("links to all integration sub-pages", () => {
    render(<DocsIndexPage />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/docs/sourcify");
    expect(hrefs).toContain("/docs/swarm");
    expect(hrefs).toContain("/docs/space-computer");
    expect(hrefs).toContain("/docs/umia");
  });
});
