import { describe, expect, it } from "vitest";

import {
  sanitizeOutingPreferences,
  scoreOutingAgainstIntent,
} from "../outing-preferences";

describe("sanitizeOutingPreferences", () => {
  it("returns null for null input", () => {
    expect(sanitizeOutingPreferences(null)).toBeNull();
  });

  it("rejects non-object input", () => {
    expect(() => sanitizeOutingPreferences([])).toThrow(
      "outingPreferences must be a JSON object or null",
    );
  });

  it("keeps allowed slots, companies, and priorities", () => {
    expect(
      sanitizeOutingPreferences({
        typicalOutingSlots: ["weekday_morning", "invalid"],
        typicalCompanies: ["solo", "invalid"],
        placePriorities: ["food_drink", "invalid"],
      }),
    ).toEqual({
      schemaVersion: 1,
      typicalOutingSlots: ["weekday_morning"],
      typicalCompanies: ["solo"],
      placePriorities: ["food_drink"],
    });
  });

  it("maps deprecated typicalCompany to typicalCompanies", () => {
    expect(
      sanitizeOutingPreferences({
        typicalCompany: "couple",
      }),
    ).toEqual({
      schemaVersion: 1,
      typicalCompanies: ["couple"],
    });
  });
});

describe("scoreOutingAgainstIntent", () => {
  const prefs = {
    schemaVersion: 1 as const,
    typicalOutingSlots: ["weekday_morning", "weekday_afternoon"],
    typicalCompanies: ["solo", "small_group"],
  };

  it("returns 0 without prefs", () => {
    expect(scoreOutingAgainstIntent("solo", null)).toBe(0);
  });

  it("scores solo and group intents", () => {
    expect(scoreOutingAgainstIntent("solo", prefs)).toBe(10);
    expect(scoreOutingAgainstIntent("group_4", prefs)).toBe(12);
  });

  it("scores work and snack intents from slots", () => {
    expect(scoreOutingAgainstIntent("work_2h", prefs)).toBe(8);
    expect(scoreOutingAgainstIntent("snack_fast", prefs)).toBe(6);
  });

  it("scores first_date from couple or solo company", () => {
    expect(
      scoreOutingAgainstIntent("first_date", {
        schemaVersion: 1,
        typicalCompanies: ["couple"],
      }),
    ).toBe(8);
  });

  it("scores brunch, reading, and open_now intents", () => {
    expect(
      scoreOutingAgainstIntent("brunch_long", {
        schemaVersion: 1,
        typicalOutingSlots: ["weekend_day"],
      }),
    ).toBe(6);
    expect(
      scoreOutingAgainstIntent("reading", {
        schemaVersion: 1,
        typicalOutingSlots: ["weekday_morning"],
      }),
    ).toBe(6);
    expect(
      scoreOutingAgainstIntent("open_now", {
        schemaVersion: 1,
        typicalOutingSlots: ["weekend_night"],
      }),
    ).toBe(4);
  });
});
