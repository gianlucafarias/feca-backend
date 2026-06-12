import type { GooglePlaceSummary } from "../infrastructure/google-places/google-places.client";
import type { ExploreIntent } from "../places/explore-context";

/** Puntaje base por intent explícito (explore / nearby con `intent` en query). */
export function scoreExploreIntent(
  intent: ExploreIntent,
  place: GooglePlaceSummary,
  distanceMeters: number,
) {
  let score = 100 - distanceMeters / 60 + (place.rating ?? 0) * 8;

  const types = new Set(place.types);
  const isCafe = types.has("cafe") || place.primaryType === "cafe";
  const isRestaurant =
    types.has("restaurant") || place.primaryType === "restaurant";

  switch (intent) {
    case "open_now":
      score += place.openNow ? 18 : 0;
      break;
    case "work_2h":
      score += isCafe ? 18 : 4;
      break;
    case "brunch_long":
      score += isRestaurant ? 18 : 8;
      break;
    case "solo":
      score += isCafe ? 14 : 6;
      break;
    case "first_date":
      score += (place.rating ?? 0) >= 4.3 ? 16 : 6;
      break;
    case "snack_fast":
      score += distanceMeters < 1200 ? 18 : 4;
      break;
    case "reading":
      score += isCafe ? 16 : 4;
      break;
    case "group_4":
      score += isRestaurant ? 14 : 8;
      break;
  }

  return score;
}

export function exploreReasonLine(
  intent: ExploreIntent,
  place: GooglePlaceSummary,
) {
  switch (intent) {
    case "open_now":
      return place.openNow ? "Abierto ahora" : "Cerca para salir ya";
    case "work_2h":
      return "Cafe y foco para trabajar un rato";
    case "brunch_long":
      return "Para brunch sin apuro";
    case "solo":
      return "Comodo para ir solo";
    case "first_date":
      return "Buen tono para una primera cita";
    case "snack_fast":
      return "Sirve para una pausa rapida";
    case "reading":
      return "Tranqui para leer";
    case "group_4":
      return "Mejor para ir en grupo";
  }
}
