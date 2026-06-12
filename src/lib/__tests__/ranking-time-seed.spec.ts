import { describe, expect, it } from "vitest";

import { utcHourBucketId, utcWeekBucketId } from "../ranking-time-seed";

describe("utcWeekBucketId", () => {
  it("returns a stable bucket for a fixed UTC date", () => {
    expect(utcWeekBucketId(new Date("2024-06-12T12:00:00.000Z"))).toBe("2024w23");
  });

  it("changes bucket across week boundaries", () => {
    const a = utcWeekBucketId(new Date("2024-01-01T00:00:00.000Z"));
    const b = utcWeekBucketId(new Date("2024-01-08T00:00:00.000Z"));
    expect(a).not.toBe(b);
  });
});

describe("utcHourBucketId", () => {
  it("formats year-month-day and hour in UTC", () => {
    expect(utcHourBucketId(new Date("2024-06-12T15:30:00.000Z"))).toBe(
      "2024-06-12h15",
    );
  });
});
