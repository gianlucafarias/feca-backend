import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";

import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";

export class ListNotificationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    value === true || value === "true" || value === "1",
  )
  @IsBoolean()
  unreadOnly = false;
}
