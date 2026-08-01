import { Controller, Get, Param } from "@nestjs/common";

import { SocialGroupsService } from "./social-groups.service";

/** Endpoints sin sesión usados por los enlaces públicos de invitación. */
@Controller("v1/group-invites")
export class GroupInvitesController {
  constructor(private readonly groupsService: SocialGroupsService) {}

  @Get(":code")
  getPreview(@Param("code") code: string) {
    return this.groupsService.getGroupInvitePreview(code);
  }
}
