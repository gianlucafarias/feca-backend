import { Controller, Get, Query } from "@nestjs/common";

import { GoogleDataImportOAuthCallbackQueryDto } from "./dto/google-data-import-oauth-callback.query.dto";
import { GoogleDataPortabilityImportService } from "./google-data-portability-import.service";

@Controller("v1/google-data-imports/oauth")
export class GoogleDataPortabilityOAuthController {
  constructor(
    private readonly importService: GoogleDataPortabilityImportService,
  ) {}

  @Get("callback")
  callback(@Query() query: GoogleDataImportOAuthCallbackQueryDto) {
    return this.importService.handleOAuthCallback(query);
  }
}
