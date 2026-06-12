import { IsBoolean, IsString, ValidateIf } from "class-validator";

export class SetPlaceVisibilityDto {
  @ValidateIf((body) => !body.googlePlaceId?.trim())
  @IsString()
  placeId?: string;

  @ValidateIf((body) => !body.placeId?.trim())
  @IsString()
  googlePlaceId?: string;

  @IsBoolean()
  hiddenFromApp!: boolean;
}
