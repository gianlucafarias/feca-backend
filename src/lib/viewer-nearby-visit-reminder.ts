/**
 * Radar / carruseles: lugares que el usuario ya visitó y reseñó en FECA.
 *
 * - Si marcó "volvería a ir" (`wouldReturn === yes`): ocultar del radar unos días
 *   y luego volver a mostrar con chip tipo "Lo visitaste hace un mes".
 * - Si no (maybe / no / sin respuesta): no volver a mostrar en el radar.
 */

/** Días mínimos tras la visita antes de que vuelva a aparecer (quiet period). */
export const VIEWER_RETURN_REMINDER_COOLDOWN_DAYS = 7;

function wholeDaysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  if (!Number.isFinite(ms) || ms < 0) {
    return 0;
  }
  return Math.floor(ms / 86_400_000);
}

/** Chip en primera persona para recordar la última visita con intención de volver. */
export function formatViewerReturnReminderChip(
  visitedAt: Date,
  now: Date = new Date(),
): string {
  const d = wholeDaysBetween(visitedAt, now);

  if (d < 10) {
    return "Lo visitaste hace una semana";
  }
  if (d < 17) {
    return "Lo visitaste hace 2 semanas";
  }
  if (d < 24) {
    return "Lo visitaste hace 3 semanas";
  }
  if (d < 45) {
    return "Lo visitaste hace un mes";
  }
  if (d < 75) {
    return "Lo visitaste hace 2 meses";
  }
  const months = Math.floor(d / 30);
  if (months >= 3 && months <= 12) {
    return `Lo visitaste hace ${months} meses`;
  }
  if (months > 12) {
    return "Lo visitaste hace más de un año";
  }
  return "Lo visitaste hace un tiempo";
}

export type ViewerRadarPlaceState =
  | { kind: "neutral" }
  | { kind: "exclude_from_radar" }
  | { kind: "remind"; chip: string };

export function viewerRadarStateFromVisit(input: {
  visitedAt: Date;
  wouldReturn: "yes" | "maybe" | "no" | null;
  /** Reseña escrita (FECA); sin texto no aplicamos reglas de "radar" del usuario. */
  hasWrittenReview: boolean;
  now?: Date;
}): ViewerRadarPlaceState {
  if (!input.hasWrittenReview) {
    return { kind: "neutral" };
  }

  const now = input.now ?? new Date();

  if (input.wouldReturn !== "yes") {
    return { kind: "exclude_from_radar" };
  }

  const days = wholeDaysBetween(input.visitedAt, now);
  if (days < VIEWER_RETURN_REMINDER_COOLDOWN_DAYS) {
    return { kind: "exclude_from_radar" };
  }

  return {
    kind: "remind",
    chip: formatViewerReturnReminderChip(input.visitedAt, now),
  };
}
