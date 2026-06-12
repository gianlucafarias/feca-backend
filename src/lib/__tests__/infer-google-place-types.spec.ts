import { describe, expect, it } from "vitest";

import {
  resolveGoogleTypesForNearbyPool,
  resolveNearbyGooglePoolProfile,
} from "../infer-google-place-types";

describe("resolveNearbyGooglePoolProfile", () => {
  it("returns bar_focus when small_bar taste is present", () => {
    expect(
      resolveNearbyGooglePoolProfile({
        tastePreferenceIds: ["small_bar"],
        outingPreferences: null,
        inferredIntent: "solo",
      }),
    ).toBe("bar_focus");
  });

  it("returns cafe_focus for work intent", () => {
    expect(
      resolveNearbyGooglePoolProfile({
        tastePreferenceIds: [],
        outingPreferences: null,
        inferredIntent: "work_2h",
      }),
    ).toBe("cafe_focus");
  });

  it("returns dining_focus when food_drink is a top priority", () => {
    expect(
      resolveNearbyGooglePoolProfile({
        tastePreferenceIds: [],
        outingPreferences: {
          schemaVersion: 1,
          placePriorities: ["food_drink", "distance"],
        },
        inferredIntent: "solo",
      }),
    ).toBe("dining_focus");
  });

  it("prefers explicit intent over inferred", () => {
    expect(
      resolveNearbyGooglePoolProfile({
        tastePreferenceIds: [],
        outingPreferences: null,
        inferredIntent: "solo",
        explicitIntent: "work_2h",
      }),
    ).toBe("cafe_focus");
  });

  it("returns default when no signals match", () => {
    expect(
      resolveNearbyGooglePoolProfile({
        tastePreferenceIds: [],
        outingPreferences: null,
        inferredIntent: "solo",
      }),
    ).toBe("default");
  });
});

describe("resolveGoogleTypesForNearbyPool", () => {
  it("returns explicit type when provided", () => {
    expect(
      resolveGoogleTypesForNearbyPool({
        explicitType: "restaurant",
        profile: "default",
      }),
    ).toEqual(["restaurant"]);
  });

  it("maps profiles to Google place types", () => {
    expect(
      resolveGoogleTypesForNearbyPool({ profile: "cafe_focus" }),
    ).toEqual(["cafe", "bakery"]);
    expect(
      resolveGoogleTypesForNearbyPool({ profile: "bar_focus" }),
    ).toEqual(["bar", "restaurant"]);
  });
});
