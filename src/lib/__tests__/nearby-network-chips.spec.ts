import { describe, expect, it, vi, afterEach } from "vitest";

import {
  formatFriendSnippetFromSave,
  formatFriendSnippetFromVisit,
  formatNearbySocialChipLine,
  formatNearbyVisitChip,
  scoreNearbyVisitSignal,
} from "../nearby-network-chips";

describe("formatFriendSnippetFromVisit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns would-return copy", () => {
    expect(
      formatFriendSnippetFromVisit({ rating: 5, wouldReturn: "yes" }),
    ).toBe("volvería a ir");
    expect(
      formatFriendSnippetFromVisit({ rating: 4, wouldReturn: "maybe" }),
    ).toBe("le gustó");
    expect(
      formatFriendSnippetFromVisit({ rating: 3, wouldReturn: "maybe" }),
    ).toBe("podría volver");
    expect(
      formatFriendSnippetFromVisit({ rating: 2, wouldReturn: "no" }),
    ).toBe("pasó por acá");
  });

  it("handles missing or invalid visit dates", () => {
    expect(
      formatFriendSnippetFromVisit({
        rating: 3,
        wouldReturn: null,
        visitedAt: null,
      }),
    ).toBe("visitó el lugar");
    expect(
      formatFriendSnippetFromVisit({
        rating: 3,
        wouldReturn: null,
        visitedAt: "invalid-date",
      }),
    ).toBe("visitó el lugar");
  });

  it("uses recent visit and rating fallbacks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-12T12:00:00.000Z"));

    expect(
      formatFriendSnippetFromVisit({
        rating: 3,
        wouldReturn: null,
        visitedAt: "2024-06-10T12:00:00.000Z",
      }),
    ).toBe("visitó recientemente");

    expect(
      formatFriendSnippetFromVisit({
        rating: 5,
        wouldReturn: null,
        visitedAt: "2023-01-01T12:00:00.000Z",
      }),
    ).toBe("le gustó");
  });
});

describe("formatFriendSnippetFromSave", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("detects recent saves", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-12T12:00:00.000Z"));

    expect(formatFriendSnippetFromSave("2024-06-11T12:00:00.000Z")).toBe(
      "lo guardó hace poco",
    );
    expect(formatFriendSnippetFromSave("2024-01-01T12:00:00.000Z")).toBe(
      "quiere ir",
    );
  });
});

describe("formatNearbySocialChipLine", () => {
  it("builds @username snippet lines", () => {
    expect(formatNearbySocialChipLine("@gian", "le gustó")).toBe(
      "@gian le gustó",
    );
    expect(formatNearbySocialChipLine("gian", "")).toBe("@gian");
  });
});

describe("formatNearbyVisitChip", () => {
  it("combines username and visit snippet", () => {
    expect(
      formatNearbyVisitChip({
        username: "gian",
        displayName: "Gian",
        rating: 5,
        wouldReturn: "yes",
      }),
    ).toBe("@gian volvería a ir");
  });
});

describe("scoreNearbyVisitSignal", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("boosts would-return yes and recent visits", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-12T12:00:00.000Z"));

    const high = scoreNearbyVisitSignal({
      username: "a",
      displayName: "A",
      rating: 5,
      wouldReturn: "yes",
      visitedAt: "2024-06-10T12:00:00.000Z",
    });
    const low = scoreNearbyVisitSignal({
      username: "b",
      displayName: "B",
      rating: 2,
      wouldReturn: "no",
      visitedAt: "2023-01-01T12:00:00.000Z",
    });

    expect(high).toBeGreaterThan(low);
  });

  it("adds a smaller boost for maybe visits", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-12T12:00:00.000Z"));

    const maybe = scoreNearbyVisitSignal({
      username: "a",
      displayName: "A",
      rating: 4,
      wouldReturn: "maybe",
      visitedAt: "2023-01-01T12:00:00.000Z",
    });
    const plain = scoreNearbyVisitSignal({
      username: "b",
      displayName: "B",
      rating: 4,
      wouldReturn: null,
      visitedAt: "2023-01-01T12:00:00.000Z",
    });

    expect(maybe).toBeGreaterThan(plain);
  });
});
