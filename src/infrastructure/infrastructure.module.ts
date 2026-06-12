import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { GooglePlacesClient } from "./google-places/google-places.client";
import { CitiesRepository } from "./repositories/cities.repository";
import { NotificationsRepository } from "./repositories/notifications.repository";
import { PlaceCurationRepository } from "./repositories/place-curation.repository";
import { PlacesRepository } from "./repositories/places.repository";
import { SocialDiariesRepository } from "./repositories/social/social-diaries.repository";
import { SocialFeedRepository } from "./repositories/social/social-feed.repository";
import { SocialGraphRepository } from "./repositories/social/social-graph.repository";
import { SocialGroupMembershipRepository } from "./repositories/social/social-group-membership.repository";
import { SocialGroupEventsRepository } from "./repositories/social/social-group-events.repository";
import { SocialGroupsRepository } from "./repositories/social/social-groups.repository";
import { SocialPlaceContextRepository } from "./repositories/social/social-place-context.repository";
import { SocialRepositorySupport } from "./repositories/social/social.repository.support";
import { SocialVisitsRepository } from "./repositories/social/social-visits.repository";
import { SocialRepository } from "./repositories/social.repository";
import { VisitPlaceTagsRepository } from "./repositories/visit-place-tags.repository";

@Module({
  imports: [DatabaseModule],
  providers: [
    CitiesRepository,
    NotificationsRepository,
    PlaceCurationRepository,
    PlacesRepository,
    SocialRepositorySupport,
    SocialFeedRepository,
    SocialGraphRepository,
    SocialVisitsRepository,
    SocialGroupEventsRepository,
    SocialGroupMembershipRepository,
    SocialGroupsRepository,
    SocialDiariesRepository,
    SocialPlaceContextRepository,
    SocialRepository,
    VisitPlaceTagsRepository,
    GooglePlacesClient,
  ],
  exports: [
    CitiesRepository,
    NotificationsRepository,
    PlaceCurationRepository,
    PlacesRepository,
    SocialRepository,
    VisitPlaceTagsRepository,
    GooglePlacesClient,
  ],
})
export class InfrastructureModule {}
