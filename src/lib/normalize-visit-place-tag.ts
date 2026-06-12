const MAX_TAG_LENGTH = 32;

export function normalizeVisitPlaceTag(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return null;
  }

  const capped = trimmed.slice(0, MAX_TAG_LENGTH);
  return capped.charAt(0).toUpperCase() + capped.slice(1);
}

export function normalizeVisitPlaceTags(raw: string[] | undefined): string[] {
  if (!raw?.length) {
    return [];
  }

  const seen = new Set<string>();
  const next: string[] = [];

  for (const item of raw) {
    const normalized = normalizeVisitPlaceTag(item);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(normalized);
    if (next.length >= 20) {
      break;
    }
  }

  return next;
}

export function mergeVisitPlaceTags(
  userTags: string[],
  placeTags: string[],
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const tag of [...placeTags, ...userTags]) {
    const key = tag.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(tag);
  }

  return merged.slice(0, 40);
}
