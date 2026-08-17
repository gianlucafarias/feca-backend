import { IsString, MaxLength, MinLength } from "class-validator";

export class CreatePlanReportDto {
  @IsString()
  @MinLength(1)
  @MaxLength(280)
  reason!: string;
}
