import { describe, expect, it } from "vitest";

import {
  VIEWER_RETURN_REMINDER_COOLDOWN_DAYS,
  formatViewerReturnReminderChip,
  viewerRadarStateFromVisit,
} from "../viewer-nearby-visit-reminder";

describe("formatViewerReturnReminderChip", () => {
  const now = new Date("2024-06-12T12:00:00.000Z");

  it("uses week buckets for recent visits", () => {
    expect(
      formatViewerReturnReminderChip(new Date("2024-06-05T12:00:00.000Z"), now),
    ).toBe("Lo visitaste hace una semana");
    expect(
      formatViewerReturnReminderChip(new Date("2024-05-29T12:00:00.000Z"), now),
    ).toBe("Lo visitaste hace 2 semanas");
  });

  it("uses month buckets for older visits", () => {
    expect(
      formatViewerReturnReminderChip(new Date("2024-05-01T12:00:00.000Z"), now),
    ).toBe("Lo visitaste hace un mes");
    expect(
      formatViewerReturnReminderChip(new Date("2023-01-01T12:00:00.000Z"), now),
    ).toBe("Lo visitaste hace más de un año");
  });

  it("covers intermediate week and month buckets", () => {
    expect(
      formatViewerReturnReminderChip(new Date("2024-05-22T12:00:00.000Z"), now),
    ).toBe("Lo visitaste hace 3 semanas");
    expect(
      formatViewerReturnReminderChip(new Date("2024-04-15T12:00:00.000Z"), now),
    ).toBe("Lo visitaste hace 2 meses");
    expect(
      formatViewerReturnReminderChip(new Date("2024-03-01T12:00:00.000Z"), now),
    ).toBe("Lo visitaste hace 3 meses");
  });

  it("returns a generic fallback for odd durations", () => {
    expect(
      formatViewerReturnReminderChip(new Date("2024-03-28T12:00:00.000Z"), now),
    ).toBe("Lo visitaste hace un tiempo");
  });
});

describe("viewerRadarStateFromVisit", () => {
  const now = new Date("2024-06-12T12:00:00.000Z");
  const visitedAt = new Date("2024-06-01T12:00:00.000Z");

  it("returns neutral without a written review", () => {
    expect(
      viewerRadarStateFromVisit({
        visitedAt,
        wouldReturn: "yes",
        hasWrittenReview: false,
        now,
      }),
    ).toEqual({ kind: "neutral" });
  });

  it("excludes non-yes wouldReturn answers", () => {
    expect(
      viewerRadarStateFromVisit({
        visitedAt,
        wouldReturn: "maybe",
        hasWrittenReview: true,
        now,
      }),
    ).toEqual({ kind: "exclude_from_radar" });
  });

  it("excludes during cooldown after a positive visit", () => {
    const recent = new Date("2024-06-10T12:00:00.000Z");
    expect(
      viewerRadarStateFromVisit({
        visitedAt: recent,
        wouldReturn: "yes",
        hasWrittenReview: true,
        now,
      }),
    ).toEqual({ kind: "exclude_from_radar" });
  });

  it("reminds after cooldown with a chip", () => {
    const state = viewerRadarStateFromVisit({
      visitedAt,
      wouldReturn: "yes",
      hasWrittenReview: true,
      now,
    });
    expect(state.kind).toBe("remind");
    if (state.kind === "remind") {
      expect(state.chip).toContain("Lo visitaste");
    }
    expect(VIEWER_RETURN_REMINDER_COOLDOWN_DAYS).toBe(7);
  });
});
