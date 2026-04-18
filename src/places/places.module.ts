import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import { CitiesController } from "./cities.controller";
import { ExploreController } from "./explore.controller";
import { PlacesController } from "./places.controller";
import { PlacesService } from "./places.service";

@Module({
  imports: [InfrastructureModule, AuthModule],
  controllers: [CitiesController, ExploreController, PlacesController],
  providers: [PlacesService],
  exports: [PlacesService],
})
export class PlacesModule {}
