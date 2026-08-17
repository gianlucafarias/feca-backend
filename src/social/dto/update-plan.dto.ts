import {
  IsDateString,
  IsOptional,
  IsString,
  IsIn,
  MaxLength,
  MinLength,
} from "class-validator";
export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsIn(["open", "request_approval", "invite_only"])
  joinPolicy?: "open" | "request_approval" | "invite_only";

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  placeId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  googlePlaceId?: string;
}
