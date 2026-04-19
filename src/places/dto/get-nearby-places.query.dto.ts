import { Type } from "class-transformer";
import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

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

  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsIn(["cafe", "restaurant"])
  type?: "cafe" | "restaurant";

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
  ])
  variant?:
    | "home_city"
    | "home_network"
    | "home_nearby"
    | "home_open_now"
    | "home_friends_liked";

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
}
