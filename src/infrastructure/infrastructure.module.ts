import { Module } from "@nestjs/common";

import { AppConfigService } from "../config/app-config.service";
import { DatabaseModule } from "../database/database.module";
import { GooglePlacesClient } from "./google-places/google-places.client";
import { CitiesRepository } from "./repositories/cities.repository";
import { NotificationsRepository } from "./repositories/notifications.repository";
import { PlacesRepository } from "./repositories/places.repository";
import { SocialRepository } from "./repositories/social.repository";
import { VisitsRepository } from "./repositories/visits.repository";

@Module({
  imports: [DatabaseModule],
  providers: [
    AppConfigService,
    CitiesRepository,
    NotificationsRepository,
    PlacesRepository,
    SocialRepository,
    VisitsRepository,
    GooglePlacesClient,
  ],
  exports: [
    AppConfigService,
    CitiesRepository,
    NotificationsRepository,
    PlacesRepository,
    SocialRepository,
    VisitsRepository,
    GooglePlacesClient,
  ],
})
export class InfrastructureModule {}
