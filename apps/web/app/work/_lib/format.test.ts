import { describe, expect, it } from "vitest";

import { formatEth, relativeTime } from "./format.js";

describe("formatEth", () => {
  it("renders 1 ETH for 10^18 wei", () => {
    expect(formatEth("1000000000000000000")).toBe("1 ETH");
  });

  it("renders 0.1 ETH for 10^17 wei", () => {
    expect(formatEth("100000000000000000")).toBe("0.1 ETH");
  });

  it("trims trailing zeros for fractional values", () => {
    expect(formatEth("250000000000000000")).toBe("0.25 ETH");
  });

  it("falls back to a wei label for non-decimal input", () => {
    expect(formatEth("not-a-number")).toBe("not-a-number wei");
  });
});

describe("relativeTime", () => {
  it("returns minutes for sub-hour deltas", () => {
    const now = 1_000_000;
    expect(relativeTime(now - 5 * 60, now)).toBe("5m ago");
  });

  it("returns hours for sub-day deltas", () => {
    const now = 1_000_000;
    expect(relativeTime(now - 3 * 60 * 60, now)).toBe("3h ago");
  });

  it("returns days for sub-month deltas", () => {
    const now = 1_000_000;
    expect(relativeTime(now - 2 * 24 * 60 * 60, now)).toBe("2d ago");
  });
});
