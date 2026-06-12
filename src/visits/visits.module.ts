import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import { PlacesModule } from "../places/places.module";
import { SocialModule } from "../social/social.module";
import { VisitsController } from "./visits.controller";
import { VisitPlaceTagsController } from "./visit-place-tags.controller";
import { VisitsService } from "./visits.service";

@Module({
  imports: [InfrastructureModule, AuthModule, PlacesModule, SocialModule],
  controllers: [VisitsController, VisitPlaceTagsController],
  providers: [VisitsService],
})
export class VisitsModule {}
