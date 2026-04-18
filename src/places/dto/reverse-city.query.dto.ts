import { Type } from "class-transformer";
import { IsNumber } from "class-validator";

export class ReverseCityQueryDto {
  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  lng!: number;
}
