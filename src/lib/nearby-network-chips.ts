import type { VisitWouldReturn } from "@prisma/client";

/** Fila estructurada para carrusel editorial (cliente: `friendSocialRows`). */
export type NearbyFriendSocialRow = {
  username: string;
  avatarUrl?: string | null;
  snippet: string;
};

export type NearbyVisitChipSource = {
  rating: number;
  wouldReturn: VisitWouldReturn | null;
  /** Conservado por compatibilidad; el texto del chip usa `username`. */
  displayName: string;
  username: string;
};

/** Texto corto junto al @usuario (sin nombre completo). */
export function formatFriendSnippetFromVisit(
  visit: Pick<NearbyVisitChipSource, "rating" | "wouldReturn">,
): string {
  if (visit.wouldReturn === "yes") {
    return "volvería a ir";
  }
  if (visit.wouldReturn === "maybe") {
    if (visit.rating >= 4) {
      return "le gustó";
    }
    return "podría volver";
  }
  if (visit.wouldReturn === "no") {
    return "pasó por acá";
  }
  if (visit.rating >= 4) {
    return "le gustó";
  }
  return "visitó el lugar";
}

export function formatFriendSnippetFromSave(): string {
  return "quiere ir";
}

export function formatNearbySocialChipLine(username: string, snippet: string): string {
  const u = username.replace(/^@/, "").trim() || "user";
  const s = snippet.trim();
  return s ? `@${u} ${s}` : `@${u}`;
}

/** Chip legible en formato `@usuario snippet` para el cliente. */
export function formatNearbyVisitChip(visit: NearbyVisitChipSource): string {
  return formatNearbySocialChipLine(
    visit.username,
    formatFriendSnippetFromVisit(visit),
  );
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
