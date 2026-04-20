import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { Type } from "class-transformer";

export class AddDiaryPlaceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  placeId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  googlePlaceId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  sessionToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  note?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;
}
