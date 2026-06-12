import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import { CitiesController } from "./cities.controller";
import { ExploreController } from "./explore.controller";
import { PlacesAutocompleteService } from "./places-autocomplete.service";
import { PlacesCitiesService } from "./places-cities.service";
import { PlacesGoogleCacheService } from "./places-google-cache.service";
import { PlacesNearbyPoolService } from "./places-nearby-pool.service";
import { PlacesNearbyPresentationService } from "./places-nearby-presentation.service";
import { PlacesNearbyService } from "./places-nearby.service";
import { PlacesProfileService } from "./places-profile.service";
import { PlacesController } from "./places.controller";
import { PlacesService } from "./places.service";

@Module({
  imports: [InfrastructureModule, AuthModule],
  controllers: [CitiesController, ExploreController, PlacesController],
  providers: [
    PlacesGoogleCacheService,
    PlacesCitiesService,
    PlacesAutocompleteService,
    PlacesProfileService,
    PlacesNearbyPresentationService,
    PlacesNearbyPoolService,
    PlacesNearbyService,
    PlacesService,
  ],
  exports: [PlacesService],
})
export class PlacesModule {}
