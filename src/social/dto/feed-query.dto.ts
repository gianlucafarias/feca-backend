import { Type } from "class-transformer";
import { IsIn, IsNumber, IsOptional, IsString } from "class-validator";

import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";

export const FEED_MODES = ["network", "nearby", "now", "city"] as const;

export type FeedMode = (typeof FEED_MODES)[number];

export class FeedQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(FEED_MODES)
  mode: FeedMode = "network";

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;
}
