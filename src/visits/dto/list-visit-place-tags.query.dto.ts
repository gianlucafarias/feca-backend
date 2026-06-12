import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class ListVisitPlaceTagsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  placeId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  googlePlaceId?: string;
}
