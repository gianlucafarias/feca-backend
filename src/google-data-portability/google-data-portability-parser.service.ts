import { createHash } from "node:crypto";

import { Injectable } from "@nestjs/common";

import type { GoogleSavedCollectionItemDto } from "./dto/ingest-saved-collections.dto";

export type ParsedGoogleSavedPlace = {
  sourceKey: string;
  title?: string;
  url?: string;
  googlePlaceId?: string;
  rawPayload: Record<string, unknown>;
};

@Injectable()
export class GoogleDataPortabilityParserService {
  parseSavedCollectionItem(
    item: GoogleSavedCollectionItemDto,
  ): ParsedGoogleSavedPlace {
    const rawPayload = item.rawPayload ?? { ...item };
    const title = firstNonEmptyString(item.title, item.name);
    const url = firstNonEmptyString(item.url, item.placeUrl, findMapsUrl(rawPayload));
    const googlePlaceId = firstNonEmptyString(
      item.googlePlaceId,
      url ? extractGooglePlaceIdFromUrl(url) : undefined,
      findGooglePlaceId(rawPayload),
    );
    const sourceKey =
      item.sourceKey ??
      googlePlaceId ??
      stableKey([title, url, JSON.stringify(rawPayload)]);

    return {
      sourceKey,
      title,
      url,
      googlePlaceId,
      rawPayload,
    };
  }

  parseSavedCollectionArchiveDocuments(
    documents: Array<{ source: string; payload: unknown }>,
  ): GoogleSavedCollectionItemDto[] {
    const items: GoogleSavedCollectionItemDto[] = [];
    const seen = new Set<string>();

    for (const document of documents) {
      const sourceLooksRelevant = looksLikeSavedCollectionsSource(
        document.source,
      );
      const candidates = collectCandidateObjects(document.payload);

      candidates.forEach((candidate, index) => {
        const url = findMapsUrl(candidate);
        const googlePlaceId = findGooglePlaceId(candidate);

        if (!sourceLooksRelevant && !url && !googlePlaceId) {
          return;
        }

        const title = firstNonEmptyString(
          findStringByKey(candidate, ["title", "name", "placeName"]),
          findString(candidate, (value) => value.trim().length > 0),
        );
        const sourceKey =
          googlePlaceId ??
          url ??
          stableKey([document.source, String(index), JSON.stringify(candidate)]);

        if (seen.has(sourceKey)) {
          return;
        }
        seen.add(sourceKey);

        items.push({
          sourceKey,
          title,
          url,
          googlePlaceId,
          rawPayload: candidate,
        });
      });
    }

    return items;
  }
}

function firstNonEmptyString(
  ...values: Array<string | undefined>
): string | undefined {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function stableKey(values: Array<string | undefined>) {
  const hash = createHash("sha256");
  for (const value of values) {
    hash.update(value ?? "");
    hash.update("\n");
  }
  return hash.digest("hex").slice(0, 32);
}

function extractGooglePlaceIdFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const queryPlaceId =
      parsed.searchParams.get("query_place_id") ??
      parsed.searchParams.get("place_id");

    if (queryPlaceId) {
      return decodeGoogleValue(queryPlaceId);
    }
  } catch {
    // Some Google export URLs are partial or escaped; regex fallback handles those.
  }

  const directMatch = url.match(/(?:query_place_id|place_id)=([^&#]+)/i);
  if (directMatch?.[1]) {
    return decodeGoogleValue(directMatch[1]);
  }

  const dataMatch = url.match(/!1s([^!&#]+)/i);
  if (dataMatch?.[1] && looksLikeGooglePlaceId(dataMatch[1])) {
    return decodeGoogleValue(dataMatch[1]);
  }

  return undefined;
}

function decodeGoogleValue(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function looksLikeGooglePlaceId(value: string) {
  return /^ChI[A-Za-z0-9_-]{12,}$/.test(decodeGoogleValue(value));
}

function findMapsUrl(raw: Record<string, unknown>): string | undefined {
  return findString(raw, (value) => {
    const normalized = value.toLowerCase();
    return normalized.includes("google.") && normalized.includes("/maps");
  });
}

function findGooglePlaceId(raw: Record<string, unknown>): string | undefined {
  return findString(raw, looksLikeGooglePlaceId);
}

function looksLikeSavedCollectionsSource(source: string) {
  const normalized = source.toLowerCase();
  return normalized.includes("saved") || normalized.includes("collection");
}

function collectCandidateObjects(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectCandidateObjects(item));
  }

  if (!isRecord(value)) {
    return [];
  }

  const nested = Object.values(value).flatMap((item) =>
    collectCandidateObjects(item),
  );
  const isCandidate =
    Boolean(findMapsUrl(value)) ||
    Boolean(findGooglePlaceId(value)) ||
    hasAnyKey(value, ["title", "name", "placeName", "url", "placeUrl"]);

  return isCandidate ? [value, ...nested] : nested;
}

function findStringByKey(
  raw: Record<string, unknown>,
  keys: string[],
): string | undefined {
  const normalizedKeys = new Set(keys.map((key) => key.toLowerCase()));

  for (const [key, value] of Object.entries(raw)) {
    if (
      normalizedKeys.has(key.toLowerCase()) &&
      typeof value === "string" &&
      value.trim().length > 0
    ) {
      return value;
    }
  }

  for (const value of Object.values(raw)) {
    if (isRecord(value)) {
      const found = findStringByKey(value, keys);
      if (found) {
        return found;
      }
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (isRecord(item)) {
          const found = findStringByKey(item, keys);
          if (found) {
            return found;
          }
        }
      }
    }
  }

  return undefined;
}

function hasAnyKey(raw: Record<string, unknown>, keys: string[]) {
  const normalizedKeys = new Set(keys.map((key) => key.toLowerCase()));
  return Object.keys(raw).some((key) => normalizedKeys.has(key.toLowerCase()));
}

function findString(
  value: unknown,
  predicate: (value: string) => boolean,
): string | undefined {
  if (typeof value === "string") {
    return predicate(value) ? value : undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findString(item, predicate);
      if (found) {
        return found;
      }
    }
  }

  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      const found = findString(item, predicate);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
