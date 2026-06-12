import { describe, expect, it } from "vitest";

import {
  scoreFecaPlaceQuality,
  shouldExcludeByFecaQuality,
} from "../score-feca-place-quality";

describe("scoreFecaPlaceQuality", () => {
  it("returns 0 when there are no stats", () => {
    expect(scoreFecaPlaceQuality(undefined)).toBe(0);
  });

  it("boosts highly rated places with enough visits", () => {
    expect(
      scoreFecaPlaceQuality({
        visitCount: 4,
        avgRating: 4.8,
        wouldReturnYesCount: 3,
        wouldReturnNoCount: 0,
      }),
    ).toBe(16);
  });

  it("penalizes low ratings", () => {
    expect(
      scoreFecaPlaceQuality({
        visitCount: 3,
        avgRating: 2.5,
        wouldReturnYesCount: 0,
        wouldReturnNoCount: 2,
      }),
    ).toBe(-20);
  });
  it("boosts moderately rated places with visits", () => {
    expect(
      scoreFecaPlaceQuality({
        visitCount: 2,
        avgRating: 4.2,
        wouldReturnYesCount: 1,
        wouldReturnNoCount: 0,
      }),
    ).toBe(8);
  });

  it("penalizes would-return-no majority", () => {
    expect(
      scoreFecaPlaceQuality({
        visitCount: 4,
        avgRating: 3.5,
        wouldReturnYesCount: 0,
        wouldReturnNoCount: 3,
      }),
    ).toBe(-20);
  });

  it("returns neutral score for sparse positive stats", () => {
    expect(
      scoreFecaPlaceQuality({
        visitCount: 1,
        avgRating: 4.5,
        wouldReturnYesCount: 1,
        wouldReturnNoCount: 0,
      }),
    ).toBe(0);
  });
});

describe("shouldExcludeByFecaQuality", () => {
  it("does not exclude with too few visits", () => {
    expect(
      shouldExcludeByFecaQuality({
        visitCount: 1,
        avgRating: 1,
        wouldReturnYesCount: 0,
        wouldReturnNoCount: 1,
      }),
    ).toBe(false);
  });

  it("excludes places with very low average rating", () => {
    expect(
      shouldExcludeByFecaQuality({
        visitCount: 3,
        avgRating: 2,
        wouldReturnYesCount: 0,
        wouldReturnNoCount: 2,
      }),
    ).toBe(true);
  });

  it("excludes when would-return-no dominates", () => {
    expect(
      shouldExcludeByFecaQuality({
        visitCount: 5,
        avgRating: 3.5,
        wouldReturnYesCount: 1,
        wouldReturnNoCount: 4,
      }),
    ).toBe(true);
  });
});
