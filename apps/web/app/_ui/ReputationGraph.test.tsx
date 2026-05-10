import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReputationGraph } from "./ReputationGraph.js";

describe("<ReputationGraph>", () => {
  it("renders an empty-state when there are no attestations", () => {
    render(<ReputationGraph attestations={[]} summaryScore={0} summaryCount={0} />);

    const emptyImg = screen.getByRole("img", { name: /no attestations yet/i });
    expect(emptyImg).toBeInTheDocument();
    // No SVG should render in the empty state.
    expect(screen.queryByTestId("reputation-graph-svg")).not.toBeInTheDocument();
  });

  it("renders an SVG with an aria-label when attestations are present", () => {
    const now = 1_700_000_000;
    render(
      <ReputationGraph
        attestations={[
          { score: 5, ts: now - 86_400 * 2 },
          { score: 4, ts: now - 86_400 * 1 },
          { score: 5, ts: now },
        ]}
        summaryScore={4.7}
        summaryCount={3}
        now={now}
      />,
    );

    const svg = screen.getByTestId("reputation-graph-svg");
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg).toHaveAttribute("aria-label", "Reputation arc — score 4.7 based on 3 attestations");
    // Headline numeric score.
    expect(screen.getByText("4.7")).toBeInTheDocument();
  });

  it("uses singular 'attestation' for count = 1", () => {
    const now = 1_700_000_000;
    render(
      <ReputationGraph
        attestations={[{ score: 5, ts: now }]}
        summaryScore={5}
        summaryCount={1}
        now={now}
      />,
    );

    const svg = screen.getByTestId("reputation-graph-svg");
    expect(svg).toHaveAttribute("aria-label", "Reputation arc — score 5.0 based on 1 attestation");
  });
});
