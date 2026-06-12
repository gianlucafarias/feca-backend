import { describe, expect, it } from "vitest";

import type { GooglePlaceSummary } from "../../infrastructure/google-places/google-places.client";
import {
  rankNearbyPlaceResults,
  type NearbyRankingContext,
} from "../nearby-ranking";

function place(
  id: string,
  overrides: Partial<GooglePlaceSummary> = {},
): GooglePlaceSummary {
  return {
    googlePlaceId: id,
    name: `Place ${id}`,
    address: "Addr",
    lat: -34.901 + Number(id.replace(/\D/g, "") || 0) * 0.001,
    lng: -56.164,
    types: ["cafe"],
    primaryType: "cafe",
    rating: 4.5,
    userRatingCount: 100,
    openNow: true,
    ...overrides,
  };
}

function baseContext(
  overrides: Partial<NearbyRankingContext> = {},
): NearbyRankingContext {
  return {
    tastePreferenceIds: ["reading_spots"],
    importedPlaceCategoryIds: ["cafe"],
    likedVisitedPlaceCategoryIds: ["cafe"],
    dislikedVisitedPlaceCategoryIds: [],
    outingPreferences: {
      schemaVersion: 1,
      placePriorities: ["distance", "food_drink"],
      typicalOutingSlots: ["weekday_morning"],
      typicalCompanies: ["solo"],
    },
    inferredIntent: "work_2h",
    likedNearbyGooglePlaceIds: new Set(),
    fecaQualityByGoogleId: new Map(),
    adminBoostByGoogleId: new Map(),
    curatedGoogleIds: new Set(),
    cityPickPlaces: [],
    ...overrides,
  };
}

describe("rankNearbyPlaceResults", () => {
  it("returns empty when all home places are filtered out", () => {
    const result = rankNearbyPlaceResults(
      "user-1",
      { lat: -34.901, lng: -56.164, limit: 5, variant: "home_nearby" },
      [place("1", { rating: 2.5 })],
      baseContext(),
    );
    expect(result.places).toEqual([]);
  });

  it("ranks and limits home nearby results", () => {
    const places = [
      place("1"),
      place("2", { types: ["restaurant"], primaryType: "restaurant" }),
      place("3"),
    ];
    const result = rankNearbyPlaceResults(
      "user-1",
      { lat: -34.901, lng: -56.164, limit: 2, variant: "home_nearby" },
      places,
      baseContext(),
    );
    expect(result.places).toHaveLength(2);
    expect(result.debugScores).toBeUndefined();
  });

  it("boosts network variant places", () => {
    const places = [place("1"), place("2")];
    const result = rankNearbyPlaceResults(
      "user-1",
      { lat: -34.901, lng: -56.164, limit: 2, variant: "home_network" },
      places,
      baseContext({
        networkBoostByGoogleId: new Map([["1", 40], ["2", 5]]),
      }),
    );
    expect(result.places[0]?.googlePlaceId).toBe("1");
  });

  it("returns debug score breakdown when requested", () => {
    const result = rankNearbyPlaceResults(
      "user-1",
      { lat: -34.901, lng: -56.164, limit: 1, variant: "home_nearby" },
      [place("1")],
      baseContext({ debugScores: true }),
    );
    expect(result.debugScores?.[0]?.googlePlaceId).toBe("1");
    expect(result.debugScores?.[0]?.finalScore).toBeGreaterThan(0);
  });

  it("uses explicit explore intent scoring", () => {
    const places = [place("1"), place("2", { types: ["restaurant"] })];
    const result = rankNearbyPlaceResults(
      "user-1",
      { lat: -34.901, lng: -56.164, limit: 2 },
      places,
      baseContext({
        explicitExploreIntent: "work_2h",
        inferredIntent: "group_4",
      }),
    );
    expect(result.places.length).toBeGreaterThan(0);
  });

  it("applies city pick slots and curated cap on home mix", () => {
    const places = [
      place("1"),
      place("2", { types: ["restaurant"], primaryType: "restaurant" }),
      place("3"),
      place("4"),
    ];
    const result = rankNearbyPlaceResults(
      "user-1",
      { lat: -34.901, lng: -56.164, limit: 3, variant: "home_nearby" },
      places,
      baseContext({
        cityPickPlaces: [places[2]!, places[3]!],
        curatedGoogleIds: new Set(["1", "2", "3"]),
      }),
    );
    expect(result.places).toHaveLength(3);
  });

  it("supports onboarding_past variant boosts", () => {
    const result = rankNearbyPlaceResults(
      "user-1",
      { lat: -34.901, lng: -56.164, limit: 1, variant: "onboarding_past" },
      [place("1"), place("2")],
      baseContext(),
    );
    expect(result.places).toHaveLength(1);
  });

  it("adds light network boost on home_open_now", () => {
    const result = rankNearbyPlaceResults(
      "user-1",
      { lat: -34.901, lng: -56.164, limit: 1, variant: "home_open_now" },
      [place("1"), place("2")],
      baseContext({
        networkBoostByGoogleId: new Map([["1", 50]]),
      }),
    );
    expect(result.places[0]?.googlePlaceId).toBe("1");
  });

  it("excludes places with poor FECA quality on home mix", () => {
    const result = rankNearbyPlaceResults(
      "user-1",
      { lat: -34.901, lng: -56.164, limit: 5, variant: "home_nearby" },
      [place("1"), place("2")],
      baseContext({
        fecaQualityByGoogleId: new Map([
          [
            "1",
            {
              visitCount: 3,
              avgRating: 2,
              wouldReturnYesCount: 0,
              wouldReturnNoCount: 2,
            },
          ],
        ]),
      }),
    );
    expect(result.places.every((p) => p.googlePlaceId !== "1")).toBe(true);
  });

  it("diversifies categories in the home carousel top", () => {
    const places = [
      place("1", { types: ["cafe"], primaryType: "cafe" }),
      place("2", { types: ["cafe"], primaryType: "cafe" }),
      place("3", { types: ["cafe"], primaryType: "cafe" }),
      place("4", { types: ["restaurant"], primaryType: "restaurant" }),
      place("5", { types: ["restaurant"], primaryType: "restaurant" }),
    ];
    const result = rankNearbyPlaceResults(
      "user-1",
      { lat: -34.901, lng: -56.164, limit: 3, variant: "home_nearby" },
      places,
      baseContext(),
    );
    const keys = result.places.map((p) =>
      p.primaryType?.includes("restaurant") ? "restaurant" : "cafe",
    );
    expect(keys).toContain("restaurant");
    expect(keys).toContain("cafe");
  });

  it("pins high-boost curated places in home mix", () => {
    const places = [place("1"), place("2"), place("3")];
    const result = rankNearbyPlaceResults(
      "user-1",
      { lat: -34.901, lng: -56.164, limit: 2, variant: "home_nearby" },
      places,
      baseContext({
        adminBoostByGoogleId: new Map([["3", 80]]),
        curatedGoogleIds: new Set(["3"]),
      }),
    );
    expect(result.places.some((p) => p.googlePlaceId === "3")).toBe(true);
  });

  it("fills non-curated slots after reaching the curated cap", () => {
    const places = [
      place("1"),
      place("2"),
      place("3"),
      place("4"),
      place("5"),
      place("6", { types: ["restaurant"], primaryType: "restaurant" }),
    ];
    const result = rankNearbyPlaceResults(
      "user-1",
      { lat: -34.901, lng: -56.164, limit: 4, variant: "home_nearby" },
      places,
      baseContext({
        curatedGoogleIds: new Set(["1", "2", "3", "4", "5"]),
        adminBoostByGoogleId: new Map([
          ["1", 30],
          ["2", 29],
          ["3", 28],
          ["4", 27],
          ["5", 26],
        ]),
      }),
    );
    expect(result.places).toHaveLength(4);
    expect(result.places.some((p) => p.googlePlaceId === "6")).toBe(true);
  });

  it("boosts home_friends_liked network signal", () => {
    const result = rankNearbyPlaceResults(
      "user-1",
      { lat: -34.901, lng: -56.164, limit: 1, variant: "home_friends_liked" },
      [place("1"), place("2")],
      baseContext({
        networkBoostByGoogleId: new Map([["1", 20]]),
      }),
    );
    expect(result.places[0]?.googlePlaceId).toBe("1");
  });

  it("adds similar-to-liked boost when categories match", () => {
    const result = rankNearbyPlaceResults(
      "user-1",
      { lat: -34.901, lng: -56.164, limit: 1, variant: "home_nearby" },
      [place("1", { types: ["cafe", "coffee_shop"] })],
      baseContext({
        likedVisitedPlaceCategoryIds: ["cafe"],
        debugScores: true,
      }),
    );
    expect(result.debugScores?.[0]?.similarToLiked).toBeGreaterThan(0);
  });
});
