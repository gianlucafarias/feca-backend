import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  ArrayMaxSize,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class GoogleSavedCollectionItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  sourceKey?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  url?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  placeUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  googlePlaceId?: string;

  @IsOptional()
  @IsObject()
  rawPayload?: Record<string, unknown>;
}

export class IngestSavedCollectionsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => GoogleSavedCollectionItemDto)
  items!: GoogleSavedCollectionItemDto[];
}
