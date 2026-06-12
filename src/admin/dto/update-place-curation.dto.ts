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
} from "class-validator";

export class UpdatePlaceCurationDto {
  @IsOptional()
  @IsString()
  cityId?: string | null;

  @IsOptional()
  @IsString()
  cityGooglePlaceId?: string | null;

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
  label?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @IsOptional()
  @IsBoolean()
  hiddenFromApp?: boolean;
}
