import { IsOptional, IsString, MinLength } from "class-validator";

export class GoogleDataImportOAuthCallbackQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  state?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  error?: string;
}
