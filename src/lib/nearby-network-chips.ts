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
  /** Conservado por compatibilidad; el chip usa `username`. */
  displayName: string;
  username: string;
  /** Fecha de la visita (para “visitó recientemente”). */
  visitedAt?: Date | string | null;
};

const MS_PER_DAY = 86_400_000;

function isWithinDays(
  visitedAt: Date | string | null | undefined,
  days: number,
): boolean {
  if (visitedAt == null) {
    return false;
  }
  const d = typeof visitedAt === "string" ? new Date(visitedAt) : visitedAt;
  if (Number.isNaN(d.getTime())) {
    return false;
  }
  return Date.now() - d.getTime() <= days * MS_PER_DAY;
}

/** Texto corto junto al @usuario (sin nombre completo). */
export function formatFriendSnippetFromVisit(
  visit: Pick<NearbyVisitChipSource, "rating" | "wouldReturn" | "visitedAt">,
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
  if (isWithinDays(visit.visitedAt ?? null, 21)) {
    return "visitó recientemente";
  }
  if (visit.rating >= 4) {
    return "le gustó";
  }
  return "visitó el lugar";
}

export function formatFriendSnippetFromSave(
  createdAt?: Date | string | null,
): string {
  if (isWithinDays(createdAt ?? null, 5)) {
    return "lo guardó hace poco";
  }
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
  /** Las visitas reales deben ganar a un simple guardado (score ~26) en el mix. */
  score += 40;
  if (isWithinDays(visit.visitedAt ?? null, 14)) {
    score += 12;
  }
  return score;
}
