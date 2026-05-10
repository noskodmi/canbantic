import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { keccak256, stringToBytes } from "viem";

import { AttestationModal } from "./AttestationModal.js";

describe("<AttestationModal>", () => {
  it("exposes a labelled dialog role with aria-modal", () => {
    render(<AttestationModal bountyId="42" onSubmit={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");

    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).not.toBeNull();
    if (labelledBy === null) return;
    const heading = document.getElementById(labelledBy);
    expect(heading?.textContent).toMatch(/accept submission/i);

    expect(screen.getByRole("button", { name: /close attestation dialog/i })).toBeInTheDocument();
  });

  it("renders the score selector and an empty comment field", () => {
    render(<AttestationModal bountyId="42" onSubmit={vi.fn()} onClose={vi.fn()} />);

    // Score 1..5 each rendered as a radio button.
    for (const value of [1, 2, 3, 4, 5]) {
      expect(screen.getByRole("radio", { name: String(value) })).toBeInTheDocument();
    }

    // Default selection is 5.
    expect(screen.getByRole("radio", { name: "5" })).toHaveAttribute("aria-checked", "true");

    // Comment field renders empty.
    const textarea = screen.getByLabelText(/comment/i);
    expect(textarea).toHaveValue("");
  });

  it("submits the selected score and a deterministic commentRef for a given comment", () => {
    const onSubmit = vi.fn();
    render(<AttestationModal bountyId="42" onSubmit={onSubmit} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("radio", { name: "3" }));

    const textarea = screen.getByLabelText(/comment/i);
    fireEvent.change(textarea, { target: { value: "great work" } });

    fireEvent.click(screen.getByRole("button", { name: /submit attestation/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      score: 3,
      commentRef: keccak256(stringToBytes("great work")),
    });
  });

  it("submits commentRef = 0x000…000 when the comment is blank", () => {
    const onSubmit = vi.fn();
    render(<AttestationModal bountyId="42" onSubmit={onSubmit} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /submit attestation/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      score: 5,
      commentRef: `0x${"0".repeat(64)}`,
    });
  });
});
