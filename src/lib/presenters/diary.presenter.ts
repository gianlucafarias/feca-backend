import type { DiaryWithRelations } from "./presenter.types";
import { serializePlaceSummary } from "./place.presenter";
import { serializeUserPublic } from "./user.presenter";

export function serializeDiary(diary: DiaryWithRelations) {
  const orderedPlaces = [...diary.places].sort((a, b) => {
    if (a.position !== b.position) {
      return a.position - b.position;
    }

    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return {
    createdAt: diary.createdAt.toISOString(),
    createdBy: serializeUserPublic(diary.createdBy),
    coverImageUrl: diary.coverImageUrl ?? undefined,
    description: diary.description ?? undefined,
    editorialReason: diary.editorialReason ?? undefined,
    id: diary.id,
    intro: diary.intro ?? undefined,
    name: diary.name,
    orderedPlaces: orderedPlaces.map((entry) => ({
      note: entry.note ?? undefined,
      place: serializePlaceSummary(entry.place),
      position: entry.position,
    })),
    places: orderedPlaces.map((entry) => serializePlaceSummary(entry.place)),
    publishedAt: diary.publishedAt?.toISOString(),
    visibility: diary.visibility,
  };
}
