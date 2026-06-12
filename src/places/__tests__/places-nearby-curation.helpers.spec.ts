import { describe, expect, it } from "vitest";

import type { GooglePlaceSummary } from "../../infrastructure/google-places/google-places.client";
import type { PlaceRecord } from "../../types";
import {
  mergeCityCurationsIntoNearbyCandidates,
  prependAdminCuratedPlaces,
} from "../places-nearby.helpers";

function storedPlace(
  sourcePlaceId: string,
  overrides: Partial<PlaceRecord> = {},
): PlaceRecord {
  return {
    id: `db-${sourcePlaceId}`,
    source: "google",
    sourcePlaceId,
    name: `Place ${sourcePlaceId}`,
    address: "Addr",
    city: "Montevideo",
    categories: ["cafe"],
    lat: -34.901,
    lng: -56.164,
    ...overrides,
  };
}

function nearbyPlace(
  googlePlaceId: string,
  overrides: Partial<GooglePlaceSummary> = {},
): GooglePlaceSummary {
  return {
    googlePlaceId,
    name: googlePlaceId,
    address: "Addr",
    lat: -34.901,
    lng: -56.164,
    types: ["cafe"],
    primaryType: "cafe",
    ...overrides,
  };
}

describe("mergeCityCurationsIntoNearbyCandidates", () => {
  it("injects boosted curated places missing from the Google pool", () => {
    const merged = mergeCityCurationsIntoNearbyCandidates(
      [nearbyPlace("pool-1")],
      [
        {
          boostScore: 80,
          isCityPick: false,
          showRecommendedBadge: true,
          updatedAt: new Date("2026-01-01"),
          place: storedPlace("curated-1", {
            lat: -34.95,
            lng: -56.22,
          }),
        },
      ],
    );

    expect(merged.map((place) => place.googlePlaceId).sort()).toEqual([
      "curated-1",
      "pool-1",
    ]);
  });
});

describe("prependAdminCuratedPlaces", () => {
  it("forces admin curated places to the top regardless of ranking", () => {
    const ranked = [
      nearbyPlace("organic-1"),
      nearbyPlace("organic-2"),
      nearbyPlace("organic-3"),
    ];

    const result = prependAdminCuratedPlaces(ranked, [
      {
        boostScore: 90,
        isCityPick: false,
        showRecommendedBadge: true,
        updatedAt: new Date("2026-01-02"),
        place: storedPlace("curated-top", {
          lat: -35.01,
          lng: -56.3,
        }),
      },
    ], {
      limit: 3,
    });

    expect(result[0]?.googlePlaceId).toBe("curated-top");
    expect(result).toHaveLength(3);
  });

  it("includes curated places outside the nearby radius when city matches", () => {
    const merged = mergeCityCurationsIntoNearbyCandidates(
      [],
      [
        {
          boostScore: 70,
          isCityPick: true,
          showRecommendedBadge: true,
          updatedAt: new Date("2026-01-03"),
          place: storedPlace("far-curated", {
            lat: -34.75,
            lng: -56.05,
          }),
        },
      ],
    );

    expect(merged.map((place) => place.googlePlaceId)).toEqual(["far-curated"]);
  });
});
