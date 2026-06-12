import { describe, expect, it } from "vitest";

import { exploreReasonLine, scoreExploreIntent } from "../explore-intent-score";

const basePlace = {
  googlePlaceId: "place-1",
  name: "Test Cafe",
  lat: -34.9,
  lng: -56.16,
  types: ["cafe"],
  primaryType: "cafe",
  rating: 4.5,
  openNow: true,
};

describe("scoreExploreIntent", () => {
  it("boosts open_now places when intent is open_now", () => {
    const openScore = scoreExploreIntent("open_now", basePlace, 500);
    const closedScore = scoreExploreIntent(
      "open_now",
      { ...basePlace, openNow: false },
      500,
    );
    expect(openScore).toBeGreaterThan(closedScore);
  });

  it("prefers cafes for work_2h intent", () => {
    const cafeScore = scoreExploreIntent("work_2h", basePlace, 800);
    const restaurantScore = scoreExploreIntent(
      "work_2h",
      { ...basePlace, types: ["restaurant"], primaryType: "restaurant" },
      800,
    );
    expect(cafeScore).toBeGreaterThan(restaurantScore);
  });

  it("covers remaining intents", () => {
    expect(scoreExploreIntent("brunch_long", basePlace, 500)).toBeGreaterThan(
      scoreExploreIntent("brunch_long", basePlace, 5000),
    );
    expect(scoreExploreIntent("solo", basePlace, 500)).toBeGreaterThan(
      scoreExploreIntent(
        "solo",
        { ...basePlace, types: ["restaurant"], primaryType: "restaurant" },
        500,
      ),
    );
    expect(scoreExploreIntent("first_date", { ...basePlace, rating: 4.5 }, 500)).toBeGreaterThan(
      scoreExploreIntent("first_date", { ...basePlace, rating: 3.5 }, 500),
    );
    expect(scoreExploreIntent("snack_fast", basePlace, 500)).toBeGreaterThan(
      scoreExploreIntent("snack_fast", basePlace, 2000),
    );
    expect(scoreExploreIntent("reading", basePlace, 500)).toBeGreaterThan(
      scoreExploreIntent(
        "reading",
        { ...basePlace, types: ["restaurant"], primaryType: "restaurant" },
        500,
      ),
    );
    expect(scoreExploreIntent("group_4", { ...basePlace, types: ["restaurant"] }, 500)).toBeGreaterThan(
      scoreExploreIntent("group_4", { ...basePlace, types: ["cafe"] }, 500),
    );
  });
});

describe("exploreReasonLine", () => {
  it("returns a readable line for open_now", () => {
    expect(exploreReasonLine("open_now", basePlace)).toBe("Abierto ahora");
    expect(exploreReasonLine("open_now", { ...basePlace, openNow: false })).toBe(
      "Cerca para salir ya",
    );
  });

  it("returns lines for all intents", () => {
    expect(exploreReasonLine("work_2h", basePlace)).toContain("trabajar");
    expect(exploreReasonLine("brunch_long", basePlace)).toContain("brunch");
    expect(exploreReasonLine("solo", basePlace)).toContain("solo");
    expect(exploreReasonLine("first_date", basePlace)).toContain("cita");
    expect(exploreReasonLine("snack_fast", basePlace)).toContain("pausa");
    expect(exploreReasonLine("reading", basePlace)).toContain("leer");
    expect(exploreReasonLine("group_4", basePlace)).toContain("grupo");
  });
});
