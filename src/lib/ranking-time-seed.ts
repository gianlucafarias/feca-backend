/**
 * Identificador de “semana UTC” (bloques de 7 días desde el 1 ene UTC)
 * para que el ranking de lugares cercanos rote con el calendario sin depender del cliente.
 */
export function utcWeekBucketId(now: Date): string {
  const y = now.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const day = Math.floor((now.getTime() - start) / 86_400_000);
  const bucket = Math.floor(day / 7);
  return `${y}w${bucket}`;
}

/**
 * Cambia cada hora UTC — mezcla seeds de ranking/jitter sin depender de pull-to-refresh.
 */
export function utcHourBucketId(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const mo = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  return `${y}-${mo}-${d}h${h}`;
}
