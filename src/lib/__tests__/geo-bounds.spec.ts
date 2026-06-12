import { describe, expect, it } from "vitest";

import {
  filterSortByDistance,
  geoBoundsFromRadiusMeters,
  nearbySqlTakeLimit,
  placeBoundingBoxWhere,
} from "../geo-bounds";

describe("geoBoundsFromRadiusMeters", () => {
  it("centra el box en el origen", () => {
    const bounds = geoBoundsFromRadiusMeters(-34.9, -56.16, 1000);
    expect(bounds.minLat).toBeLessThan(-34.9);
    expect(bounds.maxLat).toBeGreaterThan(-34.9);
    expect(bounds.minLng).toBeLessThan(-56.16);
    expect(bounds.maxLng).toBeGreaterThan(-56.16);
  });

  it("expande el box con mayor radio", () => {
    const small = geoBoundsFromRadiusMeters(0, 0, 500);
    const large = geoBoundsFromRadiusMeters(0, 0, 5000);
    expect(large.maxLat - large.minLat).toBeGreaterThan(
      small.maxLat - small.minLat,
    );
  });
});

describe("filterSortByDistance", () => {
  it("ordena por distancia y respeta el límite", () => {
    const originLat = -34.9;
    const originLng = -56.16;
    const items = [
      { id: "far", lat: -34.95, lng: -56.2 },
      { id: "near", lat: -34.901, lng: -56.161 },
    ];

    const result = filterSortByDistance(
      originLat,
      originLng,
      items,
      5000,
      1,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("near");
    expect(result[0]?.distanceMeters).toBeGreaterThan(0);
  });

  it("excluye puntos fuera del radio", () => {
    const result = filterSortByDistance(
      -34.9,
      -56.16,
      [{ id: "ba", lat: -34.6037, lng: -58.3816 }],
      100,
      5,
    );
    expect(result).toHaveLength(0);
  });

  it("sorts multiple items by distance", () => {
    const result = filterSortByDistance(
      -34.9,
      -56.16,
      [
        { id: "mid", lat: -34.905, lng: -56.165 },
        { id: "near", lat: -34.901, lng: -56.161 },
      ],
      5000,
      5,
    );
    expect(result.map((item) => item.id)).toEqual(["near", "mid"]);
  });
});

describe("placeBoundingBoxWhere", () => {
  it("maps bounds to Prisma lat/lng filters", () => {
    const bounds = geoBoundsFromRadiusMeters(-34.9, -56.16, 1000);
    expect(placeBoundingBoxWhere(bounds)).toEqual({
      lat: { gte: bounds.minLat, lte: bounds.maxLat },
      lng: { gte: bounds.minLng, lte: bounds.maxLng },
    });
  });
});

describe("nearbySqlTakeLimit", () => {
  it("escala con el límite y respeta el cap", () => {
    expect(nearbySqlTakeLimit(10)).toBe(80);
    expect(nearbySqlTakeLimit(30, 150)).toBe(150);
  });
});
