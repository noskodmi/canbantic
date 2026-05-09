import { describe, expect, it } from "vitest";

import { version } from "./index.js";

describe("version", () => {
  it("returns the package version string", () => {
    expect(version()).toBe("0.0.0");
  });
});
