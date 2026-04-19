import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import { PlacesModule } from "../places/places.module";
import { DiariesController } from "./diaries.controller";
import { FeedController } from "./feed.controller";
import { HomeController } from "./home.controller";
import { GroupsController } from "./groups.controller";
import { MeController } from "./me.controller";
import { NotificationsService } from "./notifications.service";
import { PlaceSavesController } from "./place-saves.controller";
import { SocialService } from "./social.service";
import { TasteController } from "./taste.controller";
import { UsersController } from "./users.controller";

@Module({
  imports: [InfrastructureModule, PlacesModule, AuthModule],
  controllers: [
    DiariesController,
    FeedController,
    GroupsController,
    HomeController,
    MeController,
    PlaceSavesController,
    TasteController,
    UsersController,
  ],
  providers: [NotificationsService, SocialService],
  exports: [NotificationsService, SocialService],
})
export class SocialModule {}
