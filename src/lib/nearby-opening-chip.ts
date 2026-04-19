/**
 * Texto corto para chips de apertura en listados (nearby / home).
 */
export function buildNearbyOpeningChip(
  openNow: boolean | undefined,
  weekdayLines: string[] | undefined,
  now = new Date(),
  locale = "es-UY",
): string | undefined {
  if (openNow === true) {
    return "Abierto ahora";
  }

  const line = pickTodayWeekdayLine(weekdayLines, now, locale);
  if (!line) {
    return undefined;
  }

  const lowered = line.toLowerCase();
  if (lowered.includes("cerrado") || lowered.includes("closed")) {
    return "Cerrado hoy";
  }

  const afterColon = line.includes(":") ? line.split(":").slice(1).join(":").trim() : line.trim();
  if (!afterColon) {
    return undefined;
  }

  const firstWindow = afterColon.split(/\s*[–—-]\s/u)[0]?.trim();
  if (!firstWindow || /cerrado/i.test(firstWindow)) {
    return undefined;
  }

  if (openNow === false || openNow === undefined) {
    return `Abre a las ${firstWindow}`;
  }

  return undefined;
}

function pickTodayWeekdayLine(
  weekdayLines: string[] | undefined,
  now: Date,
  locale: string,
): string | undefined {
  const lines = weekdayLines?.filter((l) => l && l.trim()) ?? [];
  if (lines.length === 0) {
    return undefined;
  }

  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(now);
  const wd = weekday.toLowerCase();
  const hit = lines.find((l) => l.toLowerCase().startsWith(wd));
  if (hit) {
    return hit;
  }

  if (lines.length === 7) {
    const mondayFirstIndex = (now.getDay() + 6) % 7;
    return lines[mondayFirstIndex];
  }

  return lines[0];
}
