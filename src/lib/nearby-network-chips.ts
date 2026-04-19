import type { VisitWouldReturn } from "@prisma/client";

export type NearbyVisitChipSource = {
  rating: number;
  wouldReturn: VisitWouldReturn | null;
  displayName: string;
};

export function formatNearbyVisitChip(visit: NearbyVisitChipSource): string {
  const name = visit.displayName.trim() || "Alguien";

  if (visit.wouldReturn === "yes") {
    return `${name} volvería a ir`;
  }

  if (visit.wouldReturn === "maybe") {
    if (visit.rating >= 4) {
      return `A ${name} le gustó`;
    }
    return `A ${name} le gustaría volver`;
  }

  if (visit.wouldReturn === "no") {
    return `Visitado por ${name}`;
  }

  if (visit.rating >= 4) {
    return `A ${name} le gustó`;
  }

  return `Visitado por ${name}`;
}

export function scoreNearbyVisitSignal(visit: NearbyVisitChipSource): number {
  let score = visit.rating * 5;
  if (visit.wouldReturn === "yes") {
    score += 120;
  } else if (visit.wouldReturn === "maybe") {
    score += 55;
  } else if (visit.wouldReturn === "no") {
    score -= 10;
  }
  return score;
}
