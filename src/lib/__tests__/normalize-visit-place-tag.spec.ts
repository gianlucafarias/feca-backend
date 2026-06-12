import { describe, expect, it } from "vitest";

import {
  mergeVisitPlaceTags,
  normalizeVisitPlaceTag,
  normalizeVisitPlaceTags,
} from "../normalize-visit-place-tag";

describe("normalizeVisitPlaceTag", () => {
  it("returns null for empty input", () => {
    expect(normalizeVisitPlaceTag("   ")).toBeNull();
  });

  it("capitalizes and collapses whitespace", () => {
    expect(normalizeVisitPlaceTag("  cafe   con   wifi  ")).toBe("Cafe con wifi");
  });

  it("caps length at 32 characters", () => {
    const long = "a".repeat(40);
    expect(normalizeVisitPlaceTag(long)).toHaveLength(32);
  });
});

describe("normalizeVisitPlaceTags", () => {
  it("returns an empty array for missing input", () => {
    expect(normalizeVisitPlaceTags(undefined)).toEqual([]);
    expect(normalizeVisitPlaceTags([])).toEqual([]);
  });

  it("deduplicates case-insensitively and limits to 20 tags", () => {
    const tags = Array.from({ length: 25 }, (_, index) => `tag ${index}`);
    const normalized = normalizeVisitPlaceTags(tags);
    expect(normalized).toHaveLength(20);
  });

  it("skips invalid entries", () => {
    expect(normalizeVisitPlaceTags(["  ", "Brunch", "brunch"])).toEqual([
      "Brunch",
    ]);
  });
});

describe("mergeVisitPlaceTags", () => {
  it("prefers place tags before user tags and deduplicates", () => {
    expect(
      mergeVisitPlaceTags(["Brunch", "Work"], ["brunch", "Terrace"]),
    ).toEqual(["brunch", "Terrace", "Work"]);
  });

  it("limits merged tags to 40", () => {
    const userTags = Array.from({ length: 30 }, (_, index) => `u${index}`);
    const placeTags = Array.from({ length: 30 }, (_, index) => `p${index}`);
    expect(mergeVisitPlaceTags(userTags, placeTags)).toHaveLength(40);
  });
});
