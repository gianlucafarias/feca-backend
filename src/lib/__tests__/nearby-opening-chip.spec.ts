import { describe, expect, it } from "vitest";

import { buildNearbyOpeningChip } from "../nearby-opening-chip";

describe("buildNearbyOpeningChip", () => {
  const wednesday = new Date("2024-06-12T15:00:00");

  it("returns open-now label when place is open", () => {
    expect(buildNearbyOpeningChip(true, undefined, wednesday)).toBe(
      "Abierto ahora",
    );
  });

  it("returns closed-today when weekday line says cerrado", () => {
    expect(
      buildNearbyOpeningChip(false, ["miércoles: cerrado"], wednesday, "es-UY"),
    ).toBe("Cerrado hoy");
  });

  it("returns opening time from today's weekday line", () => {
    expect(
      buildNearbyOpeningChip(
        false,
        ["miércoles: 10:00 – 22:00"],
        wednesday,
        "es-UY",
      ),
    ).toBe("Abre a las 10:00");
  });

  it("uses monday-first index when there are exactly seven lines", () => {
    const lines = [
      "lunes: 09:00 – 18:00",
      "martes: 09:00 – 18:00",
      "miércoles: 09:00 – 18:00",
      "jueves: 09:00 – 18:00",
      "viernes: 09:00 – 18:00",
      "sábado: 10:00 – 14:00",
      "domingo: cerrado",
    ];
    expect(buildNearbyOpeningChip(false, lines, wednesday, "es-UY")).toBe(
      "Abre a las 09:00",
    );
  });

  it("returns undefined when there is no schedule data", () => {
    expect(buildNearbyOpeningChip(undefined, [], wednesday)).toBeUndefined();
  });

  it("returns undefined for empty hours after colon", () => {
    expect(
      buildNearbyOpeningChip(false, ["miércoles:"], wednesday, "es-UY"),
    ).toBeUndefined();
  });

  it("returns undefined when the first window is marked closed", () => {
    expect(
      buildNearbyOpeningChip(
        false,
        ["miércoles: cerrado"],
        wednesday,
        "es-UY",
      ),
    ).toBe("Cerrado hoy");
    expect(
      buildNearbyOpeningChip(false, ["miércoles:   "], wednesday, "es-UY"),
    ).toBeUndefined();
  });

  it("parses schedules without a weekday prefix when hours have no colon", () => {
    expect(
      buildNearbyOpeningChip(false, ["0900"], wednesday, "es-UY"),
    ).toBe("Abre a las 0900");
  });

  it("falls back to the first line when weekday names do not match", () => {
    expect(
      buildNearbyOpeningChip(
        false,
        ["Monday: 09:00 – 18:00", "Tuesday: 09:00 – 18:00"],
        wednesday,
        "es-UY",
      ),
    ).toBe("Abre a las 09:00");
  });

  it("uses monday-first fallback when seven lines omit weekday prefixes", () => {
    const lines = [
      "0800",
      "0800",
      "0900",
      "0900",
      "0900",
      "1000",
      "cerrado",
    ];
    expect(buildNearbyOpeningChip(false, lines, wednesday, "es-UY")).toBe(
      "Abre a las 0900",
    );
  });
});
