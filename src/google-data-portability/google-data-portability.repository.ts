import { Injectable } from "@nestjs/common";
import {
  GoogleDataImportConsentType,
  GoogleDataImportItemConfidence,
  GoogleDataImportItemKind,
  GoogleDataImportItemStatus,
  GoogleDataImportStatus,
  Prisma,
} from "@prisma/client";

import { PrismaService } from "../database/prisma.service";

export type CreateImportInput = {
  userId: string;
  requestedScopes: string[];
  consentType: GoogleDataImportConsentType;
};

export type UpsertImportItemInput = {
  importId: string;
  resourceGroup: string;
  sourceKey: string;
  rawTitle?: string;
  rawUrl?: string;
  rawPayload: Prisma.InputJsonValue;
  mappedPlaceId?: string;
  kind: GoogleDataImportItemKind;
  confidence: GoogleDataImportItemConfidence;
  status: GoogleDataImportItemStatus;
};

@Injectable()
export class GoogleDataPortabilityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createImport(input: CreateImportInput) {
    return this.prisma.googleDataImport.create({
      data: {
        userId: input.userId,
        status: GoogleDataImportStatus.authorizing,
        requestedScopes: input.requestedScopes,
        consentType: input.consentType,
      },
    });
  }

  async getImportForUser(userId: string, importId: string) {
    return this.prisma.googleDataImport.findFirst({
      where: {
        id: importId,
        userId,
      },
      include: {
        _count: {
          select: {
            items: true,
          },
        },
      },
    });
  }

  async getImportById(importId: string) {
    return this.prisma.googleDataImport.findUnique({
      where: { id: importId },
    });
  }

  async deleteImportForUser(userId: string, importId: string) {
    return this.prisma.googleDataImport.deleteMany({
      where: {
        id: importId,
        userId,
      },
    });
  }

  async markProcessing(importId: string) {
    return this.prisma.googleDataImport.update({
      where: { id: importId },
      data: {
        status: GoogleDataImportStatus.processing,
        lastError: null,
      },
    });
  }

  async markFetching(
    importId: string,
    input: {
      archiveJobId: string;
      oauthAccessTokenEncrypted: string;
      oauthRefreshTokenEncrypted?: string;
      tokenExpiresAt?: Date;
    },
  ) {
    return this.prisma.googleDataImport.update({
      where: { id: importId },
      data: {
        status: GoogleDataImportStatus.fetching,
        archiveJobId: input.archiveJobId,
        oauthAccessTokenEncrypted: input.oauthAccessTokenEncrypted,
        oauthRefreshTokenEncrypted: input.oauthRefreshTokenEncrypted ?? null,
        tokenExpiresAt: input.tokenExpiresAt ?? null,
        lastError: null,
      },
    });
  }

  async updateOAuthTokens(
    importId: string,
    input: {
      oauthAccessTokenEncrypted: string;
      oauthRefreshTokenEncrypted?: string;
      tokenExpiresAt?: Date;
    },
  ) {
    return this.prisma.googleDataImport.update({
      where: { id: importId },
      data: {
        oauthAccessTokenEncrypted: input.oauthAccessTokenEncrypted,
        ...(input.oauthRefreshTokenEncrypted
          ? { oauthRefreshTokenEncrypted: input.oauthRefreshTokenEncrypted }
          : {}),
        tokenExpiresAt: input.tokenExpiresAt ?? null,
      },
    });
  }

  async updateArchiveState(
    importId: string,
    input: { archiveState: string; archiveUrls?: string[] },
  ) {
    return this.prisma.googleDataImport.update({
      where: { id: importId },
      data: {
        archiveState: input.archiveState,
        archiveUrls: input.archiveUrls ?? Prisma.JsonNull,
        status:
          input.archiveState === "FAILED"
            ? GoogleDataImportStatus.failed
            : GoogleDataImportStatus.fetching,
        lastError:
          input.archiveState === "FAILED" ? "Google archive job failed" : null,
      },
    });
  }

  async markComplete(importId: string) {
    return this.prisma.googleDataImport.update({
      where: { id: importId },
      data: {
        status: GoogleDataImportStatus.complete,
        completedAt: new Date(),
        lastError: null,
      },
    });
  }

  async markFailed(importId: string, error: string) {
    return this.prisma.googleDataImport.update({
      where: { id: importId },
      data: {
        status: GoogleDataImportStatus.failed,
        lastError: error,
      },
    });
  }

  async markRevoked(importId: string) {
    return this.prisma.googleDataImport.update({
      where: { id: importId },
      data: {
        status: GoogleDataImportStatus.revoked,
      },
    });
  }

  async upsertItem(input: UpsertImportItemInput) {
    const data = {
      rawTitle: input.rawTitle ?? null,
      rawUrl: input.rawUrl ?? null,
      rawPayload: input.rawPayload,
      mappedPlaceId: input.mappedPlaceId ?? null,
      kind: input.kind,
      confidence: input.confidence,
      status: input.status,
    };

    return this.prisma.googleDataImportItem.upsert({
      where: {
        importId_resourceGroup_sourceKey: {
          importId: input.importId,
          resourceGroup: input.resourceGroup,
          sourceKey: input.sourceKey,
        },
      },
      update: data,
      create: {
        importId: input.importId,
        resourceGroup: input.resourceGroup,
        sourceKey: input.sourceKey,
        ...data,
      },
    });
  }

  async countItems(importId: string) {
    const rows = await this.prisma.googleDataImportItem.groupBy({
      by: ["kind", "status"],
      where: { importId },
      _count: true,
    });

    return rows;
  }

  async listSavedCollectionItems(importId: string) {
    return this.prisma.googleDataImportItem.findMany({
      where: {
        importId,
        resourceGroup: "saved.collections",
      },
      orderBy: [{ createdAt: "asc" }],
    });
  }
}
