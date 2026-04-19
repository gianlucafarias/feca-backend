import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class SuggestedOnboardingUsersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit = 6;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  cityGooglePlaceId?: string;
}
