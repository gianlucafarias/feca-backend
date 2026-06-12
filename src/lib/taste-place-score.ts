import type { ExploreIntent } from "../places/explore-context";

const TASTE_IDS = new Set([
  "small_bar",
  "specialty_over_brunch",
  "reading_spots",
  "wifi_outlets",
  "terrace",
  "indoor_table",
  "quiet",
  "bright_light",
]);

/** Suma puntos si los chips del usuario encajan con categorías / intent de exploración. */
export function scoreTasteAgainstPlace(
  tasteIds: string[],
  categories: string[],
  intent: ExploreIntent,
): number {
  if (tasteIds.length === 0) {
    return 0;
  }

  const cats = categories.map((c) => c.toLowerCase());
  const has = (...needles: string[]) =>
    needles.some((needle) => cats.some((c) => c.includes(needle)));

  let score = 0;

  for (const id of tasteIds) {
    if (!TASTE_IDS.has(id)) {
      continue;
    }

    switch (id) {
      case "reading_spots":
        if (
          intent === "reading" ||
          has("cafe", "coffee", "library", "book_store", "bookshop")
        ) {
          score += 10;
        }
        break;
      case "wifi_outlets":
        if (intent === "work_2h" || has("cafe", "coffee", "coworking")) {
          score += 8;
        }
        break;
      case "quiet":
        if (
          intent === "reading" ||
          intent === "first_date" ||
          has("cafe", "coffee", "library", "tea")
        ) {
          score += 6;
        }
        break;
      case "specialty_over_brunch":
        if (
          intent === "brunch_long" ||
          has("cafe", "coffee", "bakery", "breakfast", "brunch")
        ) {
          score += 9;
        }
        break;
      case "terrace":
        if (intent === "group_4" || has("restaurant", "bar", "pub", "beer")) {
          score += 4;
        }
        break;
      case "indoor_table":
        if (intent === "first_date" || has("restaurant", "wine", "bistro")) {
          score += 4;
        }
        break;
      case "small_bar":
        if (has("bar", "pub", "wine_bar", "cocktail")) {
          score += 8;
        }
        break;
      case "bright_light":
        if (
          intent === "brunch_long" ||
          intent === "reading" ||
          has("cafe", "coffee", "bakery")
        ) {
          score += 3;
        }
        break;
      default:
        break;
    }
  }

  return score;
}

/** Señal implícita: categorías de lugares guardados/importados vs candidato. */
export function scoreCategoryAffinityAgainstPlace(
  preferredCategories: string[],
  categories: string[],
): number {
  if (preferredCategories.length === 0 || categories.length === 0) {
    return 0;
  }

  const candidateCategories = categories.map(normalizeCategory).filter(Boolean);
  const preferred = Array.from(new Set(preferredCategories.map(normalizeCategory)))
    .filter(Boolean)
    .slice(0, 16);

  let score = 0;

  for (const preferredCategory of preferred) {
    const matched = candidateCategories.some(
      (category) =>
        category === preferredCategory ||
        category.includes(preferredCategory) ||
        preferredCategory.includes(category),
    );

    if (matched) {
      score += 7;
    }
  }

  return Math.min(score, 34);
}

function normalizeCategory(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ");
}

/** Ajuste por chips vs tags de una visita (feed cercano / ahora). */
export function scoreTasteAgainstVisitTags(
  tasteIds: string[],
  visitTags: string[],
): number {
  if (tasteIds.length === 0 || visitTags.length === 0) {
    return 0;
  }

  const tags = new Set(visitTags.map((t) => t.toLowerCase()));
  let score = 0;

  for (const id of tasteIds) {
    if (!TASTE_IDS.has(id)) {
      continue;
    }

    if (id === "reading_spots" && (tags.has("reading") || tags.has("cafe"))) {
      score += 10;
    }
    if (id === "wifi_outlets" && tags.has("work")) {
      score += 8;
    }
    if (id === "specialty_over_brunch" && (tags.has("brunch") || tags.has("cafe"))) {
      score += 9;
    }
    if (id === "quiet" && tags.has("quiet")) {
      score += 8;
    }
  }

  return score;
}
