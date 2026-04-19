import type { Prisma } from "@prisma/client";

import type { ExploreIntent } from "../places/explore-context";

/** Contrato versionado guardado en `User.outingPreferences` (JSON). */
export type OutingPreferencesV1 = {
  schemaVersion: 1;
  /** Franjas típicas en las que le gusta salir. */
  typicalOutingSlots?: Array<
    | "weekday_morning"
    | "weekday_afternoon"
    | "weekday_evening"
    | "weekend_day"
    | "weekend_night"
  >;
  /** Con quién suele salir (varias opciones). */
  typicalCompanies?: Array<"solo" | "couple" | "small_group" | "large_group">;
  /** @deprecated Usar `typicalCompanies`; se sigue leyendo por compatibilidad. */
  typicalCompany?: "solo" | "couple" | "small_group" | "large_group";
  /** Prioridades al elegir un lugar (orden sugerido). */
  placePriorities?: Array<
    | "atmosphere"
    | "distance"
    | "food_drink"
    | "price"
    | "quiet"
    | "service"
  >;
};

const ALLOWED_SLOTS = new Set<string>([
  "weekday_morning",
  "weekday_afternoon",
  "weekday_evening",
  "weekend_day",
  "weekend_night",
]);

const ALLOWED_COMPANY = new Set<string>([
  "solo",
  "couple",
  "small_group",
  "large_group",
]);

const ALLOWED_PRIORITIES = new Set<string>([
  "atmosphere",
  "distance",
  "food_drink",
  "price",
  "quiet",
  "service",
]);

export function sanitizeOutingPreferences(raw: unknown): Prisma.JsonObject | null {
  if (raw === null) {
    return null;
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("outingPreferences must be a JSON object or null");
  }

  const input = raw as Record<string, unknown>;
  const out: OutingPreferencesV1 = { schemaVersion: 1 };

  if (Array.isArray(input.typicalOutingSlots)) {
    const slots = input.typicalOutingSlots
      .filter((s): s is string => typeof s === "string" && ALLOWED_SLOTS.has(s))
      .slice(0, 8);
    if (slots.length > 0) {
      out.typicalOutingSlots = slots as OutingPreferencesV1["typicalOutingSlots"];
    }
  }

  if (Array.isArray(input.typicalCompanies)) {
    const companies = input.typicalCompanies
      .filter((c): c is string => typeof c === "string" && ALLOWED_COMPANY.has(c))
      .slice(0, 8);
    if (companies.length > 0) {
      out.typicalCompanies =
        companies as OutingPreferencesV1["typicalCompanies"];
    }
  } else if (
    typeof input.typicalCompany === "string" &&
    ALLOWED_COMPANY.has(input.typicalCompany)
  ) {
    out.typicalCompanies = [
      input.typicalCompany as NonNullable<
        OutingPreferencesV1["typicalCompanies"]
      >[number],
    ];
  }

  if (Array.isArray(input.placePriorities)) {
    const priorities = input.placePriorities
      .filter(
        (p): p is string => typeof p === "string" && ALLOWED_PRIORITIES.has(p),
      )
      .slice(0, 12);
    if (priorities.length > 0) {
      out.placePriorities =
        priorities as OutingPreferencesV1["placePriorities"];
    }
  }

  return out as unknown as Prisma.JsonObject;
}

/** Boost liviano para `explore/context` según intent + preferencias. */
export function scoreOutingAgainstIntent(
  intent: ExploreIntent,
  prefs: Prisma.JsonValue | null | undefined,
): number {
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) {
    return 0;
  }

  const p = prefs as Partial<OutingPreferencesV1>;
  let bonus = 0;
  const slots = new Set(p.typicalOutingSlots ?? []);
  const companies = new Set<string>(
    p.typicalCompanies?.length
      ? p.typicalCompanies
      : p.typicalCompany
        ? [p.typicalCompany]
        : [],
  );

  if (intent === "solo" && companies.has("solo")) {
    bonus += 10;
  }
  if (
    intent === "group_4" &&
    (companies.has("small_group") || companies.has("large_group"))
  ) {
    bonus += 12;
  }
  if (
    intent === "first_date" &&
    (companies.has("couple") || companies.has("solo"))
  ) {
    bonus += 8;
  }
  if (intent === "work_2h" && slots.has("weekday_morning")) {
    bonus += 8;
  }
  if (
    (intent === "brunch_long" || intent === "reading") &&
    (slots.has("weekend_day") || slots.has("weekday_morning"))
  ) {
    bonus += 6;
  }
  if (intent === "snack_fast" && slots.has("weekday_afternoon")) {
    bonus += 6;
  }
  if (intent === "open_now" && slots.has("weekend_night")) {
    bonus += 4;
  }

  return bonus;
}
