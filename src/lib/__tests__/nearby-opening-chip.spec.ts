import { describe, expect, it } from "vitest";

import { buildNearbyOpeningChip } from "../nearby-opening-chip";

describe("buildNearbyOpeningChip", () => {
  it("returns open-now label when place is open", () => {
    expect(buildNearbyOpeningChip(true)).toBe("Abierto ahora");
  });

  it("returns a clear closed label when Google reports it closed", () => {
    expect(buildNearbyOpeningChip(false)).toBe("Cerrado ahora");
  });

  it("does not guess when live opening state is unavailable", () => {
    expect(buildNearbyOpeningChip(undefined)).toBeUndefined();
  });
});
