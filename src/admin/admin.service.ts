import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { CitiesRepository } from "../infrastructure/repositories/cities.repository";
import { PlaceCurationRepository } from "../infrastructure/repositories/place-curation.repository";
import { PlacesRepository } from "../infrastructure/repositories/places.repository";
import { PlacesService } from "../places/places.service";
import type { PlaceRecord } from "../types";
import type { CreatePlaceCurationDto } from "./dto/create-place-curation.dto";
import type { SetPlaceVisibilityDto } from "./dto/set-place-visibility.dto";
import type { UpdatePlaceCurationDto } from "./dto/update-place-curation.dto";

@Injectable()
export class AdminService {
  constructor(
    private readonly citiesRepository: CitiesRepository,
    private readonly placeCurationRepository: PlaceCurationRepository,
    private readonly placesRepository: PlacesRepository,
    private readonly placesService: PlacesService,
  ) {}

  listCities() {
    return this.citiesRepository.listAll();
  }

  async listCurations(cityId?: string, cityGooglePlaceId?: string) {
    const resolvedCityId = await this.resolveCityFilter(cityId, cityGooglePlaceId);
    return this.placeCurationRepository.listByCity(resolvedCityId);
  }

  async createCuration(adminUserId: string, body: CreatePlaceCurationDto) {
    const placeId = await this.resolvePlaceId(body);
    const place = await this.placesRepository.getPlaceById(placeId);
    if (!place) {
      throw new NotFoundException("Lugar no encontrado.");
    }

    const cityId = await this.resolvePlaceCityId(place);

    if (body.hiddenFromApp != null) {
      await this.placesRepository.setHiddenFromApp(placeId, body.hiddenFromApp);
    }

    return this.placeCurationRepository.create({
      placeId,
      cityId,
      boostScore: body.hiddenFromApp ? 0 : (body.boostScore ?? 0),
      isCityPick: body.hiddenFromApp ? false : (body.isCityPick ?? false),
      showRecommendedBadge: body.hiddenFromApp
        ? false
        : (body.showRecommendedBadge ?? false),
      label: body.label ?? null,
      expiresAt: parseOptionalExpiresAt(body.expiresAt),
      createdById: adminUserId,
    });
  }

  async updateCuration(id: string, body: UpdatePlaceCurationDto) {
    const existing = await this.placeCurationRepository.findById(id);
    if (!existing) {
      throw new NotFoundException("Curación no encontrada.");
    }

    if (body.hiddenFromApp != null) {
      await this.placesRepository.setHiddenFromApp(
        existing.placeId,
        body.hiddenFromApp,
      );
    }

    const hide = body.hiddenFromApp === true;

    return this.placeCurationRepository.update(id, {
      boostScore: hide ? 0 : body.boostScore,
      isCityPick: hide ? false : body.isCityPick,
      showRecommendedBadge: hide ? false : body.showRecommendedBadge,
      label: body.label,
      active: hide ? false : body.active,
      expiresAt:
        body.expiresAt === undefined
          ? undefined
          : parseOptionalExpiresAt(body.expiresAt),
    });
  }

  async setPlaceVisibility(body: SetPlaceVisibilityDto) {
    const placeId = await this.resolvePlaceId({
      placeId: body.placeId,
      googlePlaceId: body.googlePlaceId,
    });
    const place = await this.placesRepository.setHiddenFromApp(
      placeId,
      body.hiddenFromApp,
    );

    return {
      placeId: place.id,
      googlePlaceId: place.sourcePlaceId ?? null,
      hiddenFromApp: place.hiddenFromApp ?? false,
    };
  }

  async deleteCuration(id: string) {
    const existing = await this.placeCurationRepository.findById(id);
    if (!existing) {
      throw new NotFoundException("Curación no encontrada.");
    }

    await this.placeCurationRepository.delete(id);
    return { ok: true };
  }

  private async resolveCityFilter(cityId?: string, cityGooglePlaceId?: string) {
    const trimmedId = cityId?.trim();
    if (trimmedId) {
      return trimmedId;
    }

    const trimmedGoogleId = cityGooglePlaceId?.trim();
    if (!trimmedGoogleId) {
      return undefined;
    }

    const city = await this.citiesRepository.findCityByGooglePlaceId(trimmedGoogleId);
    return city?.id;
  }

  private async resolvePlaceCityId(place: PlaceRecord) {
    if (place.cityId?.trim()) {
      return place.cityId.trim();
    }

    if (place.lat != null && place.lng != null) {
      const city = await this.placesService.getOrCreateCityRecordFromCoordinates(
        place.lat,
        place.lng,
      );
      await this.placesRepository.patchPlaceCity(place.id, city.id, city.name);
      return city.id;
    }

    throw new BadRequestException(
      "No pudimos determinar la ciudad del lugar. Abrí su ficha en la app y reintentá.",
    );
  }

  private async resolvePlaceId(body: CreatePlaceCurationDto) {
    const placeId = body.placeId?.trim();
    if (placeId) {
      return placeId;
    }

    const googlePlaceId = body.googlePlaceId?.trim();
    if (!googlePlaceId) {
      throw new BadRequestException(
        "Indicá placeId o googlePlaceId para curar un lugar.",
      );
    }

    const place = await this.placesService.resolve({
      source: "google",
      sourcePlaceId: googlePlaceId,
    });

    return place.id;
  }
}

function parseOptionalExpiresAt(value?: string | null) {
  if (value == null || value === "") {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException("expiresAt debe ser una fecha ISO válida.");
  }

  return date;
}
