import { IsBoolean } from "class-validator";

export class PatchMeEditorDto {
  @IsBoolean()
  isEditor!: boolean;
}
