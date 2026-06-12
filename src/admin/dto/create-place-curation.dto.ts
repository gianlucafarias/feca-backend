import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

export class CreatePlaceCurationDto {
  /** ID interno FECA. Alternativa: `googlePlaceId` (el backend hace resolve y persiste en DB). */
  @ValidateIf((body) => !body.googlePlaceId?.trim())
  @IsString()
  placeId?: string;

  @ValidateIf((body) => !body.placeId?.trim())
  @IsString()
  googlePlaceId?: string;

  @IsOptional()
  @IsString()
  cityId?: string;

  @IsOptional()
  @IsString()
  cityGooglePlaceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  boostScore?: number;

  @IsOptional()
  @IsBoolean()
  isCityPick?: boolean;

  @IsOptional()
  @IsBoolean()
  showRecommendedBadge?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  /** ISO 8601. Pasada esa fecha la curación deja de aplicar en ranking. */
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  hiddenFromApp?: boolean;
}
