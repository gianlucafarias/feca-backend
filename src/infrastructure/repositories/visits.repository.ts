import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../database/prisma.service";
import { mapVisitRecord } from "./prisma-mappers";

type CreateVisitInput = {
  placeId: string;
  userId: string;
  rating: number;
  note: string;
  tags: string[];
  visitedAt: string;
};

@Injectable()
export class VisitsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createVisit(input: CreateVisitInput) {
    const visit = await this.prisma.visit.create({
      data: {
        placeId: input.placeId,
        userId: input.userId,
        rating: input.rating,
        note: input.note,
        tags: input.tags,
        visitedAt: new Date(input.visitedAt),
      },
    });

    return mapVisitRecord(visit);
  }

  async listVisitsByPlace(placeId: string, limit = 20) {
    const visits = await this.prisma.visit.findMany({
      where: { placeId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return visits.map(mapVisitRecord);
  }
}
