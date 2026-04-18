import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class AutocompletePlacesQueryDto {
  @IsString()
  q = "";

  @IsOptional()
  @IsString()
  city?: string;

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
  sessionToken?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(10)
  limit = 5;
}

