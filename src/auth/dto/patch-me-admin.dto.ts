import { IsBoolean } from "class-validator";

export class PatchMeAdminDto {
  @IsBoolean()
  isAdmin!: boolean;
}
