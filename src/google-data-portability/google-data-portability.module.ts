import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import { PlacesModule } from "../places/places.module";
import { GoogleDataPortabilityArchiveParserService } from "./google-data-portability-archive-parser.service";
import { GoogleDataPortabilityArchiveService } from "./google-data-portability-archive.service";
import { GoogleDataPortabilityAuthService } from "./google-data-portability-auth.service";
import { GoogleDataPortabilityController } from "./google-data-portability.controller";
import { GoogleDataImportWorker } from "./google-data-import.worker";
import { GoogleDataPortabilityImportService } from "./google-data-portability-import.service";
import { GoogleDataPortabilityOAuthController } from "./google-data-portability-oauth.controller";
import { GoogleDataPortabilityParserService } from "./google-data-portability-parser.service";
import { GoogleDataPortabilityRepository } from "./google-data-portability.repository";
import { GoogleDataPortabilityTokenCryptoService } from "./google-data-portability-token-crypto.service";

@Module({
  imports: [AuthModule, DatabaseModule, InfrastructureModule, PlacesModule],
  controllers: [
    GoogleDataPortabilityController,
    GoogleDataPortabilityOAuthController,
  ],
  providers: [
    GoogleDataPortabilityArchiveParserService,
    GoogleDataPortabilityArchiveService,
    GoogleDataPortabilityAuthService,
    GoogleDataPortabilityImportService,
    GoogleDataPortabilityParserService,
    GoogleDataPortabilityRepository,
    GoogleDataPortabilityTokenCryptoService,
    GoogleDataImportWorker,
  ],
})
export class GoogleDataPortabilityModule {}
