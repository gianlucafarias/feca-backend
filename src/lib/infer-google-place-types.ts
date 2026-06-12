import type { Prisma } from "@prisma/client";

import type { ExploreIntent } from "../places/explore-context";
import { parsePlacePriorities } from "./nearby-place-score";

export type GoogleNearbyPlaceType = "cafe" | "restaurant" | "bar" | "bakery";

export type NearbyGooglePoolProfile =
  | "default"
  | "cafe_focus"
  | "dining_focus"
  | "bar_focus";

const PROFILE_TYPES: Record<NearbyGooglePoolProfile, GoogleNearbyPlaceType[]> = {
  default: ["cafe", "restaurant"],
  cafe_focus: ["cafe", "bakery"],
  dining_focus: ["restaurant", "cafe"],
  bar_focus: ["bar", "restaurant"],
};

export function resolveNearbyGooglePoolProfile(input: {
  tastePreferenceIds: string[];
  outingPreferences: Prisma.JsonValue | null | undefined;
  inferredIntent: ExploreIntent;
  explicitIntent?: ExploreIntent;
}): NearbyGooglePoolProfile {
  const intent = input.explicitIntent ?? input.inferredIntent;
  const tastes = new Set(input.tastePreferenceIds);
  const priorities = parsePlacePriorities(input.outingPreferences) ?? [];
  const top3 = priorities.slice(0, 3);

  if (tastes.has("small_bar")) {
    return "bar_focus";
  }

  if (
    tastes.has("wifi_outlets") ||
    tastes.has("reading_spots") ||
    tastes.has("specialty_over_brunch") ||
    tastes.has("quiet") ||
    tastes.has("bright_light") ||
    intent === "work_2h" ||
    intent === "reading" ||
    intent === "snack_fast"
  ) {
    return "cafe_focus";
  }

  if (
    top3.includes("food_drink") ||
    intent === "group_4" ||
    intent === "first_date" ||
    intent === "brunch_long"
  ) {
    return "dining_focus";
  }

  return "default";
}

export function resolveGoogleTypesForNearbyPool(input: {
  explicitType?: "cafe" | "restaurant";
  profile: NearbyGooglePoolProfile;
}): GoogleNearbyPlaceType[] {
  if (input.explicitType) {
    return [input.explicitType];
  }
  return PROFILE_TYPES[input.profile];
}
