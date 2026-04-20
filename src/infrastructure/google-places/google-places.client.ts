import { Injectable, Logger } from "@nestjs/common";

import { AppConfigService } from "../../config/app-config.service";
import type { NearbyFriendSocialRow } from "../../lib/nearby-network-chips";

const GOOGLE_BASE_URL = "https://places.googleapis.com/v1";
const GOOGLE_GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const DEFAULT_NEARBY_TYPES = ["cafe", "restaurant"] as const;

/** Places API (New): maxResultCount / pageSize deben estar entre 1 y 20. */
const GOOGLE_PLACES_MAX_RESULTS = 20;

export type GooglePlacesMethod =
  | "autocomplete"
  | "autocompleteCities"
  | "searchText"
  | "nearbySearch"
  | "getPlaceDetails"
  | "getPlaceDetailView"
  | "getCityByPlaceId"
  | "reverseGeocodeCity";

export type GoogleTraceContext = {
  origin?: string;
  key?: string;
  cache?: "hit" | "miss" | "miss_joined" | "skip";
  singleFlight?: "leader" | "joined";
};

function clampGooglePlacesResultCount(limit: number): number {
  const n = Number.isFinite(limit) ? Math.floor(limit) : 1;
  return Math.min(GOOGLE_PLACES_MAX_RESULTS, Math.max(1, n));
}

type GoogleTextValue = {
  text?: string;
};

type GoogleOpeningHours = {
  openNow?: boolean;
  weekdayDescriptions?: string[];
};

type GoogleReview = {
  authorAttribution?: {
    displayName?: string;
  };
  rating?: number;
  relativePublishTimeDescription?: string;
  text?: GoogleTextValue;
};

type GooglePlace = {
  id?: string;
  displayName?: GoogleTextValue;
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  primaryType?: string;
  photos?: Array<{
    name?: string;
  }>;
  currentOpeningHours?: GoogleOpeningHours;
  regularOpeningHours?: GoogleOpeningHours;
  editorialSummary?: GoogleTextValue;
  reviews?: GoogleReview[];
  websiteUri?: string;
  nationalPhoneNumber?: string;
  googleMapsUri?: string;
};

type GoogleAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: GoogleTextValue;
      structuredFormat?: {
        mainText?: GoogleTextValue;
        secondaryText?: GoogleTextValue;
      };
      distanceMeters?: number;
    };
  }>;
};

type GooglePlacesSearchResponse = {
  places?: GooglePlace[];
};

type GoogleGeocodeAddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

type GoogleGeocodeResult = {
  place_id?: string;
  formatted_address?: string;
  types?: string[];
  address_components?: GoogleGeocodeAddressComponent[];
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
};

type GoogleGeocodeResponse = {
  error_message?: string;
  results?: GoogleGeocodeResult[];
  status?: string;
};

export type GooglePlaceSummary = {
  googlePlaceId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating?: number;
  userRatingCount?: number;
  types: string[];
  primaryType?: string;
  photoUrl?: string;
  openNow?: boolean;
  /** Solo uso interno antes de armar `openingChip` en la API. No exponer al cliente. */
  openingWeekdayLines?: string[];
};

export type { NearbyFriendSocialRow };

/** Respuesta pública de listados cercanos (sin líneas crudas de Google). */
export type NearbyPlaceView = Omit<GooglePlaceSummary, "openingWeekdayLines"> & {
  openingChip?: string;
  /** Líneas `@usuario snippet` (compat + parseo en cliente). */
  socialChips?: string[];
  /** Preferido por el cliente para avatar + @handle sin parsear texto. */
  friendSocialRows?: NearbyFriendSocialRow[];
};

export type FecaPlaceReview = {
  id: string;
  userDisplayName: string;
  rating: number;
  note: string;
  visitedAt: string;
  relativeTime?: string;
};

export type GooglePlaceDetailView = GooglePlaceSummary & {
  editorialSummary?: string;
  openingHours?: string[];
  photos: string[];
  reviews?: Array<{
    authorName: string;
    rating: number;
    relativeTime: string;
    text: string;
  }>;
  fecaReviews?: FecaPlaceReview[];
};

export type GoogleCitySummary = {
  city: string;
  cityGooglePlaceId: string;
  displayName: string;
  lat?: number;
  lng?: number;
};

type AutocompleteParams = {
  query: string;
  lat?: number;
  lng?: number;
  sessionToken?: string;
  limit?: number;
};

type CityAutocompleteParams = AutocompleteParams;

type SearchTextParams = {
  lat: number;
  lng: number;
  limit: number;
  query: string;
  type?: "cafe" | "restaurant";
};

type NearbyParams = {
  lat: number;
  lng: number;
  limit: number;
  radius: number;
  type?: "cafe" | "restaurant";
};

@Injectable()
export class GooglePlacesClient {
  private readonly logger = new Logger(GooglePlacesClient.name);

  constructor(private readonly config: AppConfigService) {}

  get isEnabled() {
    return Boolean(this.config.googleMapsApiKey);
  }

  async autocomplete(params: AutocompleteParams, trace?: GoogleTraceContext) {
    this.assertEnabled();

    const body: Record<string, unknown> = {
      input: params.query,
      includedPrimaryTypes: ["cafe", "restaurant"],
      includeQueryPredictions: false,
      languageCode: this.config.googlePlacesLanguage,
      regionCode: this.config.googlePlacesCountry,
      includedRegionCodes: [this.config.googlePlacesCountry],
    };

    if (params.sessionToken) {
      body.sessionToken = params.sessionToken;
    }

    if (typeof params.lat === "number" && typeof params.lng === "number") {
      body.locationBias = {
        circle: {
          center: {
            latitude: params.lat,
            longitude: params.lng,
          },
          radius: this.config.googlePlacesRadiusMeters,
        },
      };
      body.origin = {
        latitude: params.lat,
        longitude: params.lng,
      };
    }

    const response = await this.fetchJson<GoogleAutocompleteResponse>(
      `${GOOGLE_BASE_URL}/places:autocomplete`,
      {
        method: "POST",
        headers: this.createHeaders(
          [
            "suggestions.placePrediction.placeId",
            "suggestions.placePrediction.text.text",
            "suggestions.placePrediction.structuredFormat.mainText.text",
            "suggestions.placePrediction.structuredFormat.secondaryText.text",
            "suggestions.placePrediction.distanceMeters",
          ].join(","),
        ),
        body: JSON.stringify(body),
      },
      {
        method: "autocomplete",
        trace,
      },
    );

    return (response.suggestions ?? [])
      .map((suggestion) => suggestion.placePrediction)
      .filter((prediction): prediction is NonNullable<typeof prediction> =>
        Boolean(prediction?.placeId),
      )
      .slice(0, params.limit ?? 5)
      .map((prediction) => ({
        sourcePlaceId: prediction.placeId!,
        name:
          extractText(prediction.structuredFormat?.mainText) ??
          extractText(prediction.text) ??
          "Lugar sin nombre",
        address:
          extractText(prediction.structuredFormat?.secondaryText) ??
          extractText(prediction.text) ??
          "",
        distanceMeters: prediction.distanceMeters,
      }));
  }

  async autocompleteCities(
    params: CityAutocompleteParams,
    trace?: GoogleTraceContext,
  ): Promise<GoogleCitySummary[]> {
    this.assertEnabled();

    const body: Record<string, unknown> = {
      input: params.query,
      includedPrimaryTypes: ["(cities)"],
      includeQueryPredictions: false,
      languageCode: this.config.googlePlacesLanguage,
    };

    if (params.sessionToken) {
      body.sessionToken = params.sessionToken;
    }

    if (typeof params.lat === "number" && typeof params.lng === "number") {
      body.locationBias = {
        circle: {
          center: {
            latitude: params.lat,
            longitude: params.lng,
          },
          radius: this.config.googlePlacesRadiusMeters,
        },
      };
      body.origin = {
        latitude: params.lat,
        longitude: params.lng,
      };
    }

    const response = await this.fetchJson<GoogleAutocompleteResponse>(
      `${GOOGLE_BASE_URL}/places:autocomplete`,
      {
        method: "POST",
        headers: this.createHeaders(
          [
            "suggestions.placePrediction.placeId",
            "suggestions.placePrediction.text.text",
            "suggestions.placePrediction.structuredFormat.mainText.text",
            "suggestions.placePrediction.structuredFormat.secondaryText.text",
          ].join(","),
        ),
        body: JSON.stringify(body),
      },
      {
        method: "autocompleteCities",
        trace,
      },
    );

    const deduped = new Map<string, GoogleCitySummary>();

    for (const prediction of (response.suggestions ?? [])
      .map((suggestion) => suggestion.placePrediction)
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry?.placeId))
      .slice(0, params.limit ?? 5)) {
      const mainText =
        extractText(prediction.structuredFormat?.mainText) ??
        extractText(prediction.text) ??
        "Ciudad";
      const secondaryText =
        extractText(prediction.structuredFormat?.secondaryText) ?? "";
      const city: GoogleCitySummary = {
        city: mainText,
        cityGooglePlaceId: prediction.placeId!,
        displayName: secondaryText ? `${mainText}, ${secondaryText}` : mainText,
      };

      if (deduped.has(city.cityGooglePlaceId)) {
        continue;
      }

      deduped.set(city.cityGooglePlaceId, city);
    }

    return Array.from(deduped.values());
  }

  async searchText(
    params: SearchTextParams,
    trace?: GoogleTraceContext,
  ): Promise<GooglePlaceSummary[]> {
    this.assertEnabled();

    const pageSize = clampGooglePlacesResultCount(params.limit);

    const body: Record<string, unknown> = {
      textQuery: params.query,
      pageSize,
      languageCode: this.config.googlePlacesLanguage,
      regionCode: this.config.googlePlacesCountry,
      locationBias: {
        circle: {
          center: {
            latitude: params.lat,
            longitude: params.lng,
          },
          radius: this.config.googlePlacesRadiusMeters,
        },
      },
    };

    if (params.type) {
      body.includedType = params.type;
      body.strictTypeFiltering = true;
    }

    const response = await this.fetchJson<GooglePlacesSearchResponse>(
      `${GOOGLE_BASE_URL}/places:searchText`,
      {
        method: "POST",
        headers: this.createHeaders(
          [
            "places.id",
            "places.displayName",
            "places.formattedAddress",
            "places.location",
            "places.rating",
            "places.userRatingCount",
            "places.types",
            "places.primaryType",
            "places.photos",
            "places.currentOpeningHours",
            "places.regularOpeningHours",
          ].join(","),
        ),
        body: JSON.stringify(body),
      },
      {
        method: "searchText",
        trace,
      },
    );

    return (response.places ?? []).map((place) => this.mapPlaceSummary(place));
  }

  async nearbySearch(
    params: NearbyParams,
    trace?: GoogleTraceContext,
  ): Promise<GooglePlaceSummary[]> {
    this.assertEnabled();

    const includedTypes = params.type ? [params.type] : [...DEFAULT_NEARBY_TYPES];
    const maxResultCount = clampGooglePlacesResultCount(params.limit);

    const response = await this.fetchJson<GooglePlacesSearchResponse>(
      `${GOOGLE_BASE_URL}/places:searchNearby`,
      {
        method: "POST",
        headers: this.createHeaders(
          [
            "places.id",
            "places.displayName",
            "places.formattedAddress",
            "places.location",
            "places.rating",
            "places.userRatingCount",
            "places.types",
            "places.primaryType",
            "places.photos",
            "places.currentOpeningHours",
            "places.regularOpeningHours",
          ].join(","),
        ),
        body: JSON.stringify({
          includedTypes,
          languageCode: this.config.googlePlacesLanguage,
          maxResultCount,
          rankPreference: "DISTANCE",
          locationRestriction: {
            circle: {
              center: {
                latitude: params.lat,
                longitude: params.lng,
              },
              radius: params.radius,
            },
          },
        }),
      },
      {
        method: "nearbySearch",
        trace,
      },
    );

    return (response.places ?? []).map((place) => this.mapPlaceSummary(place));
  }

  async getPlaceDetails(
    placeId: string,
    options?: {
      sessionToken?: string;
      trace?: GoogleTraceContext;
    },
  ) {
    this.assertEnabled();

    const url = new URL(`${GOOGLE_BASE_URL}/places/${placeId}`);
    if (options?.sessionToken) {
      url.searchParams.set("sessionToken", options.sessionToken);
    }

    const place = await this.fetchJson<GooglePlace>(
      url.toString(),
      {
        headers: this.createHeaders(
          [
            "id",
            "displayName",
            "formattedAddress",
            "location",
            "types",
            "primaryType",
            "rating",
            "userRatingCount",
            "websiteUri",
            "nationalPhoneNumber",
            "googleMapsUri",
            "currentOpeningHours",
            "regularOpeningHours",
            "photos",
          ].join(","),
        ),
      },
      {
        method: "getPlaceDetails",
        trace: options?.trace,
      },
    );

    const coverPhotoRef = place.photos?.[0]?.name;

    return {
      sourcePlaceId: place.id ?? placeId,
      name: extractText(place.displayName) ?? "Lugar sin nombre",
      address: place.formattedAddress ?? "",
      city: this.extractCityFromAddress(place.formattedAddress),
      lat: place.location?.latitude,
      lng: place.location?.longitude,
      categories: place.types ?? [],
      ratingExternal: place.rating,
      ratingCountExternal: place.userRatingCount,
      phone: place.nationalPhoneNumber,
      website: place.websiteUri,
      openingHours:
        place.regularOpeningHours?.weekdayDescriptions ??
        place.currentOpeningHours?.weekdayDescriptions,
      googleMapsUri: place.googleMapsUri,
      coverPhotoRef,
      coverPhotoUrl: coverPhotoRef
        ? this.buildPhotoUrl(coverPhotoRef, 400)
        : undefined,
      lastSyncedAt: new Date().toISOString(),
    };
  }

  async getCityByPlaceId(
    placeId: string,
    trace?: GoogleTraceContext,
  ): Promise<GoogleCitySummary> {
    this.assertEnabled();

    const url = new URL(GOOGLE_GEOCODING_URL);
    url.searchParams.set("place_id", placeId);
    url.searchParams.set("language", this.config.googlePlacesLanguage);
    url.searchParams.set("key", this.config.googleMapsApiKey!);

    const response = await this.fetchGeocodeJson(url.toString(), {
      method: "getCityByPlaceId",
      trace,
    });
    const result = pickBestCityGeocodeResult(response.results ?? []);
    const city = result ? this.mapGeocodeResultToCity(result) : null;

    if (!city) {
      throw new Error("City place ID did not resolve to a canonical city");
    }

    return city;
  }

  async reverseGeocodeCity(
    lat: number,
    lng: number,
    trace?: GoogleTraceContext,
  ): Promise<GoogleCitySummary | null> {
    this.assertEnabled();

    const url = new URL(GOOGLE_GEOCODING_URL);
    url.searchParams.set("latlng", `${lat},${lng}`);
    url.searchParams.set("language", this.config.googlePlacesLanguage);
    url.searchParams.set("key", this.config.googleMapsApiKey!);

    const response = await this.fetchGeocodeJson(url.toString(), {
      method: "reverseGeocodeCity",
      trace,
    });
    const result = pickBestCityGeocodeResult(response.results ?? []);

    return result ? this.mapGeocodeResultToCity(result) : null;
  }

  async getPlaceDetailView(
    placeId: string,
    trace?: GoogleTraceContext,
  ): Promise<GooglePlaceDetailView> {
    this.assertEnabled();

    const place = await this.fetchJson<GooglePlace>(
      `${GOOGLE_BASE_URL}/places/${placeId}`,
      {
        headers: this.createHeaders(
          [
            "id",
            "displayName",
            "formattedAddress",
            "location",
            "rating",
            "userRatingCount",
            "types",
            "primaryType",
            "photos",
            "currentOpeningHours",
            "regularOpeningHours",
            "editorialSummary",
            "reviews",
          ].join(","),
        ),
      },
      {
        method: "getPlaceDetailView",
        trace,
      },
    );

    const summary = this.mapPlaceSummary(place, placeId);
    const photos = (place.photos ?? [])
      .map((photo) => photo.name)
      .filter((photoName): photoName is string => Boolean(photoName))
      .map((photoName) => this.buildPhotoUrl(photoName, 800));
    const reviews = (place.reviews ?? [])
      .map((review) => ({
        authorName: review.authorAttribution?.displayName ?? "",
        rating: review.rating ?? 0,
        relativeTime: review.relativePublishTimeDescription ?? "",
        text: extractText(review.text) ?? "",
      }))
      .filter((review) => Boolean(review.authorName) && review.rating > 0);

    return {
      ...summary,
      editorialSummary: extractText(place.editorialSummary) ?? undefined,
      openingHours:
        place.regularOpeningHours?.weekdayDescriptions ??
        place.currentOpeningHours?.weekdayDescriptions,
      photos,
      reviews: reviews.length > 0 ? reviews : undefined,
    };
  }

  private mapPlaceSummary(
    place: GooglePlace,
    fallbackPlaceId?: string,
  ): GooglePlaceSummary {
    return {
      googlePlaceId: place.id ?? fallbackPlaceId ?? "",
      name: extractText(place.displayName) ?? "Lugar sin nombre",
      address: place.formattedAddress ?? "",
      lat: place.location?.latitude ?? 0,
      lng: place.location?.longitude ?? 0,
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      types: place.types ?? [],
      primaryType: place.primaryType,
      photoUrl: place.photos?.[0]?.name
        ? this.buildPhotoUrl(place.photos[0].name, 400)
        : undefined,
      openNow:
        place.currentOpeningHours?.openNow ?? place.regularOpeningHours?.openNow,
      openingWeekdayLines:
        place.regularOpeningHours?.weekdayDescriptions ??
        place.currentOpeningHours?.weekdayDescriptions,
    };
  }

  private buildPhotoUrl(photoName: string, maxWidthPx: number) {
    const url = new URL(`${GOOGLE_BASE_URL}/${photoName}/media`);
    url.searchParams.set("maxWidthPx", String(maxWidthPx));
    url.searchParams.set("key", this.config.googleMapsApiKey!);
    return url.toString();
  }

  traceCacheEvent(input: {
    method: GooglePlacesMethod;
    trace?: GoogleTraceContext;
    durationMs?: number;
    status?: "ok" | "error";
    message?: string;
  }) {
    this.logger.log(
      JSON.stringify({
        tag: "google_places",
        method: input.method,
        origin: normalizeTraceText(input.trace?.origin),
        cache: normalizeTraceText(input.trace?.cache),
        key: normalizeTraceText(input.trace?.key),
        singleFlight: normalizeTraceText(input.trace?.singleFlight),
        durationMs: input.durationMs ?? 0,
        status: input.status ?? "ok",
        ...(input.message ? { message: input.message } : {}),
      }),
    );
  }

  private async fetchJson<T>(
    input: string,
    init?: RequestInit,
    meta?: { method: GooglePlacesMethod; trace?: GoogleTraceContext },
  ) {
    const startedAt = Date.now();
    const response = await fetch(input, init);

    if (!response.ok) {
      const text = await response.text();
      this.traceCacheEvent({
        method: meta?.method ?? "getPlaceDetails",
        trace: meta?.trace,
        durationMs: Date.now() - startedAt,
        status: "error",
        message: `HTTP ${response.status}`,
      });
      throw new Error(`Google Places request failed: ${response.status} ${text}`);
    }

    this.traceCacheEvent({
      method: meta?.method ?? "getPlaceDetails",
      trace: meta?.trace,
      durationMs: Date.now() - startedAt,
    });
    return (await response.json()) as T;
  }

  private async fetchGeocodeJson(
    input: string,
    meta?: { method: GooglePlacesMethod; trace?: GoogleTraceContext },
  ) {
    const startedAt = Date.now();
    const response = await fetch(input);

    if (!response.ok) {
      const text = await response.text();
      this.traceCacheEvent({
        method: meta?.method ?? "reverseGeocodeCity",
        trace: meta?.trace,
        durationMs: Date.now() - startedAt,
        status: "error",
        message: `HTTP ${response.status}`,
      });
      throw new Error(`Google geocoding request failed: ${response.status} ${text}`);
    }

    const payload = (await response.json()) as GoogleGeocodeResponse;

    if (payload.status && payload.status !== "OK" && payload.status !== "ZERO_RESULTS") {
      this.traceCacheEvent({
        method: meta?.method ?? "reverseGeocodeCity",
        trace: meta?.trace,
        durationMs: Date.now() - startedAt,
        status: "error",
        message: payload.status,
      });
      throw new Error(
        `Google geocoding request failed: ${payload.status} ${payload.error_message ?? ""}`.trim(),
      );
    }

    this.traceCacheEvent({
      method: meta?.method ?? "reverseGeocodeCity",
      trace: meta?.trace,
      durationMs: Date.now() - startedAt,
    });
    return payload;
  }

  private createHeaders(fieldMask: string) {
    return {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": this.config.googleMapsApiKey!,
      "X-Goog-FieldMask": fieldMask,
    };
  }

  private assertEnabled() {
    if (!this.isEnabled) {
      throw new Error("GOOGLE_MAPS_API_KEY is not configured");
    }
  }

  private mapGeocodeResultToCity(
    result: GoogleGeocodeResult,
  ): GoogleCitySummary | null {
    const city = extractCityName(result.address_components, result.formatted_address);
    const lat = result.geometry?.location?.lat;
    const lng = result.geometry?.location?.lng;

    if (!result.place_id || !city || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    const resolvedLat = lat as number;
    const resolvedLng = lng as number;

    return {
      city,
      cityGooglePlaceId: result.place_id,
      displayName: result.formatted_address ?? city,
      lat: resolvedLat,
      lng: resolvedLng,
    };
  }

  private extractCityFromAddress(address?: string) {
    if (!address) {
      return "";
    }

    const chunks = address.split(",").map((item) => item.trim()).filter(Boolean);
    return chunks.length >= 2 ? chunks[chunks.length - 2] : chunks[0] ?? "";
  }
}

function normalizeTraceText(value?: string) {
  return value?.trim() || undefined;
}

function extractText(value?: GoogleTextValue) {
  return value?.text;
}

function pickBestCityGeocodeResult(results: GoogleGeocodeResult[]) {
  const typePriority = [
    "locality",
    "postal_town",
    "administrative_area_level_3",
    "administrative_area_level_2",
    "administrative_area_level_1",
  ];

  for (const type of typePriority) {
    const match = results.find((result) => result.types?.includes(type));
    if (match) {
      return match;
    }
  }

  return results.find((result) =>
    Boolean(extractCityName(result.address_components, result.formatted_address)),
  );
}

function extractCityName(
  components?: GoogleGeocodeAddressComponent[],
  formattedAddress?: string,
) {
  const typePriority = [
    "locality",
    "postal_town",
    "administrative_area_level_3",
    "administrative_area_level_2",
    "administrative_area_level_1",
  ];

  for (const type of typePriority) {
    const match = components?.find((component) => component.types?.includes(type));
    if (match?.long_name) {
      return match.long_name;
    }
  }

  if (!formattedAddress) {
    return undefined;
  }

  return formattedAddress.split(",")[0]?.trim() || undefined;
}
