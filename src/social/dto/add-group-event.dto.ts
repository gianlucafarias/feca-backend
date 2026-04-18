import { IsDateString, IsOptional, IsString, MinLength } from "class-validator";

export class AddGroupEventDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  placeId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  googlePlaceId?: string;

  @IsDateString()
  date!: string;
}
