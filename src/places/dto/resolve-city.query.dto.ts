import { IsString, MinLength } from "class-validator";

export class ResolveCityQueryDto {
  @IsString()
  @MinLength(1)
  cityGooglePlaceId!: string;
}
