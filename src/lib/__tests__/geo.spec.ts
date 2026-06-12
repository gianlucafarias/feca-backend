import { describe, expect, it } from "vitest";

import { distanceInMeters } from "../geo";

describe("distanceInMeters", () => {
  it("returns 0 for identical coordinates", () => {
    expect(distanceInMeters(-34.9, -56.16, -34.9, -56.16)).toBe(0);
  });

  it("computes a known distance between Montevideo and Buenos Aires", () => {
    const meters = distanceInMeters(-34.9011, -56.1645, -34.6037, -58.3816);
    expect(meters).toBeGreaterThan(200_000);
    expect(meters).toBeLessThan(250_000);
  });

  it("is symmetric", () => {
    const ab = distanceInMeters(-34.9, -56.16, -34.91, -56.17);
    const ba = distanceInMeters(-34.91, -56.17, -34.9, -56.16);
    expect(ab).toBeCloseTo(ba, 5);
  });
});
