import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SwarmDocsPage from "./page.js";

describe("/docs/swarm page", () => {
  it("renders the heading and the live integrity probe trigger", () => {
    render(<SwarmDocsPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: /swarm verified-fetch/i }),
    ).toBeInTheDocument();

    // The IntegrityProbe client island renders the two buttons.
    expect(screen.getByRole("button", { name: /run integrity probe/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /demonstrate tampering/i })).toBeInTheDocument();

    // npm link in the footer.
    const npmLink = screen.getByRole("link", {
      name: /@kanbantic\/swarm-verified-fetch on npm/i,
    });
    expect(npmLink).toHaveAttribute(
      "href",
      "https://www.npmjs.com/package/@kanbantic/swarm-verified-fetch",
    );
  });
});
