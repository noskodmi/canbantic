import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { sepoliaDeployment } from "@kanbantic/shared";

import SourcifyDocsPage from "./page.js";

describe("/docs/sourcify page", () => {
  it("renders the heading and a Sourcify link for AgentRegistry", () => {
    render(<SourcifyDocsPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: /sourcify trust gallery/i }),
    ).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 3, name: /^AgentRegistry$/ })).toBeInTheDocument();

    const sourcifyLinks = screen.getAllByRole("link", { name: /sourcify ↗/i });
    expect(sourcifyLinks.length).toBeGreaterThan(0);

    const agentRegistryAddress = sepoliaDeployment.contracts.AgentRegistry;
    const matching = sourcifyLinks.find((a) =>
      a.getAttribute("href")?.includes(agentRegistryAddress),
    );
    expect(matching).toBeDefined();
    expect(matching?.getAttribute("href")).toBe(
      `https://sourcify.dev/lookup/${agentRegistryAddress}`,
    );
  });
});
