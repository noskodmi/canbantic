import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: () => <div data-testid="connect-button" />,
}));

import { Nav } from "./Nav.js";

describe("<Nav>", () => {
  it("renders the mobile menu toggle with an accessible name", () => {
    render(<Nav />);
    const toggle = screen.getByRole("button", { name: /open navigation menu/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "primary-mobile-nav");
  });

  it("flips the toggle's accessible name and aria-expanded when opened", () => {
    render(<Nav />);
    const toggle = screen.getByRole("button", { name: /open navigation menu/i });
    fireEvent.click(toggle);
    const reopened = screen.getByRole("button", { name: /close navigation menu/i });
    expect(reopened).toHaveAttribute("aria-expanded", "true");

    // The mobile nav region is rendered with the controlled id.
    const mobileNav = document.getElementById("primary-mobile-nav");
    expect(mobileNav).not.toBeNull();
    expect(mobileNav).toHaveAttribute("aria-label", "Primary");
  });
});
