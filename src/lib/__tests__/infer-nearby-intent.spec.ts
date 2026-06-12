import { describe, expect, it } from "vitest";

import { inferNearbyExploreIntent } from "../infer-nearby-intent";

describe("inferNearbyExploreIntent", () => {
  it("defaults to work_2h on weekday mornings without prefs", () => {
    const now = new Date("2024-06-12T09:00:00"); // Wed 09:00 local
    expect(inferNearbyExploreIntent(null, now)).toBe("work_2h");
  });

  it("defaults to solo on weekday afternoons without prefs", () => {
    const now = new Date("2024-06-12T13:00:00");
    expect(inferNearbyExploreIntent(null, now)).toBe("solo");
  });

  it("defaults to group_4 on weekday evenings without prefs", () => {
    const now = new Date("2024-06-12T20:00:00");
    expect(inferNearbyExploreIntent(null, now)).toBe("group_4");
  });

  it("uses weekday_morning slot for work_2h when prefs match", () => {
    const now = new Date("2024-06-12T09:00:00");
    expect(
      inferNearbyExploreIntent(
        {
          schemaVersion: 1,
          typicalOutingSlots: ["weekday_morning"],
        },
        now,
      ),
    ).toBe("work_2h");
  });

  it("prefers reading for solo company on weekday mornings", () => {
    const now = new Date("2024-06-12T09:00:00");
    expect(
      inferNearbyExploreIntent(
        {
          schemaVersion: 1,
          typicalCompanies: ["solo"],
        },
        now,
      ),
    ).toBe("reading");
  });

  it("returns brunch_long on weekend day slots", () => {
    const now = new Date("2024-06-15T12:00:00"); // Sat
    expect(
      inferNearbyExploreIntent(
        {
          schemaVersion: 1,
          typicalOutingSlots: ["weekend_day"],
        },
        now,
      ),
    ).toBe("brunch_long");
  });

  it("returns first_date for evening couple outings", () => {
    const now = new Date("2024-06-12T20:00:00");
    expect(
      inferNearbyExploreIntent(
        {
          schemaVersion: 1,
          typicalOutingSlots: ["weekday_evening"],
          typicalCompanies: ["couple"],
        },
        now,
      ),
    ).toBe("first_date");
  });

  it("falls back to typicalCompany when companies array is missing", () => {
    const now = new Date("2024-06-12T16:00:00");
    expect(
      inferNearbyExploreIntent(
        {
          schemaVersion: 1,
          typicalCompany: "small_group",
        },
        now,
      ),
    ).toBe("group_4");
  });

  it("returns snack_fast on weekday afternoons with matching slot", () => {
    expect(
      inferNearbyExploreIntent(
        {
          schemaVersion: 1,
          typicalOutingSlots: ["weekday_afternoon"],
        },
        new Date("2024-06-12T13:00:00"),
      ),
    ).toBe("snack_fast");
  });

  it("returns group_4 for evening slots without couple company", () => {
    expect(
      inferNearbyExploreIntent(
        {
          schemaVersion: 1,
          typicalOutingSlots: ["weekday_evening"],
          typicalCompanies: ["small_group"],
        },
        new Date("2024-06-12T20:00:00"),
      ),
    ).toBe("group_4");
  });

  it("falls back to solo or first_date from company prefs off-peak", () => {
    expect(
      inferNearbyExploreIntent(
        { schemaVersion: 1, typicalCompanies: ["solo"] },
        new Date("2024-06-12T16:00:00"),
      ),
    ).toBe("solo");
    expect(
      inferNearbyExploreIntent(
        { schemaVersion: 1, typicalCompanies: ["couple"] },
        new Date("2024-06-12T16:00:00"),
      ),
    ).toBe("first_date");
  });

  it("defaults to solo outside known hour buckets", () => {
    expect(
      inferNearbyExploreIntent(null, new Date("2024-06-12T16:00:00")),
    ).toBe("solo");
  });
});
