import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import { PlacesModule } from "../places/places.module";
import { DiariesController } from "./diaries.controller";
import { FeedController } from "./feed.controller";
import { HomeController } from "./home.controller";
import { GroupsController } from "./groups.controller";
import { InternalNotificationsController } from "./internal-notifications.controller";
import { MeController } from "./me.controller";
import { NotificationsAutomationService } from "./notifications-automation.service";
import { OnboardingController } from "./onboarding.controller";
import { NotificationsService } from "./notifications.service";
import { PlaceSavesController } from "./place-saves.controller";
import { PushDispatchService } from "./push-dispatch.service";
import { SocialService } from "./social.service";
import { TasteController } from "./taste.controller";
import { UsersController } from "./users.controller";

@Module({
  imports: [InfrastructureModule, PlacesModule, AuthModule, DatabaseModule],
  controllers: [
    DiariesController,
    FeedController,
    GroupsController,
    HomeController,
    InternalNotificationsController,
    MeController,
    OnboardingController,
    PlaceSavesController,
    TasteController,
    UsersController,
  ],
  providers: [
    NotificationsService,
    NotificationsAutomationService,
    PushDispatchService,
    SocialService,
  ],
  exports: [NotificationsService, SocialService],
})
export class SocialModule {}
