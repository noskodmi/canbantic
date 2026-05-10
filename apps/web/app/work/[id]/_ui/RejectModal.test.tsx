import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { keccak256, stringToBytes } from "viem";

import { RejectModal } from "./RejectModal.js";

describe("<RejectModal>", () => {
  it("exposes a labelled dialog role with aria-modal", () => {
    render(<RejectModal bountyId="42" onSubmit={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");

    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).not.toBeNull();
    if (labelledBy === null) return;
    const heading = document.getElementById(labelledBy);
    expect(heading?.textContent).toMatch(/reject submission/i);

    expect(screen.getByRole("button", { name: /close reject dialog/i })).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<RejectModal bountyId="42" onSubmit={vi.fn()} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("submits with the all-zeros sentinel when the reason is blank", () => {
    const onSubmit = vi.fn();
    render(<RejectModal bountyId="42" onSubmit={onSubmit} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /reject submission/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      reasonRef: `0x${"0".repeat(64)}`,
    });
  });

  it("hashes a non-empty reason into reasonRef", () => {
    const onSubmit = vi.fn();
    render(<RejectModal bountyId="42" onSubmit={onSubmit} onClose={vi.fn()} />);

    const textarea = screen.getByLabelText(/reason/i);
    fireEvent.change(textarea, { target: { value: "proof links to wrong commit" } });

    fireEvent.click(screen.getByRole("button", { name: /reject submission/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      reasonRef: keccak256(stringToBytes("proof links to wrong commit")),
    });
  });
});
