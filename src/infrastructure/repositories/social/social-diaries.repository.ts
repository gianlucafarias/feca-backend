import { Injectable } from "@nestjs/common";
import { ContentVisibility, GuideVisibility, Prisma } from "@prisma/client";

import { PrismaService } from "../../../database/prisma.service";
import { diaryInclude, type PaginationInput } from "./social.repository.types";

@Injectable()
export class SocialDiariesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listDiariesByUser(userId: string) {
    return this.prisma.diary.findMany({
      where: { createdById: userId },
      include: diaryInclude,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    });
  }

  async createDiary(input: {
    coverImageUrl?: string;
    createdById: string;
    description?: string;
    editorialReason?: string;
    intro?: string;
    name: string;
    publishedAt?: string;
    visibility?: "private" | "unlisted" | "public";
  }) {
    return this.prisma.diary.create({
      data: {
        coverImageUrl: input.coverImageUrl ?? null,
        createdById: input.createdById,
        description: input.description ?? null,
        editorialReason: input.editorialReason ?? null,
        intro: input.intro ?? null,
        name: input.name,
        publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
        visibility: input.visibility ?? GuideVisibility.private,
      },
      include: diaryInclude,
    });
  }

  async listHomeEditorGuides(viewerId: string, limit: number) {
    const diaries = await this.prisma.diary.findMany({
      where: {
        createdBy: { isEditor: true },
        publishedAt: { not: null },
        visibility: GuideVisibility.public,
        AND: [buildDiaryOwnerVisibilityWhere(viewerId)],
      },
      include: diaryInclude,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    });

    return { diaries, total: diaries.length };
  }

  async patchDiary(diaryId: string, data: Prisma.DiaryUpdateInput) {
    return this.prisma.diary.update({
      where: { id: diaryId },
      data,
      include: diaryInclude,
    });
  }

  async searchPublicDiaries(
    input: PaginationInput & { q: string; viewerId: string },
  ) {
    const normalizedQuery = input.q.trim();
    const where: Prisma.DiaryWhereInput = {
      visibility: GuideVisibility.public,
      AND: [buildDiaryOwnerVisibilityWhere(input.viewerId)],
      OR: [
        { name: { contains: normalizedQuery, mode: "insensitive" } },
        { description: { contains: normalizedQuery, mode: "insensitive" } },
        { intro: { contains: normalizedQuery, mode: "insensitive" } },
      ],
    };

    const [diaries, total] = await Promise.all([
      this.prisma.diary.findMany({
        where,
        include: diaryInclude,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      }),
      this.prisma.diary.count({ where }),
    ]);

    return { diaries, total };
  }

  async findDiaryById(diaryId: string) {
    return this.prisma.diary.findUnique({
      where: { id: diaryId },
      include: diaryInclude,
    });
  }

  async addPlaceToDiary(
    diaryId: string,
    placeId: string,
    input?: { note?: string; position?: number },
  ) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.diaryPlace.findUnique({
        where: {
          diaryId_placeId: {
            diaryId,
            placeId,
          },
        },
      });

      const nextPosition =
        input?.position ??
        existing?.position ??
        (((await tx.diaryPlace.aggregate({
          where: { diaryId },
          _max: { position: true },
        }))._max.position ?? -1) + 1);

      await tx.diaryPlace.upsert({
        where: {
          diaryId_placeId: {
            diaryId,
            placeId,
          },
        },
        update: {
          note: input?.note ?? existing?.note ?? null,
          position: nextPosition,
        },
        create: {
          diaryId,
          note: input?.note ?? null,
          placeId,
          position: nextPosition,
        },
      });
    });

    return this.findDiaryById(diaryId);
  }
}

function buildDiaryOwnerVisibilityWhere(
  viewerId: string,
): Prisma.DiaryWhereInput {
  return {
    OR: [
      { createdById: viewerId },
      {
        createdBy: {
          settings: { is: null },
        },
      },
      {
        createdBy: {
          settings: {
            is: { diaryVisibility: ContentVisibility.public },
          },
        },
      },
      {
        createdBy: {
          followers: {
            some: { followerId: viewerId },
          },
          settings: {
            is: { diaryVisibility: ContentVisibility.followers },
          },
        },
      },
    ],
  };
}
