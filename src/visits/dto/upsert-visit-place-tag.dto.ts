import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpsertVisitPlaceTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  label!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  placeId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  googlePlaceId?: string;
}
