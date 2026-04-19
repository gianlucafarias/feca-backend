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

  /** Contexto del cliente (p. ej. home) para variar ranking/caché sin cambiar coords. */
  @IsOptional()
  @IsIn(["home_city", "home_network"])
  variant?: "home_city" | "home_network";

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(20)
  limit = 20;
}
