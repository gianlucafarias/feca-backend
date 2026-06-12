import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AccessTokenGuard } from "../common/guards/access-token.guard";
import type { AccessTokenPayload } from "../auth/auth.types";
import { CreateGoogleDataImportDto } from "./dto/create-google-data-import.dto";
import { IngestSavedCollectionsDto } from "./dto/ingest-saved-collections.dto";
import { GoogleDataPortabilityImportService } from "./google-data-portability-import.service";

@Controller("v1/me/google-data-imports")
@UseGuards(AccessTokenGuard)
export class GoogleDataPortabilityController {
  constructor(
    private readonly importService: GoogleDataPortabilityImportService,
  ) {}

  @Post()
  createImport(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateGoogleDataImportDto,
  ) {
    return this.importService.createImport(user.sub, body.consentType);
  }

  @Get(":id")
  getImport(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") importId: string,
  ) {
    return this.importService.getImport(user.sub, importId);
  }

  @Post(":id/retry")
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  retryImport(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") importId: string,
  ) {
    return this.importService.enqueueRetry(user.sub, importId);
  }

  @Post(":id/sync-state")
  syncArchiveState(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") importId: string,
  ) {
    return this.importService.syncArchiveState(user.sub, importId);
  }

  @Post(":id/process-archive")
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  processArchive(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") importId: string,
  ) {
    return this.importService.enqueueProcessCompletedArchive(user.sub, importId);
  }

  @Post(":id/saved-collections")
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  ingestSavedCollections(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") importId: string,
    @Body() body: IngestSavedCollectionsDto,
  ) {
    return this.importService.enqueueIngestSavedCollections(
      user.sub,
      importId,
      body.items,
    );
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteImport(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") importId: string,
  ) {
    return this.importService.deleteImport(user.sub, importId);
  }
}
