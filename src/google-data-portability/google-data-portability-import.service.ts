import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  GoogleDataImportConsentType,
  GoogleDataImportItemConfidence,
  GoogleDataImportItemKind,
  GoogleDataImportItemStatus,
  Prisma,
} from "@prisma/client";

import { PlacesService } from "../places/places.service";
import { PlacesRepository } from "../infrastructure/repositories/places.repository";
import { SocialRepository } from "../infrastructure/repositories/social.repository";
import { QueueService } from "../infrastructure/queue/queue.service";
import {
  QUEUE_JOBS,
  type GoogleImportIngestJobPayload,
  type GoogleImportJobPayload,
} from "../infrastructure/queue/queue.types";
import type { GoogleSavedCollectionItemDto } from "./dto/ingest-saved-collections.dto";
import {
  GOOGLE_DATA_PORTABILITY_IMPORT_REASON,
  GOOGLE_DATA_PORTABILITY_MVP_SCOPES,
} from "./google-data-portability.constants";
import { GoogleDataPortabilityArchiveParserService } from "./google-data-portability-archive-parser.service";
import { GoogleDataPortabilityArchiveService } from "./google-data-portability-archive.service";
import { GoogleDataPortabilityAuthService } from "./google-data-portability-auth.service";
import { GoogleDataPortabilityParserService } from "./google-data-portability-parser.service";
import { GoogleDataPortabilityRepository } from "./google-data-portability.repository";
import { GoogleDataPortabilityTokenCryptoService } from "./google-data-portability-token-crypto.service";

const MAX_REMOTE_PLACE_RESOLVES_PER_IMPORT_RUN = 25;

@Injectable()
export class GoogleDataPortabilityImportService {
  private readonly logger = new Logger(GoogleDataPortabilityImportService.name);

  constructor(
    private readonly authService: GoogleDataPortabilityAuthService,
    private readonly archiveParser: GoogleDataPortabilityArchiveParserService,
    private readonly archiveService: GoogleDataPortabilityArchiveService,
    private readonly parser: GoogleDataPortabilityParserService,
    private readonly placesRepository: PlacesRepository,
    private readonly placesService: PlacesService,
    private readonly repository: GoogleDataPortabilityRepository,
    private readonly socialRepository: SocialRepository,
    private readonly tokenCrypto: GoogleDataPortabilityTokenCryptoService,
    private readonly queueService: QueueService,
  ) {}

  async createImport(
    userId: string,
    consentType: "one_time" | "time_based" = "one_time",
  ) {
    const importRow = await this.repository.createImport({
      userId,
      requestedScopes: [...GOOGLE_DATA_PORTABILITY_MVP_SCOPES],
      consentType: consentType as GoogleDataImportConsentType,
    });

    return {
      import: {
        ...this.serializeImport(importRow),
        authorizationUrl: this.authService.buildAuthorizationUrl({
          importId: importRow.id,
          scopes: GOOGLE_DATA_PORTABILITY_MVP_SCOPES,
        }),
      },
    };
  }

  async getImport(userId: string, importId: string) {
    const importRow = await this.repository.getImportForUser(userId, importId);
    if (!importRow) {
      throw new NotFoundException("Google data import not found");
    }

    const counts = await this.getCounts(importId);
    const learnedCategoryCount = await this.getLearnedCategoryCount(userId);

    return {
      import: {
        ...this.serializeImport(importRow),
        ...counts,
        learnedCategoryCount,
      },
    };
  }

  async handleOAuthCallback(input: {
    code?: string;
    state?: string;
    error?: string;
  }) {
    if (!input.state) {
      throw new BadRequestException("Missing OAuth state");
    }

    const importRow = await this.repository.getImportById(input.state);
    if (!importRow) {
      throw new NotFoundException("Google data import not found");
    }

    if (input.error) {
      const failed = await this.repository.markFailed(input.state, input.error);
      return {
        import: this.serializeImport(failed),
      };
    }

    if (!input.code) {
      await this.repository.markFailed(input.state, "Missing OAuth code");
      throw new BadRequestException("Missing OAuth code");
    }

    try {
      const token = await this.archiveService.exchangeCode(input.code);
      const archive = await this.archiveService.initiateArchive(token.accessToken);
      const updated = await this.repository.markFetching(input.state, {
        archiveJobId: archive.archiveJobId,
        oauthAccessTokenEncrypted: this.tokenCrypto.encrypt(token.accessToken),
        oauthRefreshTokenEncrypted: token.refreshToken
          ? this.tokenCrypto.encrypt(token.refreshToken)
          : undefined,
        tokenExpiresAt: token.expiresAt,
      });

      return {
        import: {
          ...this.serializeImport(updated),
          accessType: archive.accessType ?? null,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Google OAuth callback failed";
      await this.repository.markFailed(input.state, message);
      throw error;
    }
  }

  async deleteImport(userId: string, importId: string) {
    const importRow = await this.repository.getImportForUser(userId, importId);
    if (!importRow) {
      throw new NotFoundException("Google data import not found");
    }

    await this.repository.markRevoked(importId);
    await this.repository.deleteImportForUser(userId, importId);
  }

  async syncArchiveState(userId: string, importId: string) {
    const importRow = await this.ensureImportForUser(userId, importId);
    if (!importRow.archiveJobId) {
      throw new BadRequestException("Google archive job has not been initiated");
    }

    const accessToken = await this.resolveAccessToken(importRow);
    const state = await this.archiveService.getArchiveState(
      accessToken,
      importRow.archiveJobId,
    );
    const updated = await this.repository.updateArchiveState(importId, {
      archiveState: state.state,
      archiveUrls: state.urls,
    });

    return {
      import: this.serializeImport(updated),
    };
  }

  async enqueueProcessCompletedArchive(userId: string, importId: string) {
    await this.assertArchiveReadyForProcessing(userId, importId);
    await this.repository.markProcessing(importId);

    const jobId = await this.queueService.enqueue<GoogleImportJobPayload>(
      QUEUE_JOBS.GOOGLE_IMPORT_PROCESS_ARCHIVE,
      { userId, importId },
    );

    const snapshot = await this.getImport(userId, importId);

    return {
      jobId,
      ...snapshot,
    };
  }

  async executeProcessCompletedArchive(userId: string, importId: string) {
    const importRow = await this.ensureImportForUser(userId, importId);
    const archiveUrls = normalizeArchiveUrls(importRow.archiveUrls);

    if (archiveUrls.length === 0) {
      await this.repository.markFailed(importId, "Google archive did not include download URLs");
      return;
    }

    try {
      const documents =
        await this.archiveParser.downloadJsonDocuments(archiveUrls);
      const items =
        this.parser.parseSavedCollectionArchiveDocuments(documents);

      let remoteResolveCount = 0;
      for (const item of items) {
        remoteResolveCount += await this.processSavedCollectionItem(
          userId,
          importId,
          item,
          remoteResolveCount,
        );
      }

      await this.repository.markComplete(importId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Google archive processing failed";
      await this.repository.markFailed(importId, message);
      this.logger.error(`Google import ${importId} archive job failed: ${message}`);
    }
  }

  async enqueueIngestSavedCollections(
    userId: string,
    importId: string,
    items: GoogleSavedCollectionItemDto[],
  ) {
    if (items.length === 0) {
      throw new BadRequestException("At least one saved collection item is required");
    }

    await this.ensureImportForUser(userId, importId);
    await this.repository.markProcessing(importId);

    const jobId = await this.queueService.enqueue<GoogleImportIngestJobPayload>(
      QUEUE_JOBS.GOOGLE_IMPORT_INGEST_SAVED,
      {
        userId,
        importId,
        items: items.map((item) => ({
          sourceKey:
            item.sourceKey ?? item.url ?? item.googlePlaceId ?? item.title ?? "unknown",
          title: item.title ?? item.name,
          url: item.url ?? item.placeUrl,
          rawPayload: item.rawPayload,
        })),
      },
    );

    const snapshot = await this.getImport(userId, importId);

    return {
      jobId,
      ...snapshot,
    };
  }

  async executeIngestSavedCollections(payload: GoogleImportIngestJobPayload) {
    const { userId, importId, items } = payload;
    await this.ensureImportForUser(userId, importId);

    try {
      let remoteResolveCount = 0;
      for (const item of items) {
        remoteResolveCount += await this.processSavedCollectionItem(
          userId,
          importId,
          item,
          remoteResolveCount,
        );
      }

      await this.repository.markComplete(importId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown import error";
      await this.repository.markFailed(importId, message);
      this.logger.error(`Google import ${importId} ingest job failed: ${message}`);
    }
  }

  async enqueueRetry(userId: string, importId: string) {
    await this.ensureImportForUser(userId, importId);
    const items = await this.repository.listSavedCollectionItems(importId);

    if (items.length === 0) {
      throw new BadRequestException("No saved collection items to retry");
    }

    await this.repository.markProcessing(importId);

    const jobId = await this.queueService.enqueue<GoogleImportJobPayload>(
      QUEUE_JOBS.GOOGLE_IMPORT_RETRY,
      { userId, importId },
    );

    const snapshot = await this.getImport(userId, importId);

    return {
      jobId,
      ...snapshot,
    };
  }

  async executeRetry(userId: string, importId: string) {
    await this.ensureImportForUser(userId, importId);
    const items = await this.repository.listSavedCollectionItems(importId);

    if (items.length === 0) {
      await this.repository.markFailed(importId, "No saved collection items to retry");
      return;
    }

    try {
      let remoteResolveCount = 0;
      for (const item of items) {
        remoteResolveCount += await this.processSavedCollectionItem(
          userId,
          importId,
          {
            sourceKey: item.sourceKey,
            title: item.rawTitle ?? undefined,
            url: item.rawUrl ?? undefined,
            rawPayload: item.rawPayload as Record<string, unknown>,
          },
          remoteResolveCount,
        );
      }

      await this.repository.markComplete(importId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown retry error";
      await this.repository.markFailed(importId, message);
      this.logger.error(`Google import ${importId} retry job failed: ${message}`);
    }
  }

  private async assertArchiveReadyForProcessing(userId: string, importId: string) {
    let importRow = await this.ensureImportForUser(userId, importId);

    if (!hasArchiveUrls(importRow.archiveUrls) && importRow.archiveJobId) {
      await this.syncArchiveState(userId, importId);
      importRow = await this.ensureImportForUser(userId, importId);
    }

    const archiveUrls = normalizeArchiveUrls(importRow.archiveUrls);
    if (importRow.archiveState !== "COMPLETE" && archiveUrls.length === 0) {
      throw new BadRequestException("Google archive is not complete yet");
    }

    if (archiveUrls.length === 0) {
      throw new BadRequestException("Google archive did not include download URLs");
    }

    return importRow;
  }

  private async ensureImportForUser(userId: string, importId: string) {
    const importRow = await this.repository.getImportForUser(userId, importId);
    if (!importRow) {
      throw new NotFoundException("Google data import not found");
    }

    return importRow;
  }

  private async processSavedCollectionItem(
    userId: string,
    importId: string,
    item: GoogleSavedCollectionItemDto,
    remoteResolveCount: number,
  ) {
    const parsed = this.parser.parseSavedCollectionItem(item);

    if (!parsed.googlePlaceId) {
      await this.repository.upsertItem({
        importId,
        resourceGroup: "saved.collections",
        sourceKey: parsed.sourceKey,
        rawTitle: parsed.title,
        rawUrl: parsed.url,
        rawPayload: toPrismaJson(parsed.rawPayload),
        kind: GoogleDataImportItemKind.saved_place,
        confidence: GoogleDataImportItemConfidence.low,
        status: GoogleDataImportItemStatus.manual_review,
      });
      return 0;
    }

    try {
      let place = await this.placesRepository.getPlaceBySource(
        "google",
        normalizeGooglePlaceId(parsed.googlePlaceId),
      );
      let usedRemoteResolve = false;

      if (!place) {
        if (remoteResolveCount >= MAX_REMOTE_PLACE_RESOLVES_PER_IMPORT_RUN) {
          await this.repository.upsertItem({
            importId,
            resourceGroup: "saved.collections",
            sourceKey: parsed.sourceKey,
            rawTitle: parsed.title,
            rawUrl: parsed.url,
            rawPayload: toPrismaJson(parsed.rawPayload),
            kind: GoogleDataImportItemKind.saved_place,
            confidence: GoogleDataImportItemConfidence.high,
            status: GoogleDataImportItemStatus.manual_review,
          });
          return 0;
        }

        place = await this.placesService.resolve({
          source: "google",
          sourcePlaceId: parsed.googlePlaceId,
        });
        usedRemoteResolve = true;
      }

      await this.socialRepository.savePlace(
        userId,
        place.id,
        GOOGLE_DATA_PORTABILITY_IMPORT_REASON,
      );
      await this.repository.upsertItem({
        importId,
        resourceGroup: "saved.collections",
        sourceKey: parsed.sourceKey,
        rawTitle: parsed.title,
        rawUrl: parsed.url,
        rawPayload: toPrismaJson(parsed.rawPayload),
        mappedPlaceId: place.id,
        kind: GoogleDataImportItemKind.saved_place,
        confidence: GoogleDataImportItemConfidence.high,
        status: GoogleDataImportItemStatus.matched,
      });
      return usedRemoteResolve ? 1 : 0;
    } catch (error) {
      this.logger.warn(
        `Could not resolve imported Google place ${parsed.googlePlaceId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      await this.repository.upsertItem({
        importId,
        resourceGroup: "saved.collections",
        sourceKey: parsed.sourceKey,
        rawTitle: parsed.title,
        rawUrl: parsed.url,
        rawPayload: toPrismaJson(parsed.rawPayload),
        kind: GoogleDataImportItemKind.saved_place,
        confidence: GoogleDataImportItemConfidence.high,
        status: GoogleDataImportItemStatus.manual_review,
      });
      return 0;
    }
  }

  private async resolveAccessToken(importRow: {
    id: string;
    oauthAccessTokenEncrypted: string | null;
    oauthRefreshTokenEncrypted: string | null;
    tokenExpiresAt: Date | null;
  }) {
    const expiresAt = importRow.tokenExpiresAt?.getTime();
    const accessTokenEncrypted = importRow.oauthAccessTokenEncrypted;
    const hasUsableAccessToken =
      accessTokenEncrypted &&
      (!expiresAt || expiresAt > Date.now() + 60_000);

    if (hasUsableAccessToken) {
      return this.tokenCrypto.decrypt(accessTokenEncrypted);
    }

    if (!importRow.oauthRefreshTokenEncrypted) {
      throw new BadRequestException("Google OAuth token expired");
    }

    const refreshToken = this.tokenCrypto.decrypt(
      importRow.oauthRefreshTokenEncrypted,
    );
    const refreshed = await this.archiveService.refreshAccessToken(refreshToken);
    await this.repository.updateOAuthTokens(importRow.id, {
      oauthAccessTokenEncrypted: this.tokenCrypto.encrypt(refreshed.accessToken),
      tokenExpiresAt: refreshed.expiresAt,
    });

    return refreshed.accessToken;
  }

  private async getCounts(importId: string) {
    const rows = await this.repository.countItems(importId);
    let savedPlacesImported = 0;
    let visitsImported = 0;
    let skippedItems = 0;
    let manualReviewItems = 0;

    for (const row of rows) {
      if (
        row.kind === GoogleDataImportItemKind.saved_place &&
        row.status === GoogleDataImportItemStatus.matched
      ) {
        savedPlacesImported += row._count;
      }

      if (
        row.kind === GoogleDataImportItemKind.visit &&
        row.status === GoogleDataImportItemStatus.matched
      ) {
        visitsImported += row._count;
      }

      if (row.status === GoogleDataImportItemStatus.skipped) {
        skippedItems += row._count;
      }

      if (row.status === GoogleDataImportItemStatus.manual_review) {
        manualReviewItems += row._count;
      }
    }

    return {
      savedPlacesImported,
      visitsImported,
      skippedItems,
      manualReviewItems,
    };
  }

  private async getLearnedCategoryCount(userId: string) {
    const signals =
      await this.socialRepository.getUserRecommendationSignals(userId);
    return signals.importedPlaceCategoryIds.length;
  }

  private serializeImport(importRow: {
    id: string;
    status: string;
    requestedScopes: unknown;
    consentType: string;
    archiveJobId: string | null;
    archiveState?: string | null;
    archiveUrls?: unknown;
    tokenExpiresAt: Date | null;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
    _count?: { items: number };
  }) {
    return {
      id: importRow.id,
      status: importRow.status,
      requestedScopes: importRow.requestedScopes,
      consentType: importRow.consentType,
      archiveJobId: importRow.archiveJobId,
      archiveState: importRow.archiveState ?? null,
      archiveUrls: importRow.archiveUrls ?? null,
      tokenExpiresAt: importRow.tokenExpiresAt?.toISOString() ?? null,
      lastError: importRow.lastError,
      createdAt: importRow.createdAt.toISOString(),
      updatedAt: importRow.updatedAt.toISOString(),
      completedAt: importRow.completedAt?.toISOString() ?? null,
      totalItems: importRow._count?.items ?? 0,
    };
  }
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  if (value === null) {
    return {};
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => toPrismaJson(item));
  }

  if (typeof value === "object" && value !== null) {
    const json: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) {
        json[key] = toPrismaJson(item);
      }
    }
    return json;
  }

  return {};
}

function hasArchiveUrls(value: unknown) {
  return normalizeArchiveUrls(value).length > 0;
}

function normalizeGooglePlaceId(value: string) {
  const trimmed = value.trim();
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    decoded = trimmed;
  }
  const resourceNameMatch = decoded.match(/(?:^|\/)places\/([^/?#]+)/);
  return resourceNameMatch?.[1] ?? decoded;
}

function normalizeArchiveUrls(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}
