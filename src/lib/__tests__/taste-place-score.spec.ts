import { describe, expect, it } from "vitest";

import {
  scoreCategoryAffinityAgainstPlace,
  scoreTasteAgainstPlace,
  scoreTasteAgainstVisitTags,
} from "../taste-place-score";

describe("scoreTasteAgainstPlace", () => {
  it("returns 0 when there are no taste ids", () => {
    expect(scoreTasteAgainstPlace([], ["cafe"], "reading")).toBe(0);
  });

  it("scores reading spots for cafe categories", () => {
    expect(
      scoreTasteAgainstPlace(["reading_spots"], ["cafe", "coffee_shop"], "solo"),
    ).toBe(10);
  });

  it("ignores unknown taste ids", () => {
    expect(
      scoreTasteAgainstPlace(["unknown_taste"], ["cafe"], "reading"),
    ).toBe(0);
  });

  it("scores multiple taste ids for matching intents and categories", () => {
    expect(
      scoreTasteAgainstPlace(
        ["wifi_outlets", "quiet", "bright_light"],
        ["cafe"],
        "work_2h",
      ),
    ).toBe(17);
    expect(
      scoreTasteAgainstPlace(["small_bar"], ["wine_bar"], "solo"),
    ).toBe(8);
    expect(
      scoreTasteAgainstPlace(["terrace"], ["restaurant"], "group_4"),
    ).toBe(4);
    expect(
      scoreTasteAgainstPlace(["indoor_table"], ["bistro"], "first_date"),
    ).toBe(4);
    expect(
      scoreTasteAgainstPlace(["specialty_over_brunch"], ["bakery"], "brunch_long"),
    ).toBe(9);
  });
});

describe("scoreCategoryAffinityAgainstPlace", () => {
  it("returns 0 when either side is empty", () => {
    expect(scoreCategoryAffinityAgainstPlace([], ["cafe"])).toBe(0);
    expect(scoreCategoryAffinityAgainstPlace(["cafe"], [])).toBe(0);
  });

  it("scores matching categories with a cap", () => {
    const preferred = Array.from({ length: 10 }, () => "cafe");
    expect(scoreCategoryAffinityAgainstPlace(preferred, ["cafe"])).toBeLessThanOrEqual(
      34,
    );
    expect(scoreCategoryAffinityAgainstPlace(["cafe"], ["cafe"])).toBe(7);
  });
});

describe("scoreTasteAgainstVisitTags", () => {
  it("scores quiet taste against quiet visit tags", () => {
    expect(scoreTasteAgainstVisitTags(["quiet"], ["quiet"])).toBe(8);
  });

  it("returns 0 when inputs are empty", () => {
    expect(scoreTasteAgainstVisitTags([], ["quiet"])).toBe(0);
    expect(scoreTasteAgainstVisitTags(["quiet"], [])).toBe(0);
  });

  it("scores reading, wifi, and brunch tags", () => {
    expect(scoreTasteAgainstVisitTags(["reading_spots"], ["reading"])).toBe(10);
    expect(scoreTasteAgainstVisitTags(["wifi_outlets"], ["work"])).toBe(8);
    expect(
      scoreTasteAgainstVisitTags(["specialty_over_brunch"], ["brunch"]),
    ).toBe(9);
  });

  it("ignores unknown taste ids in visit tag scoring", () => {
    expect(scoreTasteAgainstVisitTags(["unknown_taste"], ["quiet"])).toBe(0);
  });
});
