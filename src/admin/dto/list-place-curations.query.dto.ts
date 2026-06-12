import { IsOptional, IsString } from "class-validator";

export class ListPlaceCurationsQueryDto {
  @IsOptional()
  @IsString()
  cityId?: string;

  @IsOptional()
  @IsString()
  cityGooglePlaceId?: string;
}
