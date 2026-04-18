import { Type } from "class-transformer";
import { IsIn, IsNumber, IsOptional, Max, Min } from "class-validator";

import { EXPLORE_INTENTS } from "../explore-context";

export class ExploreContextQueryDto {
  @IsIn(EXPLORE_INTENTS)
  intent!: (typeof EXPLORE_INTENTS)[number];

  /** Si faltan, el backend usa lat/lng del perfil del usuario autenticado. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(20)
  limit = 12;
}
