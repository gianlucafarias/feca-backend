import { Controller, Get } from "@nestjs/common";

import { SocialService } from "./social.service";

@Controller("v1")
export class TasteController {
  constructor(private readonly socialService: SocialService) {}

  @Get("taste-options")
  getTasteOptions() {
    return this.socialService.getTasteOptions();
  }
}
