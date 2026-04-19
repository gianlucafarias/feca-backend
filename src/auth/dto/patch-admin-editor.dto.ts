import { IsBoolean } from "class-validator";

export class PatchAdminEditorDto {
  @IsBoolean()
  isEditor!: boolean;
}
