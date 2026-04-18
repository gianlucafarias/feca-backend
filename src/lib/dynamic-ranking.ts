import { createHash } from "node:crypto";

type RankedCandidate<T> = {
  baseScore: number;
  id: string;
  item: T;
};

type DynamicRankingOptions = {
  bucketHours?: number;
  jitterRatio?: number;
  maxJitter?: number;
  now?: Date;
  seed: string;
  topWindow?: number;
};

export function rankCandidatesWithRotation<T>(
  candidates: RankedCandidate<T>[],
  options: DynamicRankingOptions,
) {
  if (candidates.length <= 1) {
    return candidates.map((candidate) => ({
      ...candidate,
      score: candidate.baseScore,
    }));
  }

  const sorted = [...candidates].sort(
    (a, b) => b.baseScore - a.baseScore || a.id.localeCompare(b.id),
  );
  const topWindow = Math.max(
    1,
    Math.min(sorted.length, options.topWindow ?? Math.max(18, sorted.length)),
  );
  const bucket = buildTimeBucket(options.now ?? new Date(), options.bucketHours ?? 2);

  const rotatedTop = sorted
    .slice(0, topWindow)
    .map((candidate) => ({
      ...candidate,
      score:
        candidate.baseScore +
        computeStableJitter(
          `${options.seed}:${bucket}:${candidate.id}`,
          resolveJitterSpan(candidate.baseScore, options),
        ),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.baseScore - a.baseScore ||
        a.id.localeCompare(b.id),
    );

  return [
    ...rotatedTop,
    ...sorted.slice(topWindow).map((candidate) => ({
      ...candidate,
      score: candidate.baseScore,
    })),
  ];
}

function resolveJitterSpan(
  baseScore: number,
  options: Pick<DynamicRankingOptions, "jitterRatio" | "maxJitter">,
) {
  const ratio = options.jitterRatio ?? 0.08;
  const maxJitter = options.maxJitter ?? 14;

  return Math.min(maxJitter, Math.max(4, Math.abs(baseScore) * ratio));
}

function computeStableJitter(seed: string, span: number) {
  if (span <= 0) {
    return 0;
  }

  return (stableUnitInterval(seed) * 2 - 1) * span;
}

function stableUnitInterval(seed: string) {
  const hash = createHash("sha256").update(seed).digest("hex").slice(0, 8);
  const value = Number.parseInt(hash, 16);

  return value / 0xffffffff;
}

function buildTimeBucket(now: Date, bucketHours: number) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const bucket = Math.floor(now.getUTCHours() / Math.max(1, bucketHours));

  return `${year}-${month}-${day}:${bucket}`;
}
