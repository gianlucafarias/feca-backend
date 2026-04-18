import { IsEnum, IsOptional } from "class-validator";
import { ContentVisibility, GroupInvitePolicy } from "@prisma/client";

export class UpdateSocialSettingsDto {
  @IsOptional()
  @IsEnum(ContentVisibility)
  activityVisibility?: ContentVisibility;

  @IsOptional()
  @IsEnum(ContentVisibility)
  diaryVisibility?: ContentVisibility;

  @IsOptional()
  @IsEnum(GroupInvitePolicy)
  groupInvitePolicy?: GroupInvitePolicy;
}
