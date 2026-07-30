/**
 * Texto corto para chips de apertura en listados (nearby / home).
 */
export function buildNearbyOpeningChip(
  openNow: boolean | undefined,
): string | undefined {
  if (openNow === true) {
    return "Abierto ahora";
  }

  if (openNow === false) {
    return "Cerrado ahora";
  }

  return undefined;
}
