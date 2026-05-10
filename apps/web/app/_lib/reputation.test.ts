import { describe, expect, it } from "vitest";

import {
  REPUTATION_WINDOW_DAYS,
  buildReputationSeries,
  reputationAreaPath,
  reputationLinePath,
} from "./reputation.js";

describe("buildReputationSeries", () => {
  it("returns 30 zero-points when there are no attestations", () => {
    const series = buildReputationSeries([]);
    expect(series).toHaveLength(REPUTATION_WINDOW_DAYS);
    for (const point of series) {
      expect(point.score).toBe(0);
    }
  });

  it("rolls forward the latest score on quiet days", () => {
    const now = 1_700_000_000;
    const oneDay = 86_400;
    const series = buildReputationSeries(
      [
        { score: 5, ts: now - oneDay * 25 },
        { score: 3, ts: now - oneDay * 10 },
      ],
      now,
    );
    expect(series).toHaveLength(REPUTATION_WINDOW_DAYS);
    // Last day should reflect the most recent attestation (after smoothing/carry).
    const last = series[REPUTATION_WINDOW_DAYS - 1];
    expect(last).toBeDefined();
    if (last === undefined) return;
    expect(last.score).toBeGreaterThan(0);
    expect(last.score).toBeLessThanOrEqual(5);
  });

  it("clamps scores to [0, 5]", () => {
    const now = 1_700_000_000;
    const series = buildReputationSeries(
      [
        { score: 99, ts: now - 86_400 },
        { score: -10, ts: now },
      ],
      now,
    );
    for (const p of series) {
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeLessThanOrEqual(5);
    }
  });
});

describe("reputationAreaPath / reputationLinePath", () => {
  it("starts with M and closes with Z for the area path", () => {
    const series = buildReputationSeries([{ score: 4, ts: 1_700_000_000 }], 1_700_000_000);
    const d = reputationAreaPath(series, 240, 80);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });

  it("emits a non-empty stroke path for the line", () => {
    const series = buildReputationSeries([{ score: 4, ts: 1_700_000_000 }], 1_700_000_000);
    const d = reputationLinePath(series, 240, 80);
    expect(d).not.toBe("");
    expect(d.startsWith("M")).toBe(true);
  });

  it("emits the empty-payload baseline path when given no points", () => {
    const d = reputationAreaPath([], 240, 80);
    expect(d).toBe("M0 80 L240 80 Z");
  });
});
