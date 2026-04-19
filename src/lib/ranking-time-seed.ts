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
