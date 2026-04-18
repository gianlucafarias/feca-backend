import { Transform, Type } from "class-transformer";
import { IsIn, IsNumber, IsOptional, IsString, MaxLength } from "class-validator";

import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export const FEED_MODES = ["network", "nearby", "now", "city"] as const;

export type FeedMode = (typeof FEED_MODES)[number];

export class FeedQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(FEED_MODES)
  mode: FeedMode = "network";

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  /**
   * Con `mode=city`, filtra por esta ciudad canónica (Google Place ID de la localidad).
   * Si falta, se usa la ciudad guardada en el perfil del usuario.
   */
  @IsOptional()
  @Transform(({ value }) => normalizeOptionalText(value))
  @IsString()
  @MaxLength(200)
  cityGooglePlaceId?: string;
}
