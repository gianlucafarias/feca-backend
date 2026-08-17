import { Type } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListPlanMessagesQueryDto {
  @IsOptional()
  @IsDateString()
  since?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @IsOptional()
  @IsString()
  cursor?: string;
}
