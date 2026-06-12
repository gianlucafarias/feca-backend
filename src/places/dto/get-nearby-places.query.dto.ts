import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

import { EXPLORE_INTENTS } from "../explore-context";

export class GetNearbyPlacesQueryDto {
  /** Si faltan, el backend usa lat/lng del perfil del usuario autenticado. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  /** Ciudad canónica del viewer; alinea curaciones admin con la ciudad activa. */
  @IsOptional()
  @IsString()
  cityGooglePlaceId?: string;

  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsIn(["cafe", "restaurant"])
  type?: "cafe" | "restaurant";

  /**
   * Intent de explore (p. ej. `work_2h`): alinea pool Google + ranking.
   * Si falta, se infiere de hora y `outingPreferences`.
   */
  @IsOptional()
  @IsIn(EXPLORE_INTENTS)
  intent?: (typeof EXPLORE_INTENTS)[number];

  /**
   * Contexto del cliente (home / secciones).
   * - `home_nearby`: carrusel general “Lugares cerca”
   * - `home_open_now`: solo `openNow` del mismo pool
   * - `home_friends_liked`: lugares con señal de gente que seguís
   * - `home_city` / `home_network`: compatibilidad con clientes viejos
   */
  @IsOptional()
  @IsIn([
    "home_city",
    "home_network",
    "home_nearby",
    "home_open_now",
    "home_friends_liked",
    "onboarding_past",
  ])
  variant?:
    | "home_city"
    | "home_network"
    | "home_nearby"
    | "home_open_now"
    | "home_friends_liked"
    | "onboarding_past";

  /**
   * Opcional: el cliente manda p. ej. `Date.now()` al hacer pull-to-refresh para
   * reordenar el mismo pool de candidatos sin invalidar la caché de Google.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  rotate?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(20)
  limit = 20;

  /** Devuelve desglose de scoring por lugar (solo para tunear recomendaciones). */
  @IsOptional()
  @Transform(({ value }) => value === "1" || value === "true" || value === true)
  @IsBoolean()
  debugScores?: boolean;
}
