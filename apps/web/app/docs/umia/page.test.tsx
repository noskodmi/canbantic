import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { sepoliaDeployment, UNDEPLOYED_PLACEHOLDER } from "@kanbantic/shared";

import UmiaDocsPage from "./page.js";

describe("/docs/umia page", () => {
  it("renders the heading, the AgentVenture address, and a Sourcify link when deployed", () => {
    render(<UmiaDocsPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: /umia spin-out walkthrough/i }),
    ).toBeInTheDocument();

    const ventureAddress = sepoliaDeployment.contracts.AgentVenture;
    expect(screen.getByText(ventureAddress)).toBeInTheDocument();

    if (ventureAddress !== UNDEPLOYED_PLACEHOLDER) {
      const sourcifyLinks = screen.getAllByRole("link", { name: /sourcify ↗/i });
      const matching = sourcifyLinks.find((a) => a.getAttribute("href")?.includes(ventureAddress));
      expect(matching).toBeDefined();
      expect(matching?.getAttribute("href")).toBe(`https://sourcify.dev/lookup/${ventureAddress}`);
    }
  });
});
