import { IsIn, IsOptional, IsString } from "class-validator";

export class CreateGoogleDataImportDto {
  @IsOptional()
  @IsString()
  @IsIn(["one_time", "time_based"])
  consentType?: "one_time" | "time_based";
}
