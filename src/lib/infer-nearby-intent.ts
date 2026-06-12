import type { Prisma } from "@prisma/client";

import type { ExploreIntent } from "../places/explore-context";
import type { OutingPreferencesV1 } from "./outing-preferences";

/** Intent de explore inferido para rankear nearby según hora y preferencias de salida. */
export function inferNearbyExploreIntent(
  prefs: Prisma.JsonValue | null | undefined,
  now = new Date(),
): ExploreIntent {
  const hour = now.getHours();
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;

  if (prefs && typeof prefs === "object" && !Array.isArray(prefs)) {
    const p = prefs as Partial<OutingPreferencesV1>;
    const slots = new Set(p.typicalOutingSlots ?? []);
    const companies = new Set(
      p.typicalCompanies?.length
        ? p.typicalCompanies
        : p.typicalCompany
          ? [p.typicalCompany]
          : [],
    );

    if (hour >= 7 && hour < 11) {
      if (slots.has("weekday_morning")) {
        return "work_2h";
      }
      if (companies.has("solo")) {
        return "reading";
      }
    }

    if (isWeekend && hour >= 10 && hour < 16 && slots.has("weekend_day")) {
      return "brunch_long";
    }

    if (!isWeekend && hour >= 12 && hour < 15 && slots.has("weekday_afternoon")) {
      return "snack_fast";
    }

    if (hour >= 18 && hour < 23) {
      if (slots.has("weekend_night") || slots.has("weekday_evening")) {
        return companies.has("couple") ? "first_date" : "group_4";
      }
    }

    if (companies.has("solo")) {
      return "solo";
    }
    if (companies.has("couple")) {
      return "first_date";
    }
    if (companies.has("small_group") || companies.has("large_group")) {
      return "group_4";
    }
  }

  if (hour >= 7 && hour < 11) {
    return "work_2h";
  }
  if (hour >= 11 && hour < 15) {
    return "solo";
  }
  if (hour >= 18 && hour < 23) {
    return "group_4";
  }
  return "solo";
}
