import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AdminTransferModal } from "./AdminTransferModal.js";

// Lowercase form so viem's strict-by-default isAddress() accepts it
// without requiring a checksum match.
const VALID_ADDR = "0x44c176989d16f5c2a846cf59d4cf68af1006ddde";

describe("<AdminTransferModal>", () => {
  it("exposes a labelled dialog role with aria-modal", () => {
    render(
      <AdminTransferModal
        workspaceLabel="alpha.kanbantic.eth"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).not.toBeNull();
    if (labelledBy === null) return;
    const heading = document.getElementById(labelledBy);
    expect(heading?.textContent).toMatch(/transfer admin/i);

    expect(
      screen.getByRole("button", { name: /close transfer admin dialog/i }),
    ).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <AdminTransferModal
        workspaceLabel="alpha.kanbantic.eth"
        onSubmit={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid address and does not call onSubmit", () => {
    const onSubmit = vi.fn();
    render(
      <AdminTransferModal
        workspaceLabel="alpha.kanbantic.eth"
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByLabelText(/new admin address/i);
    fireEvent.change(input, { target: { value: "not-an-address" } });

    fireEvent.click(screen.getByRole("button", { name: /confirm transfer/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/not a valid ethereum address/i)).toBeInTheDocument();
  });

  it("submits with a valid address", () => {
    const onSubmit = vi.fn();
    render(
      <AdminTransferModal
        workspaceLabel="alpha.kanbantic.eth"
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByLabelText(/new admin address/i);
    fireEvent.change(input, { target: { value: VALID_ADDR } });

    fireEvent.click(screen.getByRole("button", { name: /confirm transfer/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ newAdmin: VALID_ADDR });
  });
});
