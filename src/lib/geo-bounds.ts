import { distanceInMeters } from "./geo";

/** Metros por grado de latitud (aprox. constante en la Tierra). */
const METERS_PER_DEGREE_LAT = 111_320;

export type GeoBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

export type GeoCoordinate = {
  lat: number;
  lng: number;
};

/**
 * Bounding box axis-aligned para pre-filtrar en SQL antes del haversine exacto en JS.
 * Sobreestima ligeramente el radio en latitudes altas — el filtro final corrige.
 */
export function geoBoundsFromRadiusMeters(
  lat: number,
  lng: number,
  radiusMeters: number,
): GeoBounds {
  const latDelta = radiusMeters / METERS_PER_DEGREE_LAT;
  const latRadians = (lat * Math.PI) / 180;
  const lngDelta =
    radiusMeters /
    (METERS_PER_DEGREE_LAT * Math.max(Math.cos(latRadians), 1e-6));

  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

/** Cláusulas Prisma para lat/lng dentro del bounding box (requiere coords no nulas). */
export function placeBoundingBoxWhere(bounds: GeoBounds) {
  return {
    lat: { gte: bounds.minLat, lte: bounds.maxLat },
    lng: { gte: bounds.minLng, lte: bounds.maxLng },
  };
}

export function filterSortByDistance<T extends GeoCoordinate>(
  originLat: number,
  originLng: number,
  items: T[],
  radiusMeters: number,
  limit: number,
): Array<T & { distanceMeters: number }> {
  return items
    .map((item) => ({
      ...item,
      distanceMeters: distanceInMeters(
        originLat,
        originLng,
        item.lat,
        item.lng,
      ),
    }))
    .filter((item) => item.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
}

/** Límite de filas a traer tras el pre-filtro SQL (proporcional al límite final). */
export function nearbySqlTakeLimit(resultLimit: number, cap = 150) {
  return Math.min(Math.max(resultLimit * 8, 24), cap);
}
