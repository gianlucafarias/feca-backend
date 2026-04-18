import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateVisitDto {
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
  @MaxLength(120)
  placeName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  placeAddress?: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsString()
  note = "";

  @IsArray()
  @IsString({ each: true })
  tags: string[] = [];

  @IsOptional()
  @IsString()
  @MaxLength(240)
  orderedItems?: string;

  @IsOptional()
  @IsIn(["yes", "maybe", "no"])
  wouldReturn?: "yes" | "maybe" | "no";

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  noiseLevel?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  wifiQuality?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  waitLevel?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3)
  priceTier?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls: string[] = [];

  @IsDateString()
  visitedAt!: string;
}
