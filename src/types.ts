export type PlaceSource = "google" | "manual";

export type CityRecord = {
  id: string;
  googlePlaceId: string;
  name: string;
  displayName: string;
  lat?: number;
  lng?: number;
  createdAt: string;
  updatedAt: string;
};

export type PlaceRecord = {
  id: string;
  source: PlaceSource;
  sourcePlaceId?: string;
  name: string;
  address: string;
  city: string;
  cityId?: string;
  lat?: number;
  lng?: number;
  categories: string[];
  ratingExternal?: number;
  ratingCountExternal?: number;
  phone?: string;
  website?: string;
  openingHours?: string[];
  googleMapsUri?: string;
  coverPhotoRef?: string;
  coverPhotoUrl?: string;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type VisitRecord = {
  id: string;
  placeId: string;
  userId: string;
  rating: number;
  note: string;
  tags: string[];
  visitedAt: string;
  createdAt: string;
};

export type AutocompleteItem = {
  id: string;
  source: PlaceSource;
  sourcePlaceId?: string;
  placeId?: string;
  name: string;
  address: string;
  city: string;
  lat?: number;
  lng?: number;
  categories: string[];
  coverPhotoUrl?: string;
  ratingExternal?: number;
  ratingCountExternal?: number;
  distanceMeters?: number;
  alreadyInFeca: boolean;
};
