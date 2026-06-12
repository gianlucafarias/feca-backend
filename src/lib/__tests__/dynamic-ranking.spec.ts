import { describe, expect, it } from "vitest";

import { rankCandidatesWithRotation } from "../dynamic-ranking";

describe("rankCandidatesWithRotation", () => {
  it("returns single candidate unchanged", () => {
    const result = rankCandidatesWithRotation(
      [{ baseScore: 10, id: "a", item: "A" }],
      { seed: "test" },
    );
    expect(result).toEqual([{ baseScore: 10, id: "a", item: "A", score: 10 }]);
  });

  it("sorts by base score when top window is 1", () => {
    const result = rankCandidatesWithRotation(
      [
        { baseScore: 5, id: "b", item: "B" },
        { baseScore: 20, id: "a", item: "A" },
      ],
      { seed: "test", topWindow: 1 },
    );
    expect(result[0]?.id).toBe("a");
    expect(result[1]?.id).toBe("b");
    expect(result[1]?.score).toBe(5);
  });

  it("applies stable jitter within the top window", () => {
    const now = new Date("2024-06-12T12:00:00.000Z");
    const first = rankCandidatesWithRotation(
      [
        { baseScore: 100, id: "a", item: "A" },
        { baseScore: 99, id: "b", item: "B" },
        { baseScore: 98, id: "c", item: "C" },
      ],
      { seed: "seed-1", now, topWindow: 3 },
    );
    const second = rankCandidatesWithRotation(
      [
        { baseScore: 100, id: "a", item: "A" },
        { baseScore: 99, id: "b", item: "B" },
        { baseScore: 98, id: "c", item: "C" },
      ],
      { seed: "seed-1", now, topWindow: 3 },
    );
    expect(first.map((entry) => entry.id)).toEqual(second.map((entry) => entry.id));
    expect(first.some((entry) => entry.score !== entry.baseScore)).toBe(true);
  });

  it("keeps deterministic order for the same seed", () => {
    const candidates = [
      { baseScore: 10, id: "b", item: "B" },
      { baseScore: 10, id: "a", item: "A" },
    ];
    const first = rankCandidatesWithRotation(candidates, {
      seed: "tie-test",
      topWindow: 2,
    });
    const second = rankCandidatesWithRotation(candidates, {
      seed: "tie-test",
      topWindow: 2,
    });
    expect(first.map((entry) => entry.id)).toEqual(second.map((entry) => entry.id));
  });

  it("skips jitter when span is zero", () => {
    const result = rankCandidatesWithRotation(
      [
        { baseScore: 10, id: "a", item: "A" },
        { baseScore: 9, id: "b", item: "B" },
      ],
      { seed: "zero-jitter", topWindow: 2, maxJitter: 0, jitterRatio: 0 },
    );
    expect(result.every((entry) => entry.score === entry.baseScore)).toBe(true);
  });
});
