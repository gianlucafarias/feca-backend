import { IsBoolean, IsEnum, IsIn, IsOptional } from "class-validator";
import { ContentVisibility } from "@prisma/client";

export class UpdateSocialSettingsDto {
  @IsOptional()
  @IsEnum(ContentVisibility)
  activityVisibility?: ContentVisibility;

  @IsOptional()
  @IsEnum(ContentVisibility)
  diaryVisibility?: ContentVisibility;

  @IsOptional()
  @IsIn(["everyone", "from_following_only"])
  groupInvitePolicy?: "everyone" | "from_following_only";

  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;
}
