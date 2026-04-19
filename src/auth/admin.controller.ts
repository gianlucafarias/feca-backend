import { Body, Controller, Patch, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AccessTokenGuard } from "../common/guards/access-token.guard";
import { AdminGuard } from "../common/guards/admin.guard";
import type { AccessTokenPayload } from "./auth.types";
import { AuthService } from "./auth.service";
import { PatchAdminEditorDto } from "./dto/patch-admin-editor.dto";

@Controller("v1/admin")
@UseGuards(AccessTokenGuard, AdminGuard)
export class AdminController {
  constructor(private readonly authService: AuthService) {}

  @Patch("me/editor")
  patchMyEditor(@CurrentUser() user: AccessTokenPayload, @Body() body: PatchAdminEditorDto) {
    return this.authService.setMyEditorFlag(user.sub, body.isEditor);
  }
}
