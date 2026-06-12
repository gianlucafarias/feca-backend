export type FecaPlaceQualityStats = {
  visitCount: number;
  avgRating: number | null;
  wouldReturnYesCount: number;
  wouldReturnNoCount: number;
};

/** Ajuste de ranking según visitas FECA agregadas (neutro si no hay datos). */
export function scoreFecaPlaceQuality(
  stats: FecaPlaceQualityStats | undefined,
): number {
  if (!stats || stats.visitCount === 0) {
    return 0;
  }

  if (
    stats.avgRating != null &&
    stats.avgRating >= 4.5 &&
    stats.visitCount >= 3
  ) {
    return 15 + Math.min(10, stats.visitCount - 3);
  }

  if (stats.avgRating != null && stats.avgRating < 3) {
    return -20;
  }

  if (
    stats.wouldReturnNoCount >= 2 &&
    stats.wouldReturnNoCount > stats.wouldReturnYesCount
  ) {
    return -20;
  }

  if (stats.avgRating != null && stats.avgRating >= 4 && stats.visitCount >= 2) {
    return 8;
  }

  return 0;
}

export function shouldExcludeByFecaQuality(
  stats: FecaPlaceQualityStats | undefined,
): boolean {
  if (!stats || stats.visitCount < 2) {
    return false;
  }

  if (stats.avgRating != null && stats.avgRating < 2.5) {
    return true;
  }

  return (
    stats.wouldReturnNoCount >= 3 &&
    stats.wouldReturnNoCount > stats.wouldReturnYesCount * 2
  );
}
