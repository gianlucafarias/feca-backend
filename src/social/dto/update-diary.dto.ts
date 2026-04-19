import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateDiaryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  intro?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  editorialReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImageUrl?: string;

  @IsOptional()
  @IsIn(["private", "unlisted", "public"])
  visibility?: "private" | "unlisted" | "public";

  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}
