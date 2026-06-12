export const GOOGLE_DATA_PORTABILITY_SAVED_COLLECTIONS_SCOPE =
  "https://www.googleapis.com/auth/dataportability.saved.collections";

export const GOOGLE_DATA_PORTABILITY_MY_ACTIVITY_MAPS_SCOPE =
  "https://www.googleapis.com/auth/dataportability.myactivity.maps";

export const GOOGLE_DATA_PORTABILITY_MVP_SCOPES = [
  GOOGLE_DATA_PORTABILITY_SAVED_COLLECTIONS_SCOPE,
  GOOGLE_DATA_PORTABILITY_MY_ACTIVITY_MAPS_SCOPE,
] as const;

export const GOOGLE_DATA_PORTABILITY_MVP_RESOURCES = [
  "saved.collections",
  "myactivity.maps",
] as const;

export const GOOGLE_DATA_PORTABILITY_IMPORT_REASON =
  "google_data_portability";
