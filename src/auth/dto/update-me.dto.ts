import { Transform } from "class-transformer";
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class UpdateMeDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== "string") {
      return value;
    }

    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-z0-9-]+$/)
  username?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeOptionalText(value))
  @IsString()
  @MaxLength(50)
  displayName?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeOptionalText(value))
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeOptionalText(value))
  @IsString()
  @MaxLength(200)
  cityGooglePlaceId?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsOptional()
  @IsIn(["everyone", "from_following_only"])
  groupInvitePolicy?: "everyone" | "from_following_only";
}
