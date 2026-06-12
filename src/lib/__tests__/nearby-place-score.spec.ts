import { describe, expect, it } from "vitest";

import type { GooglePlaceSummary } from "../../infrastructure/google-places/google-places.client";
import {
  buildNearbyPlaceScore,
  distanceScoreMultiplier,
  isHomeCarouselVariant,
  parsePlacePriorities,
  scoreGoogleQualityPenalty,
  scorePlacePrioritiesAgainstPlace,
  shouldExcludeLowQualityGooglePlace,
  tasteScoreMultiplier,
} from "../nearby-place-score";

function place(overrides: Partial<GooglePlaceSummary> = {}): GooglePlaceSummary {
  return {
    googlePlaceId: "p1",
    name: "Test",
    address: "Addr",
    lat: -34.901,
    lng: -56.164,
    types: ["cafe"],
    primaryType: "cafe",
    rating: 4.5,
    userRatingCount: 100,
    openNow: true,
    ...overrides,
  };
}

describe("isHomeCarouselVariant", () => {
  it("treats undefined and home variants as home", () => {
    expect(isHomeCarouselVariant(undefined)).toBe(true);
    expect(isHomeCarouselVariant("home_nearby")).toBe(true);
    expect(isHomeCarouselVariant("onboarding_past")).toBe(false);
  });
});

describe("parsePlacePriorities", () => {
  it("returns undefined for invalid prefs", () => {
    expect(parsePlacePriorities(null)).toBeUndefined();
    expect(parsePlacePriorities([])).toBeUndefined();
  });

  it("returns priorities when present", () => {
    expect(
      parsePlacePriorities({
        schemaVersion: 1,
        placePriorities: ["distance", "food_drink"],
      }),
    ).toEqual(["distance", "food_drink"]);
  });
});

describe("score multipliers", () => {
  it("boosts taste when atmosphere or quiet are top priorities", () => {
    expect(tasteScoreMultiplier(["atmosphere"])).toBe(1.35);
    expect(tasteScoreMultiplier(["distance"])).toBe(1);
  });

  it("boosts distance scoring when distance is prioritized", () => {
    expect(distanceScoreMultiplier(["distance"])).toBe(1.4);
    expect(distanceScoreMultiplier(["food_drink"])).toBe(1);
  });
});

describe("buildNearbyPlaceScore", () => {
  it("prefers closer, higher-rated, open places", () => {
    const origin = { lat: -34.901, lng: -56.164 };
    const near = buildNearbyPlaceScore(origin, place(), 0);
    const far = buildNearbyPlaceScore(
      origin,
      place({ lat: -34.95, lng: -56.22, openNow: false, rating: 3 }),
      1,
    );
    expect(near).toBeGreaterThan(far);
  });
});

describe("scorePlacePrioritiesAgainstPlace", () => {
  it("returns 0 without priorities", () => {
    expect(scorePlacePrioritiesAgainstPlace(undefined, place(), 500)).toBe(0);
  });

  it("scores food, atmosphere, quiet, service, and distance priorities", () => {
    const priorities = [
      "food_drink",
      "atmosphere",
      "quiet",
      "service",
      "distance",
    ] as const;
    const score = scorePlacePrioritiesAgainstPlace(
      [...priorities],
      place({ types: ["cafe"], rating: 4.5, userRatingCount: 60 }),
      700,
    );
    expect(score).toBeGreaterThan(20);
  });

  it("scores mid-range distance priority separately", () => {
    expect(
      scorePlacePrioritiesAgainstPlace(["distance"], place(), 1200),
    ).toBe(5);
    expect(
      scorePlacePrioritiesAgainstPlace(["distance"], place(), 2000),
    ).toBe(0);
  });
});

describe("google quality helpers", () => {
  it("excludes clearly low-quality places", () => {
    expect(shouldExcludeLowQualityGooglePlace(place({ rating: 3.2 }))).toBe(
      true,
    );
    expect(
      shouldExcludeLowQualityGooglePlace(
        place({ rating: 3.7, userRatingCount: 20 }),
      ),
    ).toBe(true);
    expect(shouldExcludeLowQualityGooglePlace(place())).toBe(false);
  });

  it("applies google quality penalties", () => {
    expect(
      scoreGoogleQualityPenalty(place({ rating: 3.5, userRatingCount: 10 })),
    ).toBe(-25);
    expect(scoreGoogleQualityPenalty(place({ userRatingCount: 5 }))).toBe(-10);
    expect(scoreGoogleQualityPenalty(place())).toBe(0);
  });
});
